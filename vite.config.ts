import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

// In development the SPA talks to a local api (nabu-core) through this proxy,
// so cookies stay same-origin exactly as behind a single-host install.
const api = process.env.NABU_API ?? "http://localhost:8080";

// FTR.NAB.CMN-0005 tech §4: with UI_KIT_SRC=../ui-kit the kit is taken from its
// sources, so a change of the kit is seen here at once, before any release. CI
// and the image never set it: they build with the pinned version of the package.
const kit = process.env.UI_KIT_SRC && path.resolve(process.env.UI_KIT_SRC, "src");
const kitAlias = kit ? [
  { find: "@green-on-grey/ui-kit/styles.css", replacement: `${kit}/styles/index.css` },
  { find: "@green-on-grey/ui-kit/chat", replacement: `${kit}/chat/index.ts` },
  { find: "@green-on-grey/ui-kit/login", replacement: `${kit}/login/index.ts` },
  { find: "@green-on-grey/ui-kit/locales", replacement: `${kit}/locales/index.ts` },
  { find: /^@green-on-grey\/ui-kit$/, replacement: `${kit}/index.ts` },
] : [];

export default defineConfig({
  plugins: [react()],
  // one React for the product and the sources of the kit
  resolve: { alias: kitAlias, dedupe: ["react", "react-dom", "i18next", "react-i18next"] },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ["/api", "/admin/api", "/auth", "/client", "/oauth"].map((p) => [p, { target: api, changeOrigin: false }]),
    ),
  },
  build: { sourcemap: true, chunkSizeWarningLimit: 1500 },
  // e2e/*.spec.ts are Playwright tests (npm run shots), not unit tests
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
