import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ssri from "ssri";
import * as tar from "tar";

export const PACKAGE_NAME = "@intx/tools-x";
export const PACKAGE_VERSION = "0.1.0";
export const PACKED_ENTRY = "./dist/sidecar-bundle.js";
export const TARBALL_FILENAME = "@intx-tools-x-0.1.0.tgz";
export const MANIFEST_FILENAME = "package-manifest.json";

const EXPECTED_ARCHIVE_ENTRIES = [
  "package/",
  "package/LICENSE",
  "package/README.md",
  "package/THIRD_PARTY_NOTICES.md",
  "package/dist/",
  "package/dist/sidecar-bundle.js",
  "package/package.json",
] as const;

export type PackageManifest = {
  name: typeof PACKAGE_NAME;
  version: typeof PACKAGE_VERSION;
  filename: typeof TARBALL_FILENAME;
  size: number;
  integrity: string;
  tarballPath: string;
};

type WorkspacePackageJSON = {
  name?: unknown;
  version?: unknown;
  license?: unknown;
  type?: unknown;
  interchange?: { tools?: unknown };
};

function assertWorkspacePackageJSON(
  value: unknown,
): asserts value is Required<
  Pick<WorkspacePackageJSON, "name" | "version" | "license" | "type">
> & { interchange: { tools: string } } {
  if (typeof value !== "object" || value === null) {
    throw new Error("package.json must contain a JSON object");
  }
  const pkg = value as WorkspacePackageJSON;
  if (pkg.name !== PACKAGE_NAME || pkg.version !== PACKAGE_VERSION) {
    throw new Error(
      `expected ${PACKAGE_NAME}@${PACKAGE_VERSION} in package.json`,
    );
  }
  if (pkg.license !== "MIT" || pkg.type !== "module") {
    throw new Error("package.json must declare MIT and type=module");
  }
  if (pkg.interchange?.tools !== PACKED_ENTRY) {
    throw new Error(`package.json interchange.tools must be ${PACKED_ENTRY}`);
  }
}

function packedPackageJSON(pkg: WorkspacePackageJSON): Record<string, unknown> {
  return {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    type: pkg.type,
    interchange: { tools: PACKED_ENTRY },
  };
}

async function writePackedTree(
  packageRoot: string,
  stagingPackage: string,
): Promise<void> {
  const sourcePackage = JSON.parse(
    await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as unknown;
  assertWorkspacePackageJSON(sourcePackage);
  await fs.mkdir(path.join(stagingPackage, "dist"), { recursive: true });

  const build = await Bun.build({
    entrypoints: [path.join(packageRoot, "src", "sidecar-bundle.ts")],
    outdir: path.join(stagingPackage, "dist"),
    naming: "sidecar-bundle.js",
    target: "node",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!build.success) {
    throw new Error(
      `failed to bundle sidecar entry: ${build.logs.map(String).join("\n")}`,
    );
  }

  for (const filename of ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"]) {
    await fs.copyFile(
      path.join(packageRoot, filename),
      path.join(stagingPackage, filename),
    );
  }
  await fs.writeFile(
    path.join(stagingPackage, "package.json"),
    `${JSON.stringify(packedPackageJSON(sourcePackage), null, 2)}\n`,
  );

  await fs.chmod(stagingPackage, 0o755);
  await fs.chmod(path.join(stagingPackage, "dist"), 0o755);
  for (const filename of [
    "LICENSE",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "package.json",
    path.join("dist", "sidecar-bundle.js"),
  ]) {
    await fs.chmod(path.join(stagingPackage, filename), 0o644);
  }
}

export function calculateIntegrity(bytes: Uint8Array): string {
  return ssri.fromData(bytes, { algorithms: ["sha512"] }).toString();
}

function assertSafeArchivePath(entryPath: string): void {
  const normalized = entryPath.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    !normalized.startsWith("package/")
  ) {
    throw new Error(`unsafe tarball entry path: ${JSON.stringify(entryPath)}`);
  }
}

export async function verifyTarball(
  tarballPath: string,
  expectedIntegrity?: string,
): Promise<PackageManifest> {
  const bytes = new Uint8Array(await fs.readFile(tarballPath));
  return verifyTarballBytes(bytes, tarballPath, expectedIntegrity);
}

export async function verifyTarballBytes(
  bytes: Uint8Array,
  tarballLabel: string,
  expectedIntegrity?: string,
): Promise<PackageManifest> {
  const integrity = calculateIntegrity(bytes);
  if (expectedIntegrity !== undefined && integrity !== expectedIntegrity) {
    throw new Error("tarball integrity does not match the package manifest");
  }

  const verificationRoot = await fs.mkdtemp(
    path.join(tmpdir(), "tools-x-verify-"),
  );
  const snapshotPath = path.join(verificationRoot, "artifact.tgz");
  const extractionRoot = path.join(verificationRoot, "extracted");
  await fs.writeFile(snapshotPath, bytes, { flag: "wx", mode: 0o600 });
  await fs.mkdir(extractionRoot);
  try {
    const seen: string[] = [];
    let archiveError: Error | undefined;
    await tar.list({
      file: snapshotPath,
      onentry(entry) {
        try {
          assertSafeArchivePath(entry.path);
          if (entry.type === "SymbolicLink" || entry.type === "Link") {
            throw new Error(`tarball must not contain links: ${entry.path}`);
          }
        } catch (cause) {
          archiveError ??=
            cause instanceof Error ? cause : new Error(String(cause));
        }
        seen.push(entry.path);
      },
    });
    if (archiveError !== undefined) throw archiveError;
    if (JSON.stringify(seen) !== JSON.stringify(EXPECTED_ARCHIVE_ENTRIES)) {
      throw new Error(`unexpected tarball entries: ${JSON.stringify(seen)}`);
    }

    await tar.extract({
      file: snapshotPath,
      cwd: extractionRoot,
      strict: true,
    });
    const packageDir = path.join(extractionRoot, "package");
    const pkg = JSON.parse(
      await fs.readFile(path.join(packageDir, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    assertWorkspacePackageJSON(pkg);
    for (const forbidden of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
      "exports",
      "scripts",
    ]) {
      if (forbidden in pkg) {
        throw new Error(`packed package.json must not contain ${forbidden}`);
      }
    }

    const entryPath = path.resolve(packageDir, PACKED_ENTRY);
    const packagePrefix = `${path.resolve(packageDir)}${path.sep}`;
    if (!entryPath.startsWith(packagePrefix)) {
      throw new Error("interchange.tools escapes the packed package root");
    }
    await fs.access(entryPath);

    const authVariables = [
      "X_OAUTH1_CREDENTIAL",
      "X_API_KEY",
      "X_API_SECRET",
      "X_ACCESS_TOKEN",
      "X_ACCESS_TOKEN_SECRET",
    ] as const;
    const previousAuthVariables = new Map(
      authVariables.map((name) => [name, process.env[name]]),
    );
    for (const name of authVariables) delete process.env[name];
    process.env["X_ACCESS_TOKEN"] = "package-verification-token";
    try {
      const module = (await import(
        `${pathToFileURL(entryPath).href}?verify=${String(Date.now())}`
      )) as Record<string, unknown>;
      const factory = module["x"];
      if (
        typeof factory !== "function" ||
        (factory as { id?: unknown }).id !== "@intx/tools-x/sidecar-bundle"
      ) {
        throw new Error("packed entry does not export the expected x factory");
      }
      const bundle = (
        factory as (env: object) => {
          definitions?: unknown[];
        }
      )({});
      if (bundle.definitions?.length !== 23) {
        throw new Error("packed x factory does not expose 23 definitions");
      }
    } finally {
      for (const name of authVariables) {
        const previous = previousAuthVariables.get(name);
        if (previous === undefined) delete process.env[name];
        else process.env[name] = previous;
      }
    }
  } finally {
    await fs.rm(verificationRoot, { recursive: true, force: true });
  }

  return {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    filename: TARBALL_FILENAME,
    size: bytes.byteLength,
    integrity,
    tarballPath: tarballLabel,
  };
}

export async function packArtifact(
  packageRoot: string,
): Promise<PackageManifest> {
  const outputDir = path.join(packageRoot, "dist");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const stagingRoot = await fs.mkdtemp(path.join(tmpdir(), "tools-x-pack-"));
  try {
    const stagingPackage = path.join(stagingRoot, "package");
    await writePackedTree(packageRoot, stagingPackage);
    const tarballPath = path.join(outputDir, TARBALL_FILENAME);
    await tar.create(
      {
        cwd: stagingRoot,
        file: tarballPath,
        gzip: true,
        mtime: new Date(0),
        noDirRecurse: true,
        portable: true,
      },
      [...EXPECTED_ARCHIVE_ENTRIES],
    );
    const manifest = await verifyTarball(tarballPath);
    const relativeManifest: PackageManifest = {
      ...manifest,
      tarballPath: path.relative(packageRoot, tarballPath),
    };
    await fs.writeFile(
      path.join(outputDir, MANIFEST_FILENAME),
      `${JSON.stringify(relativeManifest, null, 2)}\n`,
    );
    return relativeManifest;
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function readAndVerifyManifest(
  packageRoot: string,
): Promise<PackageManifest> {
  return (await readVerifiedArtifact(packageRoot)).manifest;
}

export async function readVerifiedArtifact(packageRoot: string): Promise<{
  manifest: PackageManifest;
  bytes: Uint8Array;
}> {
  const raw = JSON.parse(
    await fs.readFile(
      path.join(packageRoot, "dist", MANIFEST_FILENAME),
      "utf8",
    ),
  ) as Partial<PackageManifest>;
  if (
    raw.name !== PACKAGE_NAME ||
    raw.version !== PACKAGE_VERSION ||
    raw.filename !== TARBALL_FILENAME ||
    typeof raw.size !== "number" ||
    typeof raw.integrity !== "string" ||
    typeof raw.tarballPath !== "string"
  ) {
    throw new Error("dist/package-manifest.json has an invalid shape");
  }
  const tarballPath = path.resolve(packageRoot, raw.tarballPath);
  const outputPrefix = `${path.resolve(packageRoot, "dist")}${path.sep}`;
  if (!tarballPath.startsWith(outputPrefix)) {
    throw new Error("package manifest tarballPath escapes dist/");
  }
  const bytes = new Uint8Array(await fs.readFile(tarballPath));
  const verified = await verifyTarballBytes(bytes, tarballPath, raw.integrity);
  if (verified.size !== raw.size) {
    throw new Error("tarball size does not match the package manifest");
  }
  return {
    manifest: { ...raw, tarballPath: raw.tarballPath } as PackageManifest,
    bytes,
  };
}
