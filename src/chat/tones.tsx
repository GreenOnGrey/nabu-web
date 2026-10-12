import { Icon } from "@green-on-grey/ui-kit";
import type { Tone } from "../api/types";

/** Icon of the agent per tone (FTR.NAB.CMN-0001 design §1): business — briefcase,
 * friendly — smile, brief — lightning, mentor — book. The kit knows nothing of
 * tones (FTR.NAB.CMN-0005 R7): the match of a tone to its icon lives here. */
export const TONE_ICONS = { business: "tBusiness", friendly: "tFriendly", brief: "tBrief", mentor: "tMentor" } as const;

/** The agent's round button with the icon of its tone (R31: the tone is shown by the icon). */
export function AgentIcon({ tone, small }: { tone: Tone; small?: boolean }) {
  return <Icon name={TONE_ICONS[tone] ?? "tBusiness"} size={small ? 15 : 18} />;
}
