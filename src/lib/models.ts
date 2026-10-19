import type { Choice, ModelDef } from "../api/types";

/** A model of a connection: what identifies it in a choice. */
export type ModelId = Pick<Choice, "connectionId" | "model">;

/** The key of a model of a connection in lists and selects. */
export const choiceKey = (c: ModelId) => `${c.connectionId}/${c.model}`;

export const sameChoice = (a: ModelId | null | undefined, b: ModelId) => !!a && a.connectionId === b.connectionId && a.model === b.model;

/** A model an agent can run on (FTR.NAB.CHAT-0001 R8): it calls tools and is listed. */
export const usableModel = (m: ModelDef) => m.tools !== false && !m.embeddings && !m.gone;

/** The ids of the picked models and of those typed by hand («a, b c»), without repeats. */
export const modelIds = (picked: Iterable<string>, typed: string) => [...new Set([...picked, ...typed.split(/[\s,]+/).filter(Boolean)])];
