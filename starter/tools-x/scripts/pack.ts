import { packArtifact } from "./package-lib";

const manifest = await packArtifact(import.meta.dir.replace(/\/scripts$/, ""));
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
