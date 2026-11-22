import { test, expect, vi } from "vitest";
import { reconnectDelay, reconnectingSocket } from "./useReconnectingSocket.js";

class FakeSocket extends EventTarget {
  close() { this.dispatchEvent(new Event("close")); }
}

test("backs off failed connections, resets on open, and cancels retries on unmount", () => {
  vi.useFakeTimers();
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  const sockets: FakeSocket[] = [];
  const target = { current: null as WebSocket | null };
  const opened = vi.fn(); const message = vi.fn();
  const factory = vi.fn(() => { const socket = new FakeSocket(); sockets.push(socket); return socket as unknown as WebSocket; });
  const active = reconnectingSocket("ws://test", { onOpen: opened, onMessage: message }, target, factory);
  try {
    vi.advanceTimersByTime(0); expect(factory).toHaveBeenCalledTimes(1);
    sockets[0].close(); active.reconnect(); vi.advanceTimersByTime(249);
    expect(factory).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(factory).toHaveBeenCalledTimes(2);
    sockets[1].close(); vi.advanceTimersByTime(499); expect(factory).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1); expect(factory).toHaveBeenCalledTimes(3);
    sockets[2].dispatchEvent(new Event("open")); expect(opened).toHaveBeenCalledTimes(1);
    sockets[0].dispatchEvent(new Event("message")); expect(message).not.toHaveBeenCalled();
    sockets[2].dispatchEvent(new Event("message")); expect(message).toHaveBeenCalledTimes(1);
    sockets[2].close(); vi.advanceTimersByTime(250); expect(factory).toHaveBeenCalledTimes(4);
    sockets[3].close(); active.stop(); vi.advanceTimersByTime(100_000);
    expect(factory).toHaveBeenCalledTimes(4); expect(target.current).toBeNull();
  } finally { active.stop(); random.mockRestore(); vi.useRealTimers(); }
});

test("jitter remains bounded and constructor failures also back off", () => {
  for (const attempt of [0, 1, 6, 1000]) {
    expect(reconnectDelay(attempt, () => 1)).toBeLessThanOrEqual(10_000);
    expect(reconnectDelay(attempt, () => 0)).toBeGreaterThanOrEqual(250);
  }
  expect(reconnectDelay(1, () => 0.5)).toBeGreaterThan(reconnectDelay(1, () => 0));
  vi.useFakeTimers(); const create = vi.fn(() => { throw new Error("offline"); });
  const active = reconnectingSocket("ws://test", { onOpen: vi.fn(), onMessage: vi.fn() }, { current: null }, create);
  try {
    vi.advanceTimersByTime(0); expect(create).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(249); expect(create).toHaveBeenCalledTimes(1);
    active.stop(); vi.advanceTimersByTime(20_000); expect(create).toHaveBeenCalledTimes(1);
  } finally { active.stop(); vi.useRealTimers(); }
});
