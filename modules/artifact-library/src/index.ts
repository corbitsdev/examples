// modules/artifact-library — use a mounted @corbits/artifact-core as a small
// document library: import something, revise it, read the history back, then
// upload real files and download them byte for byte — over BOTH shipped
// ContentStore backends, because where the bytes live is a port and the host
// gets to choose.
//
// The mount itself is in ./app.ts. This file is the proof.
//
// Run:  bun run start     (asserts) | bun run serve   (listens)
// Needs a Postgres; see README.md.
import { sql } from "drizzle-orm";
import {
  DataUrlContentStore,
  InlineContentStore,
  runArtifactMigrations,
  type ContentStore,
} from "@corbits/artifact-core";
import { check, finish, section } from "@corbits/example-kit/check";

import { buildApp } from "./app";

type Created = {
  artifact: { id: string; version: number; ownerName?: string | null };
};
type Versions = { versions: { version: number; title: string }[] };
type Listing = {
  artifacts: { id: string; title: string }[];
  nextCursor: string | null;
};

async function main() {
  const { appFor, app, db, signIn } = await buildApp();

  await db.execute(
    sql`TRUNCATE TABLE "artifact", "artifact_version",
        "upload", "mail_attachment_ref" CASCADE`,
  );

  section("import a document, revise it, read the history");
  const createRes = await app.request("/api/artifacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "url",
      title: "Launch plan",
      content: "https://example.com/launch-plan",
    }),
  });
  const created = (await createRes.json()) as Created;
  check(
    createRes.status === 201 && created.artifact.version === 1,
    "importing a URL creates the artifact at version 1",
  );
  const id = created.artifact.id;

  const detail = (await (await app.request(`/api/artifacts/${id}`)).json()) as Created;
  check(
    detail.artifact.ownerName === "Avery Ash",
    "the identity seam names the owner from this app's own directory",
  );

  const revised = await app.request(`/api/artifacts/${id}/versions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Launch plan (revised)",
      content: "https://example.com/launch-plan-v2",
    }),
  });
  check(
    ((await revised.json()) as { version: number }).version === 2,
    "revising bumps it to version 2",
  );
  const history = (await (
    await app.request(`/api/artifacts/${id}/versions`)
  ).json()) as Versions;
  check(
    history.versions.map((v) => v.version).join(",") === "2,1" &&
      history.versions[1]?.title === "Launch plan",
    "the history is newest first and version 1 kept its original title",
  );

  section("upload and download, over BOTH ContentStore backends");
  const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
  ]);
  const PDF = new Uint8Array(Buffer.from("%PDF-1.7 quarterly numbers"));

  for (const [name, store] of [
    ["InlineContentStore", InlineContentStore],
    ["DataUrlContentStore", DataUrlContentStore],
  ] as [string, ContentStore][]) {
    const backend = appFor({ contentStore: store });

    const form = new FormData();
    form.append("files", new File([PNG], "chart.png", { type: "image/png" }));
    form.append("files", new File([PDF], "report.pdf", { type: "application/pdf" }));

    const uploadRes = await backend.request("/api/artifacts/upload", {
      method: "POST",
      body: form,
    });
    const uploaded = (await uploadRes.json()) as {
      artifacts: { id: string; kind: string; version: number }[];
    };
    check(
      uploadRes.status === 201 &&
        uploaded.artifacts.length === 2 &&
        uploaded.artifacts.every((a) => a.version === 1),
      `${name}: every uploaded file becomes an artifact at version 1`,
    );

    const png = await backend.request(
      `/api/artifacts/${uploaded.artifacts[0]!.id}/download`,
    );
    const pngBytes = new Uint8Array(await png.arrayBuffer());
    check(
      png.status === 200 &&
        png.headers.get("content-type") === "image/png" &&
        pngBytes.length === PNG.length &&
        pngBytes.every((b, i) => b === PNG[i]),
      `${name}: the image comes back byte for byte`,
    );
    check(
      png.headers.get("x-content-type-options") === "nosniff" &&
        png.headers.get("content-disposition") ===
          'attachment; filename="chart.png"',
      `${name}: served as a nosniff attachment, never inline-rendered`,
    );

    const pdfId = uploaded.artifacts[1]!.id;
    const asAttachment = await backend.request(`/api/artifacts/${pdfId}/download`);
    const asInline = await backend.request(`/api/artifacts/${pdfId}/download?inline=1`);
    check(
      asAttachment.headers
        .get("content-disposition")
        ?.startsWith("attachment;") === true &&
        asInline.headers.get("content-disposition")?.startsWith("inline;") === true,
      `${name}: a PDF is an attachment unless ?inline=1 asks otherwise`,
    );
  }

  section("the library reads back with keyset paging");
  const page1 = (await (await app.request("/api/artifacts?limit=2")).json()) as Listing;
  check(
    page1.artifacts.length === 2 && page1.nextCursor !== null,
    "a page of two mints a cursor",
  );
  const page2 = (await (
    await app.request(
      `/api/artifacts?limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`,
    )
  ).json()) as Listing;
  check(
    page2.artifacts.every((a) => !page1.artifacts.some((b) => b.id === a.id)),
    "the next page repeats nothing from the first",
  );

  section("archive hides without revoking");
  check(
    (await app.request(`/api/artifacts/${id}/archive`, { method: "POST" })).status ===
      200,
    "the owner may archive their own artifact",
  );
  const defaultList = (await (
    await app.request("/api/artifacts?limit=100")
  ).json()) as Listing;
  check(
    !defaultList.artifacts.some((a) => a.id === id),
    "it disappears from the default listing",
  );
  check(
    (await app.request(`/api/artifacts/${id}`)).status === 200,
    "but a deep link still loads it",
  );
  check(
    (
      await app.request(`/api/artifacts/${id}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "sneaky" }),
      })
    ).status === 404,
    "writing to an archived artifact is refused",
  );

  section("someone else's artifact is not yours to administer");
  signIn({ tenantId: "acme", principalId: "briar" });
  check(
    (await app.request(`/api/artifacts/${id}/unarchive`, { method: "POST" })).status ===
      403,
    "a non-owner is refused (403)",
  );
  check(
    (
      await appFor({ contentStore: InlineContentStore, isAdmin: true }).request(
        `/api/artifacts/${id}/unarchive`,
        { method: "POST" },
      )
    ).status === 200,
    "the same person succeeds once this app's authz seam calls them an admin",
  );

  section("migrations are re-runnable");
  const before = await db.execute<{ id: string }>(
    sql`SELECT "id" FROM "corbits_artifact_core_migrations"`,
  );
  await runArtifactMigrations(db);
  const after = await db.execute<{ id: string }>(
    sql`SELECT "id" FROM "corbits_artifact_core_migrations"`,
  );
  const survived = (await (
    await app.request("/api/artifacts?limit=100")
  ).json()) as Listing;
  check(
    after.length === before.length && survived.artifacts.length > 0,
    "a second boot applies nothing new and destroys nothing",
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
