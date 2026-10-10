import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import { createI18n, detectLanguage, LANGUAGES, LANGUAGE_SHORT, resources } from "./i18n";

type Tree = { [k: string]: string | Tree };

function flatten(t: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const en = flatten(resources.en.translation as Tree);

describe("locales (UI-04)", () => {
  for (const lng of LANGUAGES) {
    const msgs = flatten(resources[lng].translation as Tree);
    it(`${lng} has exactly the English keys`, () => {
      expect(Object.keys(msgs).toSorted()).toEqual(Object.keys(en).toSorted());
    });
    it(`${lng} messages are valid ICU`, () => {
      for (const [key, msg] of Object.entries(msgs)) {
        expect(() => new IntlMessageFormat(msg, lng === "zh" ? "zh-CN" : lng), `${lng}:${key}`).not.toThrow();
      }
    });
  }
});

describe("i18n runtime", () => {
  it("uses Russian plural forms", () => {
    const i18n = createI18n("ru");
    expect(i18n.t("admin.usage.days", { count: 1 })).toBe("1 день");
    expect(i18n.t("admin.usage.days", { count: 3 })).toBe("3 дня");
    expect(i18n.t("admin.usage.days", { count: 5 })).toBe("5 дней");
    expect(i18n.t("admin.usage.days", { count: 21 })).toBe("21 день");
  });

  it("interpolates the provider of sign-in", () => {
    expect(createI18n("en").t("login.signIn", { provider: "GitHub" })).toBe("Sign in with GitHub");
    expect(createI18n("ru").t("login.signIn", { provider: "Keycloak" })).toBe("Войти через Keycloak");
  });

  it("detects the browser language", () => {
    expect(detectLanguage(["zh-CN", "en"])).toBe("zh");
    expect(detectLanguage(["fr-FR"])).toBe("en");
    expect(detectLanguage(["de-AT"])).toBe("de");
  });

  // UI-07: languages are short labels in one line.
  it("offers the five languages as EN RU DE ES ZH", () => {
    expect(LANGUAGES.map((l) => LANGUAGE_SHORT[l])).toEqual(["EN", "RU", "DE", "ES", "ZH"]);
  });
});

// What users see: locale texts and string literals; comments may cite specifications.
const visible = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// HMR-09, R32a: the common interface of Nabu never names a client product.
describe("no client products in the interface", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|json)$/.test(f) && !f.endsWith(".test.ts")) files.push(p);
    }
  };
  walk(join(__dirname, ".."));
  walk(join(__dirname, "../../locales"));
  it("has no word Hammurapi", () => {
    for (const f of files) expect(visible(readFileSync(f, "utf8")), f).not.toMatch(/hammurapi/i);
  });
});
