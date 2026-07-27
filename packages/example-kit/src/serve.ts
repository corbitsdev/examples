// Serve an example's app over real HTTP.
//
// The `bun run start` path drives each app in-process, which is the fastest
// way to assert behaviour but proves nothing about the app being reachable.
// `bun run serve` binds it to a port so you can curl the same routes a browser
// would.
type Fetchable = { fetch: (request: Request) => Response | Promise<Response> };

export function serve(app: Fetchable, name: string): void {
  const port = Number(process.env.PORT ?? "3000");
  Bun.serve({ port, fetch: app.fetch });
  console.log(`${name} listening on http://localhost:${String(port)}`);
}
