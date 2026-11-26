#!/usr/bin/env node
// Screenshots of the local test table (/testing), driven by a scenario script.
//
// Usage:
//   node .claude/tools/screenshot.mjs <scenario.mjs> [--out <dir>] [--base <url>] [--width 1280] [--height 800]
//
// Needs Docker (the browser runs in a container) and the server running in local test mode
// with the built client on http://127.0.0.1:3001:
//   pnpm --filter @pref/web build
//   STATIC_DIR=$PWD/packages/web/dist DATABASE_PATH=/tmp/pref-test.sqlite HOST=127.0.0.1 PORT=3001 \
//     LOCAL_TEST_MODE=1 pnpm --filter @pref/server start
// `pnpm dev` doesn't work for this: the Vite proxy rewrites the Host header, so the server's
// origin check rejects every POST to /local-test.
// The scenario module's default export receives the helpers below:
//
//   export default async ({ page, start, state, act, playUntil, show, viewAs, shot }) => {
//     await start();                                    // new test game with default settings
//     await playUntil((t) => t.snapshots[0].state.allowedActions.some((a) => a.type === "playCard"));
//     await shot("seat-1-hand", { seat: 0 });
//   };
//
// state()                -> { tableId, settings, snapshots: [3 × { version, state }] }, as the server sends it
// act(seat, action)      -> sends one GameAction for a seat (0, 1 or 2); returns the new state
// playUntil(done, choose?, maxSteps = 500)
//                        -> sends actions until done(state) is true. choose(state, seat) picks the action;
//                           by default the acting seat's first allowed action
// show()                 -> reloads the page so it shows the current state (act and playUntil don't)
// viewAs(seat)           -> switches the view to Игрок 1/2/3
// shot(name, { seat?, fullPage?, selector? })
//                        -> show(), optionally viewAs(seat), then saves <out>/<name>.png and prints its path
// page                   -> the Playwright page, for anything else

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "screenshots" },
    base: { type: "string", default: "http://127.0.0.1:3001" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "800" },
  },
});
if (positionals.length !== 1) {
  console.error("Usage: node .claude/tools/screenshot.mjs <scenario.mjs> [--out <dir>] [--base <url>]");
  process.exit(2);
}
const scenario = (await import(pathToFileURL(path.resolve(positionals[0])).href)).default;
const out = path.resolve(values.out);
await mkdir(out, { recursive: true });

try {
  const status = await fetch(new URL("/local-test/status", values.base));
  if (!status.ok) throw new Error(`status ${status.status}`);
} catch (cause) {
  console.error(
    `The local test table isn't reachable at ${values.base} (${cause.message}).\n` +
      "Build the client and start the server as the comment at the top of this file shows.",
  );
  process.exit(1);
}

// The browser runs in Docker, because the sandbox doesn't let Chromium start locally.
// exposeNetwork tunnels the browser's localhost back to this machine, so it reaches the dev server
// with a loopback Host header, as the local test mode requires.
// The image tag must match the playwright-core version in package.json.
const PLAYWRIGHT_VERSION = "1.64.1";
const SERVER = "ws://127.0.0.1:3555/";
const CONTAINER = "pref-playwright";

async function startServer() {
  const { execFileSync } = await import("node:child_process");
  execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  execFileSync("docker", [
    "run", "-d", "--rm", "--init", "--name", CONTAINER, "-p", "127.0.0.1:3555:3555",
    `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`,
    "/bin/sh", "-c",
    `cd /home/pwuser && npx -y playwright@${PLAYWRIGHT_VERSION} run-server --port 3555 --host 0.0.0.0`,
  ], { stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    const logs = execFileSync("docker", ["logs", CONTAINER], { encoding: "utf8" });
    if (logs.includes("Listening")) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The ${CONTAINER} container didn't start. Check: docker logs ${CONTAINER}`);
}

async function launch() {
  const connect = () => chromium.connect(SERVER, { exposeNetwork: "<loopback>" });
  try {
    return await connect();
  } catch {
    await startServer();
    return connect();
  }
}

const browser = await launch();
const page = await browser.newPage({
  viewport: { width: Number(values.width), height: Number(values.height) },
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const names = ["Игрок 1", "Игрок 2", "Игрок 3"];
const tableId = () => page.evaluate(() => sessionStorage.getItem("pref.local-test.table"));

async function request(pathname, body) {
  return page.evaluate(
    async ({ pathname, body }) => {
      const response = await fetch(pathname, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${pathname}: ${response.status} ${text}`);
      return JSON.parse(text);
    },
    { pathname, body },
  );
}

async function start(settings) {
  await page.goto(new URL("/testing", values.base).href);
  await page.evaluate(() => sessionStorage.removeItem("pref.local-test.table"));
  await page.reload();
  if (settings === undefined) {
    await page.getByRole("button", { name: "Начать тест втроём" }).click();
    await page.getByRole("navigation", { name: "Управление тестом" }).waitFor();
  } else {
    const table = await request("/local-test/tables", settings);
    await page.evaluate((id) => sessionStorage.setItem("pref.local-test.table", id), table.tableId);
    await show();
  }
  return state();
}

async function state() {
  const id = await tableId();
  if (!id) throw new Error("No test game yet: call start() first.");
  return request(`/local-test/tables/${id}`);
}

async function act(seat, action) {
  const current = await state();
  return request(`/local-test/tables/${current.tableId}/actions`, {
    seat,
    action,
    expectedVersion: current.snapshots[seat].version,
  });
}

function actingSeat(table) {
  const turn = table.snapshots[0].state.turn;
  if (turn !== null && turn !== undefined && table.snapshots[turn]?.state.allowedActions.length)
    return turn;
  const seat = table.snapshots.findIndex((s) => s.state.allowedActions.length > 0);
  return seat < 0 ? null : seat;
}

async function playUntil(done, choose, maxSteps = 500) {
  let table = await state();
  for (let step = 0; step < maxSteps; step++) {
    if (await done(table)) return table;
    const seat = actingSeat(table);
    if (seat === null) throw new Error("playUntil: no seat has an allowed action.");
    const action = choose
      ? await choose(table, seat)
      : table.snapshots[seat].state.allowedActions[0];
    table = await act(seat, action);
  }
  throw new Error(`playUntil: condition not reached after ${maxSteps} actions.`);
}

async function show() {
  await page.reload();
  await page.getByRole("navigation", { name: "Управление тестом" }).waitFor();
}

async function viewAs(seat) {
  await page.getByRole("button", { name: names[seat], exact: true }).click();
}

async function shot(name, { seat, fullPage = false, selector } = {}) {
  await show();
  if (seat !== undefined) await viewAs(seat);
  await page.waitForTimeout(300); // let animations settle
  const file = path.join(out, `${name}.png`);
  if (selector) await page.locator(selector).screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage });
  console.log(file);
  return file;
}

try {
  await scenario({ page, start, state, act, playUntil, show, viewAs, shot });
} catch (error) {
  const file = path.join(out, "error.png");
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.error(`Scenario failed. The page at that moment: ${file}`);
  throw error;
} finally {
  if (errors.length) console.error(`Page errors:\n${errors.join("\n")}`);
  await browser.close();
}
