import { describe, expect, it } from "vitest";
import { allowedCount, applyReadOnly, bytesToMb, isReadOnly, mbToBytes, sortTools, toggleFileArg, toggleTool, type ItemTool } from "./catalogTools";

const tools: ItemTool[] = [
  { name: "convert", readOnly: false, stringArgs: ["source"] },
  { name: "export", readOnly: true },
  { name: "list_cached", readOnly: true },
];

describe("FTR.NAB.CMN-0006 tools of an item", () => {
  it("UI-01: Read-only checks the reading tools", () => {
    const c = applyReadOnly({ allowed: ["convert"], fileArgs: [{ tool: "convert", arg: "source" }] }, tools, true);
    expect(c.allowed).toEqual(["export", "list_cached"]);
    expect(c.fileArgs).toEqual([]);
    expect(isReadOnly(tools, c.allowed)).toBe(true);
  });
  it("UI-02: a changing tool turns Read-only off", () => {
    expect(isReadOnly(tools, ["export", "convert"])).toBe(false);
  });
  it("UI-04: unchecking a tool drops its file arguments", () => {
    let c = toggleTool({ allowed: [], fileArgs: [] }, "convert", true);
    c = toggleFileArg(c, "convert", "source", true);
    expect(c.fileArgs).toEqual([{ tool: "convert", arg: "source" }]);
    c = toggleTool(c, "convert", false);
    expect(c).toEqual({ allowed: [], fileArgs: [] });
    expect(toggleFileArg(c, "convert", "source", true).fileArgs).toEqual([]);
  });
  it("sorts the checked tools first", () => {
    expect(sortTools(tools, ["list_cached"]).map((t) => t.name)).toEqual(["list_cached", "convert", "export"]);
  });
  it("UI-05: counts what the agent sees", () => {
    expect(allowedCount(tools, ["export", "gone"], false)).toBe(1);
    expect(allowedCount(tools, null, true)).toBe(2);
    expect(allowedCount(tools, null, false)).toBe(3);
  });
  it("converts the file limit", () => {
    expect(mbToBytes("20")).toBe(20 << 20);
    expect(mbToBytes("0,5")).toBe(512 << 10);
    expect(mbToBytes("0")).toBeNull();
    expect(mbToBytes("101")).toBeNull();
    expect(bytesToMb(20 << 20)).toBe("20");
  });
});
