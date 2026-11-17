import type { MyChannel } from "../../api/types";

/** A channel of a digest (FTR.NAB.CMN-0003 qa TASK-21): the web always, the channels the user may use, and the one the task already names
 *  (FTR.NAB.CMN-0003 design §3.1, FTR.NAB.CMN-0007 R7). `unavailable` marks a saved channel that the user has lost:
 *  it stays in the list, so the card shows what the task will really do, and the choice of another one is visible. */
export interface DigestChannel {
  value: string;
  unavailable: boolean;
}

export function digestChannels(my: MyChannel[] | undefined, current: string): DigestChannel[] {
  const out: DigestChannel[] = [{ value: "web", unavailable: false }];
  for (const c of my ?? []) {
    if (c.available) out.push({ value: c.kind, unavailable: false });
  }
  // the list is still loading: the saved channel is shown, but nothing is said about its availability yet
  if (current && current !== "web" && !out.some((o) => o.value === current)) {
    out.push({ value: current, unavailable: my !== undefined });
  }
  return out;
}
