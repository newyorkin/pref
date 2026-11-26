import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function prefRevision(): string {
  const fromEnv = process.env.VITE_PREF_REVISION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: {
    __PREF_REVISION__: JSON.stringify(prefRevision()),
  },
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/local-test": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false,
      },
      "/register": "http://127.0.0.1:3001",
      "/login": "http://127.0.0.1:3001",
      "/logout": "http://127.0.0.1:3001",
      "/me": "http://127.0.0.1:3001",
      "/tables": "http://127.0.0.1:3001",
      "/ws": {
        target: "ws://127.0.0.1:3001",
        ws: true,
      },
    },
  },
});
