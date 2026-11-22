import { type IncomingMessage, type ServerResponse } from "node:http";

export function isApiPath(pathname: string): boolean {
  return (
    pathname === "/me" ||
    pathname === "/register" ||
    pathname === "/login" ||
    pathname === "/logout" ||
    pathname === "/ws" ||
    pathname === "/tables" ||
    pathname.startsWith("/tables/")
  );
}

export async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 16_384) {
      throw new RangeError("Request body is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}
