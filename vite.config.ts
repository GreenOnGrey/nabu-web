import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In development the SPA talks to a local api (nabu-core) through this proxy,
// so cookies stay same-origin exactly as behind a single-host install.
const api = process.env.NABU_API ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ["/api", "/admin/api", "/auth", "/client", "/oauth"].map((p) => [p, { target: api, changeOrigin: false }]),
    ),
  },
  build: { sourcemap: true, chunkSizeWarningLimit: 1500 },
  test: { environment: "node" },
});
