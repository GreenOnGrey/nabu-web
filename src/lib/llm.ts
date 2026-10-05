import type { TFunction } from "i18next";

/** The user's text of a model error class (FTR.NAB.CMN-0001 R21). */
export function llmErrorText(t: TFunction, errorClass: string): string {
  return t(`llm.errors.${errorClass}`, { defaultValue: t("llm.errors.bad_request") });
}

/** Errors the user can fix by waiting; the others need an administrator. */
export const transientLLMError = (errorClass: string) =>
  errorClass === "rate_limit" || errorClass === "unavailable" || errorClass === "agent_crashed" || errorClass === "agent_busy";
