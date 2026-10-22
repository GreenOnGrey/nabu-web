import { describe, expect, it } from "vitest";
import type { Message } from "../api/types";
import { createI18n } from "../lib/i18n";
import { toChatMessage } from "./adapter";

const t = createI18n("en").t;

const notice = (m: Partial<Message>): Message => ({
  id: "n1", conversationId: "c1", role: "notice", text: "**Analysis updated · revision 4**", channel: "client:tracker", clientName: "tracker",
  payload: { kind: "discovery.revision" }, status: "done", attachments: [], toolSteps: [], model: null, errorClass: null, errorText: null,
  replyTo: null, createdAt: "2026-10-21T14:02:00Z", ...m,
});

// FTR.NAB.CHAT-0002 NW-01, NW-02: a notice of a product is the notice of the kit (ui-kit 1.9 `variant: "notice"`),
// with the mark of the product and without the actions of an answer; the kit folds a long one (NW-03).
describe("FTR.NAB.CHAT-0002 notices in the web", () => {
  it("NW-01, NW-02: a notice is drawn by the kit as a notice of the product", () => {
    const out = toChatMessage(t, notice({}), null);
    expect(out).toMatchObject({ role: "assistant", variant: "notice", text: "**Analysis updated · revision 4**", mark: { icon: "plug", text: "Tracker" } });
    expect(out.error).toBeUndefined();
    expect(out.steps).toBeUndefined();
    expect(out.content).toBeUndefined();
  });
});
