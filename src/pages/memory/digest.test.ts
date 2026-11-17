import { describe, expect, it } from "vitest";
import { digestChannels } from "./digest";
import type { MyChannel } from "../../api/types";

const ch = (kind: string, available: boolean): MyChannel => ({ kind: kind as MyChannel["kind"], available, reason: available ? "all_users" : "disabled" });

describe("the channels of a digest", () => {
  it("FTR.NAB.CMN-0003 design §3.1 offers the web and the channels the user may use", () => {
    expect(digestChannels([ch("telegram", true), ch("email", false), ch("vkteams", true)], "web")).toEqual([
      { value: "web", unavailable: false },
      { value: "telegram", unavailable: false },
      { value: "vkteams", unavailable: false },
    ]);
  });

  it("keeps a saved channel the user has lost, marked", () => {
    expect(digestChannels([ch("telegram", false)], "telegram")).toEqual([
      { value: "web", unavailable: false },
      { value: "telegram", unavailable: true },
    ]);
  });

  it("says nothing about a saved channel before the list of channels arrives", () => {
    expect(digestChannels(undefined, "telegram")).toEqual([
      { value: "web", unavailable: false },
      { value: "telegram", unavailable: false },
    ]);
  });

  it("never repeats a channel of the list", () => {
    expect(digestChannels([ch("telegram", true)], "telegram")).toEqual([
      { value: "web", unavailable: false },
      { value: "telegram", unavailable: false },
    ]);
  });
});
