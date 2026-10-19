import { describe, expect, it } from "vitest";
import { choiceKey, modelIds, sameChoice, usableModel } from "./models";

describe("models", () => {
  it("identifies a model of a connection", () => {
    expect(choiceKey({ connectionId: "c", model: "m" })).toBe("c/m");
    expect(sameChoice({ connectionId: "c", model: "m" }, { connectionId: "c", model: "m" })).toBe(true);
    expect(sameChoice(null, { connectionId: "c", model: "m" })).toBe(false);
  });
  it("FTR.NAB.CHAT-0001 R8: only a listed model with tools is usable", () => {
    const m = { id: "x", contextWindow: 1, maxTokens: 1, reasoning: false };
    expect(usableModel(m)).toBe(true);
    expect(usableModel({ ...m, tools: false })).toBe(false);
    expect(usableModel({ ...m, embeddings: true })).toBe(false);
    expect(usableModel({ ...m, gone: true })).toBe(false);
  });
  it("joins picked and typed ids without repeats", () => {
    expect(modelIds(new Set(["a", "b"]), " b, c  d")).toEqual(["a", "b", "c", "d"]);
  });
});
