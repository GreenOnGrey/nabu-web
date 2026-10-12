import path from "node:path";
import { expect, test } from "@playwright/test";
import { SCREENS } from "./screens";

// Shots of every screen of one build, to compare with the shots of another
// build (e2e/compare.mjs). The same test runs against the build before a change
// and after it, so it finds things by what the user sees, not by markup.
const OUT = process.env.SHOTS_DIR ?? "e2e/shots";

for (const theme of ["light", "dark"] as const) {
  for (const s of SCREENS) {
    test(`${s.name} ${theme}`, async ({ page, context, baseURL }, info) => {
      test.skip(!!s.only && s.only !== info.project.name, `only at the width of a ${s.only}`);
      // the same moment for both builds: "15 hours ago" must not depend on when a build is shot
      await page.clock.setFixedTime(new Date("2026-10-11T15:00:00Z"));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await context.addCookies([
        { name: "mock-theme", value: theme, url: baseURL! },
        { name: "mock-auth", value: s.visitor ? "0" : "1", url: baseURL! },
      ]);
      await page.addInitScript((t) => { try { localStorage.setItem("nabu-theme", t); } catch { /* blocked */ } }, theme);
      await page.goto(s.path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".loading")).toHaveCount(0);
      await s.act?.(page);
      await page.screenshot({ path: path.join(OUT, `${s.name}-${info.project.name}-${theme}.png`), animations: "disabled", caret: "hide" });
    });
  }
}
