import { beforeAll, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as tar from "tar";

import {
  readAndVerifyManifest,
  verifyTarball,
  type PackageManifest,
} from "./package-lib";
import { contentAddressedFilename, uploadPackage } from "./upload";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..");
let manifest: PackageManifest;

async function runPackCLI(): Promise<void> {
  const child = Bun.spawn([process.execPath, "scripts/pack.ts"], {
    cwd: PACKAGE_ROOT,
    stdout: "ignore",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`pack CLI failed: ${stderr}`);
}

beforeAll(async () => {
  await runPackCLI();
  manifest = await readAndVerifyManifest(PACKAGE_ROOT);
});

function inputURL(input: Parameters<typeof fetch>[0]): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") return new URL(input);
  return new URL(input.url);
}

function fakeHub(mode: "upload" | "same" | "conflict" | "auth-failure"): {
  fetch: typeof fetch;
  methods: string[];
  cookies: string[];
} {
  const methods: string[] = [];
  const cookies: string[] = [];
  let principalPages = 0;
  let tarballLists = 0;
  let putAttempts = 0;
  let uploadedFilename: string | undefined;

  const fakeFetch = (async (input, init) => {
    const url = inputURL(input);
    const method = init?.method ?? "GET";
    methods.push(`${method} ${url.pathname}${url.search}`);
    const headers = new Headers(init?.headers);
    const cookie = headers.get("cookie");
    if (cookie !== null) cookies.push(cookie);

    if (url.pathname === "/api/auth/sign-in/email") {
      if (mode === "auth-failure") {
        return Response.json({ error: "invalid" }, { status: 401 });
      }
      return Response.json(
        { user: { id: "user-1" } },
        { status: 200, headers: { "set-cookie": "session=test; Path=/" } },
      );
    }
    if (url.pathname === "/api/me/principals") {
      principalPages += 1;
      if (principalPages === 1) {
        return Response.json({ data: [], nextCursor: "page-2" });
      }
      return Response.json({
        data: [
          {
            tenantSlug: "tools-x",
            tenantId: "tenant-1",
            status: "active",
          },
        ],
        nextCursor: null,
      });
    }
    if (method === "GET" && url.pathname === "/api/tenants/tenant-1/assets") {
      if (mode === "upload") return Response.json([]);
      return Response.json([
        {
          id: "asset-1",
          name: "workspace-builtins",
          kind: "package-registry",
          tenantId: "tenant-1",
          origin: { direct: true, tenantId: "tenant-1" },
        },
      ]);
    }
    if (method === "POST" && url.pathname === "/api/tenants/tenant-1/assets") {
      return Response.json(
        {
          id: "asset-1",
          name: "workspace-builtins",
          kind: "package-registry",
          tenantId: "tenant-1",
        },
        { status: 201 },
      );
    }
    if (
      method === "GET" &&
      url.pathname === "/api/tenants/tenant-1/assets/asset-1/tarballs"
    ) {
      tarballLists += 1;
      if (mode === "same") {
        return Response.json([
          {
            filename: manifest.filename,
            integrity: manifest.integrity,
            size: manifest.size,
          },
        ]);
      }
      if (mode === "conflict") {
        return Response.json([
          {
            filename: manifest.filename,
            integrity: "sha512-conflict",
            size: manifest.size,
          },
        ]);
      }
      if (tarballLists === 1) return Response.json([]);
      return Response.json([
        {
          filename: uploadedFilename,
          integrity: manifest.integrity,
          size: manifest.size,
        },
      ]);
    }
    if (
      method === "PUT" &&
      decodeURIComponent(url.pathname).includes("/tarballs/") &&
      decodeURIComponent(url.pathname).endsWith(".tgz")
    ) {
      putAttempts += 1;
      uploadedFilename = decodeURIComponent(url.pathname).split("/").at(-1);
      if (putAttempts === 1) return new Response("temporary", { status: 503 });
      return Response.json({
        commit: "commit-1",
        integrity: manifest.integrity,
      });
    }
    return Response.json({ error: "unexpected fake route" }, { status: 404 });
  }) as typeof fetch;

  return { fetch: fakeFetch, methods, cookies };
}

describe("tools-x package artifact", () => {
  test(
    "is byte-for-byte deterministic across independent builds",
    async () => {
      await runPackCLI();
      const first = await readAndVerifyManifest(PACKAGE_ROOT);
      const firstBytes = await fs.readFile(
        path.join(PACKAGE_ROOT, first.tarballPath),
      );
      await runPackCLI();
      const second = await readAndVerifyManifest(PACKAGE_ROOT);
      const secondBytes = await fs.readFile(
        path.join(PACKAGE_ROOT, second.tarballPath),
      );
      expect(second.integrity).toBe(first.integrity);
      expect(second.size).toBe(first.size);
      expect(secondBytes.equals(firstBytes)).toBe(true);
      manifest = second;
    },
    { timeout: 15_000 },
  );

  test("verifies the generated manifest, archive, and loaded 23-tool bundle", async () => {
    await expect(readAndVerifyManifest(PACKAGE_ROOT)).resolves.toEqual(
      manifest,
    );
  });

  test("rejects link-bearing archives before extraction", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "tools-x-hostile-"));
    try {
      await fs.mkdir(path.join(root, "package"));
      await fs.symlink("/tmp/escape", path.join(root, "package", "link"));
      const tarball = path.join(root, "hostile.tgz");
      await tar.create({ cwd: root, file: tarball, gzip: true }, ["package"]);
      await expect(verifyTarball(tarball)).rejects.toThrow(
        /must not contain links/,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("tools-x hosted uploader", () => {
  const baseOptions = {
    hubURL: "https://hub.example.test",
    email: "publisher@example.test",
    password: "test-password",
    tenantSlug: "tools-x",
    packageRoot: PACKAGE_ROOT,
  };

  test("paginates tenant lookup, creates the direct registry, retries 5xx, and verifies", async () => {
    const hub = fakeHub("upload");
    const result = await uploadPackage({ ...baseOptions, fetch: hub.fetch });
    expect(result).toMatchObject({
      tenantId: "tenant-1",
      assetId: "asset-1",
      uploaded: true,
      commit: "commit-1",
      integrity: manifest.integrity,
      pin: { name: "@intx/tools-x", version: "0.1.0" },
    });
    expect(result.filename).toBe(contentAddressedFilename(manifest));
    expect(
      hub.methods.filter((entry) => entry.startsWith("PUT ")),
    ).toHaveLength(2);
    expect(hub.cookies.every((cookie) => cookie === "session=test")).toBe(true);
  });

  test("treats identical existing bytes as an idempotent success", async () => {
    const hub = fakeHub("same");
    const result = await uploadPackage({ ...baseOptions, fetch: hub.fetch });
    expect(result).toMatchObject({ uploaded: false, commit: null });
    expect(hub.methods.some((entry) => entry.startsWith("PUT "))).toBe(false);
  });

  test("refuses a same-version artifact with different bytes", async () => {
    const hub = fakeHub("conflict");
    await expect(
      uploadPackage({ ...baseOptions, fetch: hub.fetch }),
    ).rejects.toThrow(/bump the package version/);
    expect(hub.methods.some((entry) => entry.startsWith("PUT "))).toBe(false);
  });

  test("fails closed on authentication and insecure non-loopback URLs", async () => {
    const hub = fakeHub("auth-failure");
    await expect(
      uploadPackage({ ...baseOptions, fetch: hub.fetch }),
    ).rejects.toThrow(/sign-in failed/);
    await expect(
      uploadPackage({
        ...baseOptions,
        hubURL: "http://hub.example.test",
        fetch: hub.fetch,
      }),
    ).rejects.toThrow(/must use HTTPS/);
  });
});
