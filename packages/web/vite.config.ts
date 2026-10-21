import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
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
