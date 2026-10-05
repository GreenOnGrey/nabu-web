import type { TFunction } from "i18next";
import { ApiError } from "../api/client";

/** User-facing text for an error: chosen by the stable API code (tech spec §15). */
export function errorText(t: TFunction, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    // The server message is passed as {reason}: e.g. why the provider refused a merge.
    const text = t(key, { ...err.details, reason: err.message, defaultValue: "" });
    return text || t("errors.generic", { code: err.code });
  }
  return t("errors.generic", { code: "client" });
}
