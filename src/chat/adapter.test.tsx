import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "../api/types";
import { createI18n } from "../lib/i18n";
import { channelMark, stepText, toChatConversation, toChatMessage } from "./adapter";

const t = createI18n("en").t;

const msg = (m: Partial<Message>): Message => ({
  id: "m1", conversationId: "main", role: "user", text: "Hi", channel: "web", status: "done", attachments: [], toolSteps: [],
  model: null, errorClass: null, errorText: null, replyTo: null, createdAt: "2026-10-11T14:00:00Z", ...m,
});

// FTR.NAB.CMN-0005 qa CHAT-21: the answers of the API as the kit draws them.
describe("the adapter of the chat (CHAT-21)", () => {
  it("gives no mark to a message written on the site and names the other channels", () => {
    expect(channelMark(t, msg({}))).toBeUndefined();
    expect(channelMark(t, msg({ channel: "telegram" }))).toEqual({ icon: "tg", text: "Telegram" });
    expect(channelMark(t, msg({ channel: "email" }))?.icon).toBe("mail");
    expect(channelMark(t, msg({ channel: "task:42" }))?.icon).toBe("repeat");
    expect(channelMark(t, msg({ channel: "client:tracker" }))).toEqual({ icon: "plug", text: "Tracker" });
  });

  it("writes a tool step as the server and the first line of the result", () => {
    expect(stepText(t, { id: "s", server: "github", tool: "search", summary: "search — 3 issues", status: "done" })).toBe("github: 3 issues");
    expect(stepText(t, { id: "s", server: "", tool: "search", summary: "plain", status: "done" })).toBe("search");
  });

  it("turns a message of the user with its attachments and the waiting turn", () => {
    const m = msg({ attachments: [{ id: "f1", fileName: "plan.pdf", mimeType: "application/pdf", size: 1 }] });
    const out = toChatMessage(t, m, { conversationId: "main", messageId: "m1", state: "queued", position: 2 });
    expect(out).toMatchObject({ id: "m1", role: "user", text: "Hi", wait: { state: "queued", position: 2 } });
    expect(out.attachments).toEqual([{ id: "f1", fileName: "plan.pdf", mimeType: "application/pdf", size: 1, href: "/api/v1/attachments/f1" }]);
    expect(out.mark).toBeUndefined();
    expect(toChatMessage(t, m, { conversationId: "main", messageId: "other", state: "starting" }).wait).toBeUndefined();
    expect(toChatMessage(t, m, { conversationId: "main", messageId: "m1", state: "starting" }).wait).toEqual({ state: "starting" });
  });

  it("turns the outcome of a confirmation into a note, not words of the user", () => {
    const out = toChatMessage(t, msg({ text: "", context: { confirmation: { id: "c", status: "approved", summary: "send a letter" } } }), null);
    expect(out.role).toBe("note");
    expect(out.text).toContain("send a letter");
  });

  it("puts a letter into the content of the message", () => {
    const email = { from: "a@x.org", fromName: "A", to: ["me@x.org"], cc: [], subject: "Invoice", mode: "direct" as const, quoted: "", tooLarge: null };
    const out = toChatMessage(t, msg({ channel: "email", context: { email } }), null);
    expect(out.content).toBeTruthy();
    expect(out.mark?.icon).toBe("mail");
  });

  it("turns an answer with steps and an error of the model", () => {
    const step = { id: "s1", server: "github", tool: "search", summary: "search — done", status: "error" as const };
    const out = toChatMessage(t, msg({ id: "a", role: "assistant", text: "", status: "failed", errorClass: "rate_limit", toolSteps: [step] }), null);
    expect(out.steps).toEqual([{ id: "s1", text: "github: done", title: "search — done", status: "error" }]);
    expect(out.error?.transient).toBe(true);
    expect(toChatMessage(t, msg({ role: "assistant", status: "failed", errorClass: "auth" }), null).error?.transient).toBe(false);
    // FTR.NAB.CHAT-0001 ATT-01: the files the agent sent are drawn under the answer with their type for the preview
    const sent = msg({ role: "assistant", attachments: [{ id: "f2", fileName: "chart.png", mimeType: "image/png", size: 2048 }] });
    expect(toChatMessage(t, sent, null).attachments).toEqual([{ id: "f2", fileName: "chart.png", mimeType: "image/png", size: 2048, href: "/api/v1/attachments/f2" }]);
  });

  it("lists conversations by group, a mail topic with its icon", () => {
    const c: Conversation = { id: "c1", kind: "topic", title: "Invoice", lastMessageAt: null, archivedAt: null, createdAt: "2026-10-01T09:00:00Z", source: "email", unreadCount: 2, writesRequireConfirmation: true };
    expect(toChatConversation(t, c, "en")).toMatchObject({ id: "c1", group: "topic", title: "Invoice", icon: "mail", unread: 2 });
    expect(toChatConversation(t, { ...c, archivedAt: "2026-10-03T09:00:00Z" }, "en").group).toBe("archive");
    expect(toChatConversation(t, { ...c, kind: "main", title: null, source: "chat" }, "en")).toMatchObject({ group: "main", icon: "msg2" });
  });
});
