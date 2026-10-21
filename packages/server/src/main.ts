import { createGameServer } from "./index.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const staticDir = process.env.STATIC_DIR;
const server = createGameServer({
  databasePath: process.env.DATABASE_PATH ?? "pref.sqlite",
  ...(staticDir === undefined ? {} : { staticDir }),
});

await server.listen(port, host);
console.log(`Pref server: http://${host}:${port}`);

let closing = false;
async function close(): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
