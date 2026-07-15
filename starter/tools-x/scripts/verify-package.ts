import { readAndVerifyManifest } from "./package-lib";

const manifest = await readAndVerifyManifest(
  import.meta.dir.replace(/\/scripts$/, ""),
);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
