import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

export async function serveStatic(
  staticDir: string | null,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (staticDir === null || (request.method !== "GET" && request.method !== "HEAD")) {
    return false;
  }
  const root = staticDir;
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const relative = path
    .normalize(decoded)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^[/\\]+/, "");
  const direct = path.resolve(root, relative);
  if (direct !== root && !direct.startsWith(`${root}${path.sep}`)) {
    return false;
  }
  const file = await existingFile(direct);
  const target =
    file ??
    (path.extname(relative) === ""
      ? await existingFile(path.join(root, "index.html"))
      : null);
  if (target === null) {
    return false;
  }
  response.writeHead(200, {
    "Content-Type": staticType(path.extname(target)),
    "Cache-Control":
      path.extname(target) === ".html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(target).pipe(response);
  return true;
}
export async function existingFile(candidate: string): Promise<string | null> {
  try {
    const info = await stat(candidate);
    return info.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

export function staticType(extension: string): string {
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
  };
  return types[extension] ?? "application/octet-stream";
}
