import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SCREENS } from "./screens";

// Shots of every screen of one build, to compare with the shots of another
// build (e2e/compare.mjs). The same test runs against the build before a change
// and after it, so it finds things by what the user sees, not by markup.
const OUT = process.env.SHOTS_DIR ?? "e2e/shots";

/** Fonts are applied and pictures are decoded: nothing is still on its way to the screen. */
async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  });
}

/** A shot the page repeats: two in a row are the same to a pixel. A page still
 * painting — a list scrolling to its end, a picture appearing — would differ
 * from itself, and a tolerance in the comparison would hide real changes
 * (FTR.NAB.CMN-0005 qa, decisions 3–4). */
async function stableShot(page: Page): Promise<Buffer> {
  const shoot = () => page.screenshot({ animations: "disabled", caret: "hide" });
  let last = await shoot();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const next = await shoot();
    if (next.equals(last)) return next;
    last = next;
  }
  throw new Error("the page keeps changing: no two shots in a row are the same");
}

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
      await settled(page);
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, `${s.name}-${info.project.name}-${theme}.png`), await stableShot(page));
    });
  }
}
