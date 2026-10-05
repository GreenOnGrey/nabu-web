import { afterEach, describe, expect, it } from "vitest";
import { apiUrl, loadRuntimeConfig, setApiBase } from "./base";

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

describe("apiUrl", () => {
  afterEach(() => setApiBase(""));

  it("по умолчанию — относительный путь (API на том же origin)", () => {
    expect(apiUrl("/api/v1/config")).toBe("/api/v1/config");
  });

  it("с apiBaseUrl из config.json — абсолютный адрес api.<домен>", async () => {
    await loadRuntimeConfig(async () => jsonResponse({ apiBaseUrl: "https://api.1-2-3-4.sslip.io/" }));
    expect(apiUrl("/api/v1/events")).toBe("https://api.1-2-3-4.sslip.io/api/v1/events");
  });

  it("без config.json — остаётся относительный путь", async () => {
    await loadRuntimeConfig(async () => jsonResponse({}, false));
    expect(apiUrl("/api/v1/auth/login")).toBe("/api/v1/auth/login");
  });

  it("сетевая ошибка при загрузке config.json не ломает запуск", async () => {
    await loadRuntimeConfig(async () => {
      throw new Error("offline");
    });
    expect(apiUrl("/x")).toBe("/x");
  });
});
