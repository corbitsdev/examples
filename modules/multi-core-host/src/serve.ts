// bun run serve — the same app, on a real port.
import { serve } from "@corbits/example-kit/serve";
import { buildApp } from "./app";

const { app } = await buildApp();
serve(app, "multi-core-host");
