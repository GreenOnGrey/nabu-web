import { describe, expect, it } from "vitest";
import { hostLabel, proxyBody, slug } from "./SandboxProxies";

// FTR.HMR.CMN-0007 design §3.2: the form of a proxy.
describe("FTR.HMR.CMN-0007: proxies", () => {
  it("a new proxy takes its name from the title", () => {
    expect(slug("Реестры пакетов")).toBe("reestry-paketov");
    expect(slug("Docs & API")).toBe("docs-api");
    expect(slug("1С")).toBe("p-1s");
  });

  it("the port shows only when it is not 443", () => {
    expect(hostLabel({ host: "pypi.org", port: 443, internal: false })).toBe("pypi.org");
    expect(hostLabel({ host: "nexus.company.local", port: 8443, internal: true })).toBe("nexus.company.local:8443");
  });

  it("the body keeps the fields of the kind and drops empty rows", () => {
    const base = { name: "docs", title: " Docs ", description: "", ecosystems: ["go"], registries: [], env: [] };
    expect(proxyBody({ ...base, kind: "hosts", allow: [{ host: " docs.company.local ", port: 0, internal: true }, { host: "", port: 443, internal: false }],
      env: [{ name: "TOKEN", value: "", secret: true }, { name: " ", value: "x", secret: false }] })).toEqual({
      name: "docs", title: "Docs", description: "", kind: "hosts",
      allow: [{ host: "docs.company.local", port: 443, internal: true }],
      env: [{ name: "TOKEN", value: undefined, secret: true }],
    });
    // PX-08: a kept token is not sent
    expect(proxyBody({ ...base, kind: "packages", allow: [], registries: [{ ecosystem: "npm", url: " https://npm.company.local ", internal: true, token: "", tokenSet: true }] }))
      .toEqual({ name: "docs", title: "Docs", description: "", kind: "packages", ecosystems: ["go"],
        registries: [{ ecosystem: "npm", url: "https://npm.company.local", internal: true, token: undefined, tokenSet: true }] });
  });
});
