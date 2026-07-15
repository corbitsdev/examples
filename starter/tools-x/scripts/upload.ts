import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  readVerifiedArtifact,
  type PackageManifest,
} from "./package-lib";

const REGISTRY_NAME = "workspace-builtins";

type FetchLike = typeof fetch;

type UploadOptions = {
  hubURL: string;
  email: string;
  password: string;
  tenantSlug: string;
  packageRoot: string;
  fetch?: FetchLike;
};

export type UploadSummary = {
  tenantId: string;
  assetId: string;
  filename: string;
  integrity: string;
  size: number;
  uploaded: boolean;
  commit: string | null;
  pin: { name: typeof PACKAGE_NAME; version: typeof PACKAGE_VERSION };
};

type CookieJar = Map<string, string>;

export function contentAddressedFilename(manifest: PackageManifest): string {
  const match = /^sha512-(.+)$/u.exec(manifest.integrity);
  if (match?.[1] === undefined) {
    throw new Error("package manifest integrity must use sha512 SRI");
  }
  const digest = Buffer.from(match[1], "base64").toString("hex");
  if (digest.length !== 128) {
    throw new Error("package manifest sha512 digest has an invalid length");
  }
  return manifest.filename.replace(/\.tgz$/u, `+sha512-${digest}.tgz`);
}

function normalizeHubURL(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("HUB_URL is not a valid URL");
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("HUB_URL must use HTTPS unless it targets loopback");
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("HUB_URL must not contain credentials, query, or fragment");
  }
  return url.href.replace(/\/$/u, "");
}

function absorbCookies(jar: CookieJar, response: Response): void {
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";", 1)[0];
    const separator = pair?.indexOf("=") ?? -1;
    if (pair === undefined || separator <= 0) continue;
    jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(jar: CookieJar): string | undefined {
  if (jar.size === 0) return undefined;
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function responseData(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) return response.json();
  const text = await response.text();
  return text === "" ? null : text;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} was not a JSON object`);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} was not a JSON array`);
  return value;
}

function stringField(
  value: Record<string, unknown>,
  name: string,
  label: string,
): string {
  const field = value[name];
  if (typeof field !== "string") {
    throw new Error(`${label}.${name} was not a string`);
  }
  return field;
}

async function uploadVerifiedArtifact(
  opts: UploadOptions,
  manifest: PackageManifest,
  bytes: Uint8Array,
): Promise<UploadSummary> {
  const hubURL = normalizeHubURL(opts.hubURL);
  const fetchImpl = opts.fetch ?? fetch;
  const cookies: CookieJar = new Map();

  const request = async (
    method: string,
    apiPath: string,
    body?: unknown,
  ): Promise<{ response: Response; data: unknown }> => {
    const cookie = cookieHeader(cookies);
    const response = await fetchImpl(`${hubURL}${apiPath}`, {
      method,
      redirect: "manual",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie === undefined ? {} : { Cookie: cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    absorbCookies(cookies, response);
    return { response, data: await responseData(response) };
  };

  const signIn = await request("POST", "/api/auth/sign-in/email", {
    email: opts.email,
    password: opts.password,
  });
  if (signIn.response.status !== 200) {
    throw new Error(
      `Hub sign-in failed with status ${String(signIn.response.status)}`,
    );
  }

  let cursor: string | null = null;
  let tenantId: string | undefined;
  do {
    const query =
      cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`;
    const page = await request("GET", `/api/me/principals${query}`);
    if (page.response.status !== 200) {
      throw new Error(
        `Hub principal lookup failed with status ${String(page.response.status)}`,
      );
    }
    const payload = objectValue(page.data, "principal lookup");
    for (const item of arrayValue(payload["data"], "principal lookup.data")) {
      const principal = objectValue(item, "principal");
      if (
        principal["tenantSlug"] === opts.tenantSlug &&
        principal["status"] === "active"
      ) {
        tenantId = stringField(principal, "tenantId", "principal");
        break;
      }
    }
    const next = payload["nextCursor"];
    if (next !== null && typeof next !== "string") {
      throw new Error("principal lookup.nextCursor had an invalid shape");
    }
    cursor = next;
  } while (tenantId === undefined && cursor !== null);
  if (tenantId === undefined) {
    throw new Error(
      `tenant slug ${JSON.stringify(opts.tenantSlug)} is not visible`,
    );
  }

  const tenantSegment = encodeURIComponent(tenantId);
  const assets = await request(
    "GET",
    `/api/tenants/${tenantSegment}/assets?kind=package-registry&inherited=false`,
  );
  if (assets.response.status !== 200) {
    throw new Error(
      `package-registry lookup failed with status ${String(assets.response.status)}`,
    );
  }
  const directMatches = arrayValue(assets.data, "asset lookup")
    .map((item) => objectValue(item, "asset"))
    .filter(
      (asset) =>
        asset["name"] === REGISTRY_NAME &&
        asset["kind"] === "package-registry" &&
        asset["tenantId"] === tenantId &&
        (asset["origin"] === undefined ||
          objectValue(asset["origin"], "asset.origin")["direct"] === true),
    );
  if (directMatches.length > 1) {
    throw new Error(`multiple direct ${REGISTRY_NAME} assets were returned`);
  }

  let assetId: string;
  const existingAsset = directMatches[0];
  if (existingAsset !== undefined) {
    assetId = stringField(existingAsset, "id", "asset");
  } else {
    const create = await request(
      "POST",
      `/api/tenants/${tenantSegment}/assets`,
      {
        kind: "package-registry",
        name: REGISTRY_NAME,
      },
    );
    if (create.response.status !== 201) {
      throw new Error(
        `workspace-builtins creation failed with status ${String(create.response.status)}`,
      );
    }
    const asset = objectValue(create.data, "created asset");
    if (
      asset["name"] !== REGISTRY_NAME ||
      asset["kind"] !== "package-registry" ||
      asset["tenantId"] !== tenantId
    ) {
      throw new Error(
        "created workspace-builtins asset did not match the request",
      );
    }
    assetId = stringField(asset, "id", "created asset");
  }

  const assetSegment = encodeURIComponent(assetId);
  const tarballsPath = `/api/tenants/${tenantSegment}/assets/${assetSegment}/tarballs`;
  const listTarballs = async (): Promise<Record<string, unknown>[]> => {
    const listed = await request("GET", tarballsPath);
    if (listed.response.status !== 200) {
      throw new Error(
        `tarball listing failed with status ${String(listed.response.status)}`,
      );
    }
    return arrayValue(listed.data, "tarball listing").map((item) =>
      objectValue(item, "tarball"),
    );
  };

  const before = await listTarballs();
  const uploadFilename = contentAddressedFilename(manifest);
  const versionFilenamePrefix = manifest.filename.replace(
    /\.tgz$/u,
    "+sha512-",
  );
  const existingVersionEntries = before.filter(
    (entry) =>
      entry["filename"] === manifest.filename ||
      (typeof entry["filename"] === "string" &&
        entry["filename"].startsWith(versionFilenamePrefix)),
  );
  const identical = existingVersionEntries.find(
    (entry) =>
      entry["integrity"] === manifest.integrity &&
      entry["size"] === manifest.size,
  );
  if (identical !== undefined) {
    return {
      tenantId,
      assetId,
      filename: stringField(identical, "filename", "tarball"),
      integrity: manifest.integrity,
      size: manifest.size,
      uploaded: false,
      commit: null,
      pin: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    };
  }
  if (existingVersionEntries.length > 0) {
    throw new Error(
      `${PACKAGE_NAME}@${PACKAGE_VERSION} already exists with different bytes; bump the package version`,
    );
  }

  // The registry's PUT endpoint overwrites by filename. A full-digest
  // content-addressed filename makes same-byte races harmless and gives
  // different-byte publishers different paths; the registry's duplicate
  // name@version validation then rejects the second commit without replacing
  // the first package.
  const uploadURL = `${hubURL}${tarballsPath}/${encodeURIComponent(uploadFilename)}`;
  let uploadResponse: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cookie = cookieHeader(cookies);
    uploadResponse = await fetchImpl(uploadURL, {
      method: "PUT",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/octet-stream",
        ...(cookie === undefined ? {} : { Cookie: cookie }),
      },
      body: bytes,
    });
    absorbCookies(cookies, uploadResponse);
    if (uploadResponse.status < 500 || attempt === 1) break;
    await uploadResponse.text();
  }
  if (uploadResponse === undefined || uploadResponse.status !== 200) {
    throw new Error(
      `tarball upload failed with status ${String(uploadResponse?.status ?? 0)}`,
    );
  }
  const uploadResult = objectValue(
    await responseData(uploadResponse),
    "tarball upload",
  );
  const commit = stringField(uploadResult, "commit", "tarball upload");
  const uploadIntegrity = stringField(
    uploadResult,
    "integrity",
    "tarball upload",
  );
  if (uploadIntegrity !== manifest.integrity) {
    throw new Error("Hub upload integrity does not match the local artifact");
  }

  const after = await listTarballs();
  const uploaded = after.find((entry) => entry["filename"] === uploadFilename);
  if (
    uploaded?.["integrity"] !== manifest.integrity ||
    uploaded["size"] !== manifest.size
  ) {
    throw new Error(
      "post-upload registry listing does not match the local artifact",
    );
  }

  return {
    tenantId,
    assetId,
    filename: uploadFilename,
    integrity: manifest.integrity,
    size: manifest.size,
    uploaded: true,
    commit,
    pin: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
  };
}

export async function uploadPackage(
  opts: UploadOptions,
): Promise<UploadSummary> {
  const { manifest, bytes } = await readVerifiedArtifact(opts.packageRoot);
  return uploadVerifiedArtifact(opts, manifest, bytes);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

if (import.meta.main) {
  try {
    const summary = await uploadPackage({
      hubURL: requireEnv("HUB_URL"),
      email: requireEnv("HUB_ADMIN_EMAIL"),
      password: requireEnv("HUB_ADMIN_PASSWORD"),
      tenantSlug: requireEnv("HUB_TENANT_SLUG"),
      packageRoot: import.meta.dir.replace(/\/scripts$/, ""),
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exitCode = 1;
  }
}
