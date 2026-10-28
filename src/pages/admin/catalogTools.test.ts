import { describe, expect, it } from "vitest";
import type { AdminCatalogItem } from "../../api/types";
import { createI18n } from "../../lib/i18n";
import {
  actionResult, allowedCount, applyReadOnly, bytesToMb, isReadOnly, mbToBytes, sortTools, toggleFileArg, toggleResultArg, toggleSpaceOnly, toggleTool, type ItemTool,
  type ToolChoice,
} from "./catalogTools";

const none: ToolChoice = { allowed: [], fileArgs: [], resultArgs: [], spaceOnly: [] };

const tools: ItemTool[] = [
  { name: "convert", readOnly: false, stringArgs: ["source", "dest"] },
  { name: "export", readOnly: true },
  { name: "list_cached", readOnly: true },
];

describe("FTR.NAB.CMN-0006 tools of an item", () => {
  it("UI-01: Read-only checks the reading tools", () => {
    const c = applyReadOnly({ ...none, allowed: ["convert"], fileArgs: [{ tool: "convert", arg: "source" }] }, tools, true);
    expect(c.allowed).toEqual(["export", "list_cached"]);
    expect(c.fileArgs).toEqual([]);
    expect(isReadOnly(tools, c.allowed)).toBe(true);
  });
  it("UI-02: a changing tool turns Read-only off", () => {
    expect(isReadOnly(tools, ["export", "convert"])).toBe(false);
  });
  it("UI-04: unchecking a tool drops its file arguments", () => {
    let c = toggleTool(none, "convert", true);
    c = toggleFileArg(c, "convert", "source", true);
    expect(c.fileArgs).toEqual([{ tool: "convert", arg: "source" }]);
    c = toggleTool(c, "convert", false);
    expect(c).toEqual(none);
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

describe("FTR.NAB.CHAT-0003 result paths", () => {
  it("UI-10: an argument is a space file or a result path, not both", () => {
    let c = toggleTool(none, "convert", true);
    c = toggleFileArg(c, "convert", "source", true);
    expect(toggleResultArg(c, "convert", "source", true).resultArgs).toEqual([]);
    c = toggleResultArg(c, "convert", "dest", true);
    expect(c.resultArgs).toEqual([{ tool: "convert", arg: "dest" }]);
    expect(toggleFileArg(c, "convert", "dest", true).fileArgs).toEqual([{ tool: "convert", arg: "source" }]);
  });
  it("UI-11: «writes only to the space» needs a result path and goes with the last one", () => {
    let c = toggleTool(none, "convert", true);
    expect(toggleSpaceOnly(c, "convert", true).spaceOnly).toEqual([]);
    c = toggleSpaceOnly(toggleResultArg(c, "convert", "dest", true), "convert", true);
    expect(c.spaceOnly).toEqual(["convert"]);
    expect(toggleResultArg(c, "convert", "dest", false)).toEqual({ ...c, resultArgs: [], spaceOnly: [] });
    expect(toggleTool(c, "convert", false)).toEqual(none);
    expect(applyReadOnly(c, tools, true).spaceOnly).toEqual([]);
  });
  it("limits a result to 50 MB", () => {
    expect(mbToBytes("50", 50 << 20)).toBe(50 << 20);
    expect(mbToBytes("51", 50 << 20)).toBeNull();
  });
});

// FTR.NAB.CMN-0001 design §11: «Check» and «Synchronize» tell their result.
describe("FTR.NAB.CMN-0001 the result of a check", () => {
  const ru = createI18n("ru").t;
  const mcp = { type: "mcp", name: "hammurapi", title: "Hammurapi", status: "ok", statusReason: null, skills: [],
    tools: [{ name: "a", readOnly: true }, { name: "b", readOnly: false }] } as unknown as AdminCatalogItem;
  it("a working server names its tools and the new ones", () => {
    expect(actionResult(ru, mcp)).toEqual({ kind: "ok", title: "Hammurapi работает · 2 инструмента" });
    expect(actionResult(ru, { ...mcp, newTools: ["b"] }).title).toBe("Hammurapi работает · 2 инструмента · 1 новый");
  });
  it("a failing server is an error with its reason", () => {
    expect(actionResult(ru, { ...mcp, status: "error", statusReason: "connection refused" })).toEqual({ kind: "error", title: "Hammurapi: connection refused" });
  });
  it("skills tell how many came", () => {
    expect(actionResult(ru, { ...mcp, type: "skill", tools: [], skills: ["a", "b", "c", "d", "e"] }).title).toBe("Hammurapi синхронизирован · 5 скиллов");
  });
});
