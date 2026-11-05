import { afterEach, describe, expect, it } from "vitest";
import { apiUrl, loadRuntimeConfig, setApiBase } from "./base";

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

describe("apiUrl", () => {
  afterEach(() => setApiBase(""));

  it("by default a relative path (the API on the same origin)", () => {
    expect(apiUrl("/api/v1/config")).toBe("/api/v1/config");
  });

  it("with apiBaseUrl from config.json an absolute address api.<domain>", async () => {
    await loadRuntimeConfig(async () => jsonResponse({ apiBaseUrl: "https://api.1-2-3-4.sslip.io/" }));
    expect(apiUrl("/api/v1/events")).toBe("https://api.1-2-3-4.sslip.io/api/v1/events");
  });

  it("without config.json the path stays relative", async () => {
    await loadRuntimeConfig(async () => jsonResponse({}, false));
    expect(apiUrl("/api/v1/auth/login")).toBe("/api/v1/auth/login");
  });

  it("a network error while loading config.json does not break the start", async () => {
    await loadRuntimeConfig(async () => {
      throw new Error("offline");
    });
    expect(apiUrl("/x")).toBe("/x");
  });
});
