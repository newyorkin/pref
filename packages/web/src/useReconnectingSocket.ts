import { useEffect, useRef } from "react";

export function reconnectDelay(attempt: number, random = Math.random): number {
  return Math.min(10_000, 250 * 2 ** Math.min(attempt, 6) * (1 + random() * 0.25));
}

interface SocketOptions {
  onOpen: (socket: WebSocket) => void;
  onMessage: (event: MessageEvent) => void;
}

export function reconnectingSocket(url: string, callbacks: SocketOptions,
  target: { current: WebSocket | null }, createSocket = (url: string) => new WebSocket(url)) {
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule(): void {
    if (stopped || timer !== undefined) return;
    timer = setTimeout(() => { timer = undefined; connect(); }, reconnectDelay(attempt++));
  }
  function connect(): void {
    // A user action must not bypass an already scheduled retry/backoff.
    if (stopped || timer !== undefined || target.current !== null) return;
    let next: WebSocket;
    try { next = createSocket(url); } catch { schedule(); return; }
    target.current = next;
    next.addEventListener("open", () => {
      if (stopped || target.current !== next) return;
      attempt = 0; callbacks.onOpen(next);
    });
    next.addEventListener("message", event => {
      if (!stopped && target.current === next) callbacks.onMessage(event);
    });
    next.addEventListener("error", () => next.close());
    next.addEventListener("close", () => {
      if (stopped || target.current !== next) return;
      target.current = null; schedule();
    });
  }
  timer = setTimeout(() => { timer = undefined; connect(); }, 0);
  return {
    reconnect: connect,
    stop: () => {
      stopped = true; clearTimeout(timer); timer = undefined;
      const previous = target.current; target.current = null; previous?.close();
    },
  };
}

export function useReconnectingSocket(key: string, enabled: boolean, callbacks: SocketOptions) {
  const socket = useRef<WebSocket | null>(null);
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const controller = useRef<ReturnType<typeof reconnectingSocket> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const active = reconnectingSocket(`${protocol}//${window.location.host}/ws`, {
      onOpen: ws => latest.current.onOpen(ws), onMessage: event => latest.current.onMessage(event),
    }, socket);
    controller.current = active;
    return () => { controller.current = null; active.stop(); };
  }, [key, enabled]);
  return { socket, reconnect: () => controller.current?.reconnect() };
}
