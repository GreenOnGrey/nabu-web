/** Icon of the agent per tone (FTR.NAB.CMN-0001 design §1): business — briefcase,
 * friendly — smile, brief — lightning, mentor — book. The kit knows nothing of
 * tones (FTR.NAB.CMN-0005 R7): the match of a tone to its icon lives here. */
export const TONE_ICONS = { business: "tBusiness", friendly: "tFriendly", brief: "tBrief", mentor: "tMentor" } as const;
