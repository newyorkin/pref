import type { Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { allowedOrigin } from "./auth.js";
import type { GameServerOptions } from "./protocol.js";

interface SocketHandlers {
  now: () => number;
  cookieSecure: boolean;
  authenticate: (cookie: string | undefined) => number | null;
  connected: (socket: WebSocket, userId: number) => void;
  message: (socket: WebSocket, data: string) => void;
  closed: (socket: WebSocket) => void;
}
export function createSocketTransport(
  httpServer: Server,
  options: GameServerOptions,
  handlers: SocketHandlers,
) {
  const server = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxSocketPayload ?? 8_192,
  });
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const socket of server.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, options.heartbeatIntervalMs ?? 30_000);
  heartbeat.unref();
  httpServer.on("upgrade", (request, socket, head) => {
    if (!allowedOrigin(request, options.publicOrigin, handlers.cookieSecure)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (handlers.authenticate(request.headers.cookie) === null) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    server.handleUpgrade(request, socket, head, (ws) =>
      server.emit("connection", ws, request),
    );
  });
  server.on("connection", (socket, request) => {
    const userId = handlers.authenticate(request.headers.cookie);
    if (userId === null) {
      socket.close(1008, "Authentication required");
      return;
    }
    handlers.connected(socket, userId);
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
    socket.on("error", () => undefined); // ws reports malformed frames/payload overflow here.
    let messageCount = 0;
    let windowStart = handlers.now();
    socket.on("message", (data) => {
      const now = handlers.now();
      if (now - windowStart >= (options.socketMessageWindowMs ?? 5_000)) {
        windowStart = now;
        messageCount = 0;
      }
      if (++messageCount > (options.socketMessageLimit ?? 50)) {
        socket.close(1008, "Message rate exceeded");
        return;
      }
      if (handlers.authenticate(request.headers.cookie) === null) {
        socket.close(1008, "Session expired");
        return;
      }
      try {
        handlers.message(socket, data.toString());
      } catch {
        socket.send(JSON.stringify({ type: "rejected", reason: "internalError" }));
      }
    });
    socket.on("close", () => {
      handlers.closed(socket);
    });
  });
  return { server, heartbeat };
}
