import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "./client";

/** XMLHttpRequest followed from the test: the share of the body on its way and the answer at its end. */
class FakeXHR {
  static last: FakeXHR | undefined;
  upload = { addEventListener: (_: string, h: (e: { loaded: number; total: number; lengthComputable: boolean }) => void) => { this.share = h; } };
  status = 0;
  statusText = "";
  responseText = "";
  withCredentials = false;
  headers: Record<string, string> = {};
  body?: unknown;
  private share?: (e: { loaded: number; total: number; lengthComputable: boolean }) => void;
  private events: Record<string, () => void> = {};
  constructor() { FakeXHR.last = this; }
  open() {}
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  addEventListener(type: string, h: () => void) { this.events[type] = h; }
  send(body: unknown) { this.body = body; }
  progress(loaded: number, total: number) { this.share?.({ loaded, total, lengthComputable: true }); }
  answer(status: number, text: string) {
    this.status = status;
    this.statusText = status === 200 ? "OK" : "Bad Request";
    this.responseText = text;
    this.events.load?.();
  }
}

/** The fake of the browser for the calls of this file. */
const useFake = () => { globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest; };

describe("an upload that reports its share", () => {
  const real = globalThis.XMLHttpRequest;
  const realDocument = globalThis.document;
  // the CSRF token of the cookie goes with the body, as in `request`
  beforeEach(() => { globalThis.document = { cookie: "nabu_csrf=csrf-1" } as unknown as Document; });
  afterEach(() => {
    globalThis.XMLHttpRequest = real;
    globalThis.document = realDocument;
    FakeXHR.last = undefined;
  });

  it("FTR.NAB.CMN-0005 qa CHAT-09 follows the body and resolves the answer of the API", async () => {
    useFake();
    const shares: number[] = [];
    const done = api.upload<{ attachmentId: string }>("/api/v1/attachments", new FormData(), (s) => shares.push(s));
    const xhr = FakeXHR.last!;
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers["X-CSRF-Token"]).toBe("csrf-1");
    xhr.progress(250, 1000);
    xhr.progress(1000, 1000);
    xhr.answer(200, '{"attachmentId":"a1"}');
    await expect(done).resolves.toEqual({ attachmentId: "a1" });
    expect(shares).toEqual([0.25, 1]);
  });

  it("rejects with the code of the API as the path of fetch does", async () => {
    useFake();
    const done = api.upload("/api/v1/attachments", new FormData(), () => {});
    FakeXHR.last!.answer(413, '{"error":{"code":"too_large","message":"too large"}}');
    await expect(done).rejects.toMatchObject({ status: 413, code: "too_large", message: "too large" });
  });

  it("resolves an empty answer of 202", async () => {
    useFake();
    const done = api.upload("/api/v1/attachments", new FormData(), () => {});
    FakeXHR.last!.answer(202, "");
    await expect(done).resolves.toBeUndefined();
  });
});
