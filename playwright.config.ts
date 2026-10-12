import { defineConfig, devices } from "@playwright/test";

// The shots of the screens of one build (FTR.NAB.CMN-0005 qa §5). The build is
// served by e2e/mock.mjs with a fixed API:
//   DIST=<dist of a build> SHOTS_DIR=<where to put the shots> npx playwright test
const PORT = 5300;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`, locale: "ru-RU", timezoneId: "Europe/Moscow",
    // Repeatable rendering. Without these two flags a build differs from itself by
    // 1–25 pixels on a few screens of every run — gradients, pictures and icons
    // under a translucent layer — and a zero tolerance cannot hold
    // (FTR.NAB.CMN-0005 qa, decision 3). With them three runs of 118 shots were identical.
    launchOptions: { args: ["--disable-partial-raster", "--disable-skia-runtime-opts"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: {
    command: `node e2e/mock.mjs`,
    env: { DIST: process.env.DIST ?? "dist", PORT: String(PORT) },
    url: `http://localhost:${PORT}/api/v1/config`,
    reuseExistingServer: false,
  },
});
