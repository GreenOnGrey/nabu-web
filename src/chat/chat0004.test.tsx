import { describe, expect, it } from "vitest";
import type { Message } from "../api/types";
import { errorText } from "../lib/errors";
import { ApiError } from "../api/client";
import { createI18n } from "../lib/i18n";
import { liveAnswer, toChatMessage } from "./adapter";

const t = createI18n("ru").t;
const msg = (m: Partial<Message>): Message => ({
  id: "m1", conversationId: "main", role: "user", text: "Hi", channel: "web", status: "done", attachments: [], toolSteps: [],
  model: null, errorClass: null, errorText: null, replyTo: null, createdAt: "2026-10-27T14:00:00Z", ...m,
});

// FTR.NAB.CHAT-0004: the web side of the queue and of the stop of an answer.
describe("FTR.NAB.CHAT-0004 in the web", () => {
  it("QUE-10: a queued message is marked for the kit; a started one is not", () => {
    expect(toChatMessage(t, msg({ queued: true }), null).queued).toBe(true);
    expect(toChatMessage(t, msg({}), null).queued).toBeFalsy();
  });

  it("STP-05: a stopped answer keeps its text and shows no error", () => {
    const out = toChatMessage(t, msg({ role: "assistant", text: "Половина", status: "stopped" }), null);
    expect(out.status).toBe("stopped");
    expect(out.text).toBe("Половина");
    expect(out.error).toBeUndefined();
  });

  it("STP-19: an answer older than the timeout of a turn is not live", () => {
    const after = Date.parse("2026-10-27T14:35:00Z");
    expect(liveAnswer(msg({ role: "assistant", status: "streaming", createdAt: "2026-10-27T14:10:00Z" }), after)).toBe(false);
    expect(liveAnswer(msg({ role: "assistant", status: "streaming", createdAt: "2026-10-27T14:40:00Z" }), after)).toBe(true);
    expect(liveAnswer(msg({ role: "assistant", status: "done", createdAt: "2026-10-27T14:40:00Z" }), after)).toBe(false);
  });

  it("QUE-12: the errors of the queue are worded", () => {
    expect(errorText(t, new ApiError(409, "queue_full", "full", { max: 10 }))).toBe("В очереди уже 10 сообщений — дождитесь ответов или отмените лишние");
    expect(errorText(t, new ApiError(409, "message_started", "started"))).toBe("Агент уже отвечает на это сообщение");
  });

  it("FTR.NAB.CMN-0009 SUB-17: the tasks of subagents reach the kit with their step", () => {
    const sa = [{ task: 1, description: "Ревью", state: "done" as const, tools: 7, result: "OK" }];
    const out = toChatMessage(t, msg({ role: "assistant", toolSteps: [{ id: "tc1", server: "", tool: "subagent", summary: "subagent", status: "done", subagents: sa }] }), null);
    expect(out.steps?.[0].subagents).toEqual(sa);
  });
});
