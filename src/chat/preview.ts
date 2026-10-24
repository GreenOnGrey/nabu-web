import type { OfficePreview } from "@green-on-grey/ui-kit/chat";
import { api, ApiError } from "../api/client";
import type { PreviewSheets } from "../api/types";

type Reason = Extract<OfficePreview, { state: "error" }>["reason"];
const REASONS: Reason[] = ["too_large", "timeout", "broken", "busy"];

/** The preview of a document or a spreadsheet as the view of the kit (FTR.NAB.CHAT-0003 tech §8.1): a file
 * of a message or of the space. 202 — it is being made, 422 — not available with its reason, 200 — a PDF of
 * the first pages or the sheets of a table. */
export async function loadOfficePreview(source: { attachment: string } | { path: string }, fileName: string): Promise<OfficePreview> {
  const q = "attachment" in source ? `attachment=${encodeURIComponent(source.attachment)}` : `path=${encodeURIComponent(source.path)}`;
  let res: Response;
  try {
    res = await api.raw(`/api/v1/preview?${q}`);
  } catch (e) {
    if (e instanceof ApiError && e.code === "preview_unavailable") {
      const reason = e.details.reason as Reason;
      const limit = Number(e.details.limitMb);
      return { state: "error", reason: REASONS.includes(reason) ? reason : "broken", limitMb: Number.isFinite(limit) ? limit : undefined };
    }
    throw e;
  }
  if (res.status === 202) return { state: "pending" };
  if ((res.headers.get("Content-Type") ?? "").startsWith("application/json")) {
    const body = (await res.json()) as PreviewSheets;
    return { state: "sheet", sheets: body.sheets.map(({ name, rows, cols, cells, merges }) => ({ name, rows, cols, cells, merges })) };
  }
  // X-Preview-Pages: «shown/total», the total is «?» when the converter did not count the pages
  const [shown, total] = (res.headers.get("X-Preview-Pages") ?? "0/?").split("/");
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1);
  return { state: "doc", blob: await res.blob(), shown: Number(shown) || 0, total: total === "?" ? null : Number(total) || null, from: ext.toUpperCase() };
}
