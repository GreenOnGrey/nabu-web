import { describe, expect, it } from "vitest";
import type { Agent, AvailableModel, Message } from "../api/types";
import { createI18n } from "../lib/i18n";
import { voiceState } from "../pages/admin/Settings";
import { contextOf, eventText, toChatMessage, unseenImages } from "./adapter";
import { modelOptions } from "./AgentMenu";

const t = createI18n("en").t;

const msg = (m: Partial<Message>): Message => ({
  id: "m1", conversationId: "main", role: "user", text: "Hi", channel: "web", status: "done", attachments: [], toolSteps: [],
  model: null, errorClass: null, errorText: null, replyTo: null, createdAt: "2026-10-11T14:00:00Z", ...m,
});
const model = (name: string, image = false, contextWindow = 128_000): AvailableModel =>
  ({ connectionId: "c1", model: name, name, connection: "DeepSeek", caps: { image, tools: true, reasoning: false, contextWindow } });
const agent = (a: Partial<Agent>): Agent => ({ name: "Nabu", tone: "business", model: model("text"), defaultModel: model("text"), chosen: false,
  availableModels: [model("text")], context: { tokens: 0, window: 0 }, ...a });

// FTR.NAB.CHAT-0001: the web side of the context, the skills, the models and the voice.
describe("FTR.NAB.CHAT-0001 in the web", () => {
  it("R1, R2, R16: the dividers of the events", () => {
    expect(eventText(t, msg({ role: "event", event: { kind: "reset" } }), "en")?.icon).toBe("undo");
    const c = eventText(t, msg({ role: "event", event: { kind: "compact", auto: true, tokensBefore: 150_000, tokensAfter: 900, summary: "s" } }), "en");
    expect(c?.text).toContain("150K");
    expect(c?.details).toBe("s");
    expect(eventText(t, msg({ role: "event", event: { kind: "model", model: "glm-4.6", name: "GLM-4.6" } }), "en")?.text).toContain("GLM-4.6");
  });

  it("R5, R21: the mark of a skill and of a voice message", () => {
    expect(toChatMessage(t, msg({ skill: "contract-review" }), null).mark).toEqual({ icon: "spark", text: "contract-review" });
    expect(toChatMessage(t, msg({ voice: true, channel: "telegram" }), null).mark?.icon).toBe("mic");
  });

  it("SEL-05: the tooltip of an answer is the name of its model", () => {
    expect(toChatMessage(t, msg({ role: "assistant", model: "DeepSeek V4.1 Flash" }), null).hint).toBe("DeepSeek V4.1 Flash");
  });

  it("CTX-10, R3: a conversation without a session shows 0 of the window of the model", () => {
    expect(contextOf({ tokens: 0, window: 0 }, 128_000)).toEqual({ tokens: 0, window: 128_000 });
    expect(contextOf({ tokens: 900, window: 64_000 }, 128_000)).toEqual({ tokens: 900, window: 64_000 });
    expect(contextOf({ tokens: 0, window: 0 }, 0)).toBeUndefined();
    expect(contextOf(undefined, 128_000)).toBeUndefined();
  });

  it("MDL-14: images for a model that does not see them — the warning and a model that does", () => {
    const a = agent({ availableModels: [model("text"), model("vision", true)] });
    expect(unseenImages(a, true)?.seeing?.model).toBe("vision");
    expect(unseenImages(a, false)).toBeNull();
    expect(unseenImages(agent({ model: model("vision", true) }), true)).toBeNull();
    expect(unseenImages(agent({}), true)).toEqual({ seeing: undefined });
  });

  it("SEL-04: the block of the model — the default first with a choice, one model alone, none", () => {
    const two = modelOptions(t, agent({ availableModels: [model("text"), model("vision", true)] }), "en");
    expect(two.options.map((o) => o.key)).toEqual(["", "c1/text", "c1/vision"]);
    expect(two.options[0].sub).toBe("text");
    expect(two.value).toBe("");
    const chosen = modelOptions(t, agent({ chosen: true, model: model("vision", true), availableModels: [model("text"), model("vision", true)] }), "en");
    expect(chosen.value).toBe("c1/vision");
    const one = modelOptions(t, agent({}), "en");
    expect(one.options.map((o) => o.key)).toEqual(["c1/text"]);
    expect(one.value).toBe("c1/text");
    expect(modelOptions(t, agent({ model: null, defaultModel: null, availableModels: [] }), "en").options).toEqual([]);
    // R16: without a default the first line is still there
    expect(modelOptions(t, agent({ defaultModel: null, availableModels: [model("a"), model("b")] }), "en").options[0]).toMatchObject({ key: "", sub: "—" });
  });

  it("R17: a model whose window the context outgrows warns", () => {
    const a = agent({ context: { tokens: 100_000, window: 128_000 }, availableModels: [model("big", false, 1_000_000), model("small", false, 64_000)] });
    const o = modelOptions(t, a, "en").options;
    expect(o.find((x) => x.key === "c1/small")?.warn).toBeTruthy();
    expect(o.find((x) => x.key === "c1/big")?.warn).toBeUndefined();
  });

  it("VOC-11: the three states of the recognizer", () => {
    expect(voiceState({ configured: true, ok: true }).tone).toBe("ok");
    expect(voiceState({ configured: true, ok: false, error: "502" }).tone).toBe("review");
    expect(voiceState({ configured: false, ok: false }).tone).toBe("none");
  });
});
