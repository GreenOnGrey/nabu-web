// The rules of the tab «Usage» of the catalog (FTR.NAB.CHAT-0005 R1–R31,
// design §3.1–§3.13). The server computes readiness, hints and thresholds
// (tech §«API»); this module keeps only what the screen must not decide twice:
// the order of the blocks, the sort of the table, the words of the labels and
// the validations the dialogs repeat before a request goes out.
import type {
  UsageCandidate, UsageGroupSlice, UsageImpact, UsageInterval, UsageItemCard, UsageMeta, UsagePin, UsageRow,
  UsageState, UsageStep, UsageTiles,
} from "../../api/types";

// The type lives here, next to the functions that build a request from it.
export interface UsageFilters {
  from: string;
  to: string;
  step: UsageStep;
  group: string;
  callerKind: "" | "personal" | "service" | "client";
  channel: string;
  mode: "" | "personal" | "platform";
  includeUnpublished: boolean;
  hint: string;
}

/** The paths of the report and of the actions (tech §«API»); all of them are admin paths,
 * so a user without the role gets 403 from the server and the web never sees the tab (R1, R26). */
export const USAGE_PATHS = {
  rows: "/admin/api/v1/catalog/usage",
  summary: "/admin/api/v1/catalog/usage/summary",
  item: (id: string) => `/admin/api/v1/catalog/usage/items/${id}`,
  tools: (id: string) => `/admin/api/v1/catalog/usage/items/${id}/tools`,
  candidates: "/admin/api/v1/catalog/usage/candidates",
  pins: "/admin/api/v1/catalog/usage/pins",
  exportCsv: "/admin/api/v1/catalog/usage/export.csv",
  unpublishImpact: (id: string) => `/admin/api/v1/catalog/${id}/unpublish:impact`,
  unpublish: (id: string) => `/admin/api/v1/catalog/${id}/unpublish`,
  publish: (id: string) => `/admin/api/v1/catalog/${id}/publish`,
  grantImpact: (id: string) => `/admin/api/v1/catalog/${id}/grants:impact`,
  revokeGrant: (id: string, groupId: string) => `/admin/api/v1/catalog/${id}/grants/${groupId}`,
  pinsOf: (id: string) => `/admin/api/v1/catalog/${id}/pins`,
  pin: (id: string, pinId: string) => `/admin/api/v1/catalog/${id}/pins/${pinId}`,
} as const;

/** The tab «Usage» sits beside the items of the catalog (R1, design §3.1). */
export const CATALOG_TABS = ["items", "usage"] as const;
export type CatalogTab = (typeof CATALOG_TABS)[number];

/** The states in the order the server suppresses a hint (R8–R11); the screen repeats it
 * in the footnote and never reorders hints on its own. */
export const SUPPRESSION_ORDER: UsageState[] = [
  "not_granted", "unpublished", "unavailable", "young", "pinned", "service_only", "dormant", "unused",
];

/** The seven reasons of «candidates for review» (R20, design §3.2). */
export const CANDIDATE_REASONS = [
  "not_granted", "tools_overlap", "tools_many", "new_position", "service_only", "many_auth", "unavailable",
] as const;
export type CandidateReason = (typeof CANDIDATE_REASONS)[number];

/** The blocks of the tab from top to bottom (ADM-03, design §3.1). */
export function usageSections(): string[] {
  return ["header", "banner", "tiles", "candidates", "filters", "table", "thresholds"];
}

/** The blocks of the card of an item from top to bottom (ADM-04, design §3.5). */
export function itemCardSections(): string[] {
  return ["publication", "calls", "groups", "tools", "overlap", "pins"];
}

/** The columns of the flat table (R17, TBL-05); most of them can be hidden,
 * the item and its state never are. `auth` is a column, not a state (R10, AUT-03). */
export function usageColumns(): { key: string; hiddenByDefault?: boolean }[] {
  return [
    { key: "item" }, { key: "hints" }, { key: "state" }, { key: "tools" }, { key: "calls" },
    { key: "adminCalls" }, { key: "serviceCalls" }, { key: "users" }, { key: "success" }, { key: "errors" },
    { key: "auth" }, { key: "sessions", hiddenByDefault: true }, { key: "confirmations", hiddenByDefault: true },
    { key: "latency", hiddenByDefault: true }, { key: "lastCall" }, { key: "calls90" },
  ];
}

// ─── period, filters and requests ────────────────────────────────────

/** The day of an RFC 3339 stamp as `YYYY-MM-DD`; the report works in whole days. */
export function day(iso: string): string {
  return iso.slice(0, 10);
}

/** Whole days from `a` to `b`, at least zero; used by the labels «снята N дней» and «молодая». */
export function daysBetween(a: string, b: string): number {
  const ms = new Date(day(b)).getTime() - new Date(day(a)).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** The period of a new tab: the last 30 days, up to today (R2). */
export function defaultPeriod(now: Date): { from: string; to: string } {
  const to = day(now.toISOString());
  const from = day(new Date(now.getTime() - 29 * 86_400_000).toISOString());
  return { from, to };
}

/** A period never starts before the first day of data (R6): `from` earlier than
 * `dataFrom` is not an error, the report simply starts at `dataFrom` (RDY-03). */
export function clampPeriod(from: string, to: string, dataFrom: string): { from: string; to: string } {
  return { from: from < dataFrom ? dataFrom : from, to };
}

/** The filters of a new tab (R2, design §3.1): all published items, implicit groups off. */
export function defaultFilters(now: Date): UsageFilters {
  return { ...defaultPeriod(now), step: "day", group: "", callerKind: "", channel: "", mode: "", includeUnpublished: false, hint: "" };
}

/** The query of the report; the CSV repeats exactly these filters (R25, CSV-01). */
export function usageParams(f: UsageFilters): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { from: f.from, to: f.to, step: f.step };
  if (f.group) out.group = f.group;
  if (f.callerKind) out.callerKind = f.callerKind;
  if (f.channel) out.channel = f.channel;
  if (f.mode) out.mode = f.mode;
  if (f.includeUnpublished) out.includeUnpublished = true;
  if (f.hint) out.hint = f.hint;
  return out;
}

/** How many filters differ from the defaults; the badge of the «Filters» button (design §3.1). */
export function filterCount(f: UsageFilters, now: Date): number {
  const d = defaultFilters(now);
  let n = 0;
  if (f.group) n++;
  if (f.callerKind) n++;
  if (f.channel) n++;
  if (f.mode) n++;
  if (f.includeUnpublished !== d.includeUnpublished) n++;
  if (f.hint) n++;
  if (f.step !== d.step) n++;
  if (f.from !== d.from || f.to !== d.to) n++;
  return n;
}

/** The address of the CSV with the filters of the screen (R25); it is a GET of the admin API. */
export function exportPath(f: UsageFilters): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(usageParams(f))) q.set(k, String(v));
  return `${USAGE_PATHS.exportCsv}?${q.toString()}`;
}

/** The columns of the CSV: the columns of the screen and no personalities (R25, R26, CSV-02). */
export const CSV_COLUMNS = [
  "item", "type", "mode", "published", "published_at", "unpublished_at", "tools", "calls", "admin_calls",
  "service_calls", "users", "sessions", "ok", "errors_by_code", "auth_calls", "denied_calls", "p50_ms", "p95_ms",
  "last_call_at", "calls_90", "available_days", "hints", "state",
] as const;

/** A row as the CSV prints it: the same numbers as the table, never a person (R25). */
export function csvCells(row: UsageRow): Record<(typeof CSV_COLUMNS)[number], string> {
  return {
    item: row.itemName,
    type: row.itemType,
    mode: row.mode ?? "",
    published: row.published ? "true" : "false",
    published_at: row.publishedAt ?? "",
    unpublished_at: row.unpublishedAt ?? "",
    tools: row.toolCount === null ? "" : String(row.toolCount),
    calls: String(row.calls),
    admin_calls: String(row.adminCalls),
    service_calls: String(row.serviceCalls),
    users: String(row.users),
    sessions: String(row.sessions),
    ok: String(row.ok),
    errors_by_code: Object.entries(row.errorsByCode).map(([code, n]) => `${code}=${n}`).join(" "),
    auth_calls: String(row.authCalls),
    denied_calls: String(row.deniedCalls),
    p50_ms: row.p50Ms === null ? "" : String(row.p50Ms),
    p95_ms: row.p95Ms === null ? "" : String(row.p95Ms),
    last_call_at: row.lastCallAt ?? "",
    calls_90: String(row.calls90),
    available_days: String(row.availableDays),
    hints: row.hints.join(" "),
    state: row.state,
  };
}

/** The footnote of the export (R25, R26, design §3.13). */
export function csvNoteKey(): string {
  return "admin.catalogUsage.csvNote";
}

// ─── readiness and freshness (R5, R6) ────────────────────────────────

export interface Readiness {
  /** the banner «observation since <date>, N days left» is shown (R6) */
  banner: boolean;
  hintsReady: boolean;
  goalReady: boolean;
  /** the window the hint waits for; it is the configured one (R7, CFG-02) */
  hintDays: number;
  goalDays: number;
  observedDays: number;
  /** days left until the hint window, derived from the window itself (R6) */
  leftDays: number;
  /** days left until the goal window */
  goalLeftDays: number;
  /** progress towards the hint window, 0–100 */
  hintPercent: number;
  /** progress towards the goal window, 0–100 (the tile shows it instead of a value) */
  goalPercent: number;
}

/** What the header and the banner say about readiness (R6); before the hint window
 * there is not a single «unused» hint, before the goal window the tile is a progress. */
export function readiness(meta: UsageMeta): Readiness {
  const hintDays = meta.thresholds.unusedDays;
  const goalDays = meta.windows.goalDays;
  const observedDays = meta.ready.observationDays;
  const percent = (target: number) => (target <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((100 * observedDays) / target))));
  return {
    banner: !meta.ready.hints,
    hintsReady: meta.ready.hints,
    goalReady: meta.ready.goal,
    hintDays,
    goalDays,
    observedDays,
    leftDays: Math.max(0, hintDays - observedDays),
    goalLeftDays: Math.max(0, goalDays - observedDays),
    hintPercent: percent(hintDays),
    goalPercent: percent(goalDays),
  };
}

export interface Freshness {
  minutes: number;
  /** «обновление задержалось»: the last recompute is older than an hour (R5, UI-02) */
  stale: boolean;
}

/** How old the report is (R5): a recompute older than an hour makes the label amber. */
export function freshness(updatedAt: string, now: Date): Freshness {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(updatedAt).getTime()) / 60_000));
  return { minutes, stale: minutes > 60 };
}


// ─── thresholds (R7, CFG-01) ────────────────────────────────────────

/** Every window and threshold the report uses, with the value the server sent (R7);
 * the footnote shows all of them and no environment variable name (CFG-01). */
export function thresholdItems(meta: UsageMeta): { code: string; value: number }[] {
  const t = meta.thresholds;
  return [
    { code: "unusedDays", value: t.unusedDays },
    { code: "referenceDays", value: t.referenceDays },
    { code: "pinDays", value: t.pinDays },
    { code: "singleUserMax", value: t.singleUserMax },
    { code: "errorsShare", value: t.errorsShare },
    { code: "errorsMinCalls", value: t.errorsMinCalls },
    { code: "authShare", value: t.authShare },
    { code: "authMinCalls", value: t.authMinCalls },
    { code: "toolsCandidate", value: t.toolsCandidate },
    { code: "drilldownDays", value: meta.windows.drilldownDays },
    { code: "resolvedTarget", value: 0.3 },
  ];
}

// ─── the flat table (R17–R19, R23) ──────────────────────────────────

/** The share of successful calls; `auth` and `denied` stay out of the denominator (R9, R10). */
export function successShare(row: Pick<UsageRow, "calls" | "ok" | "authCalls" | "deniedCalls">): number | null {
  const actual = row.calls - row.authCalls - row.deniedCalls;
  return actual <= 0 ? null : row.ok / actual;
}

/** The rows the table shows: withdrawn items only under «including withdrawn» (R23, CUT-01). */
export function visibleRows(rows: UsageRow[], includeUnpublished: boolean): UsageRow[] {
  return includeUnpublished ? rows : rows.filter((r) => r.published);
}

/** Calls that matched no item of the catalog (R23, CUT-03): the zero UUID and no groups. */
export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
export function outsideRows(rows: UsageRow[]): UsageRow[] {
  return rows.filter((r) => r.itemId === ZERO_UUID || r.itemType === "unknown");
}
export function catalogRows(rows: UsageRow[]): UsageRow[] {
  return rows.filter((r) => r.itemId !== ZERO_UUID && r.itemType !== "unknown");
}
/** A row of an item deleted from the catalog: it has a tombstone date and no metrics (R23, CUT-02). */
export function deletedRows(rows: UsageRow[]): UsageRow[] {
  return rows.filter((r) => r.deletedAt !== null);
}

/** Badges of hints and the «затихла» mark (R8–R11, HNT-01, REF-01); a skill never gets «unused» (R24, HNT-03). */
export function rowBadges(row: Pick<UsageRow, "itemType" | "hints" | "state">): string[] {
  if (row.itemType === "skill") return row.state === "pinned" ? ["pinned"] : [];
  const out: string[] = [...row.hints];
  if (row.state === "dormant" && !out.includes("dormant")) out.unshift("dormant");
  if (row.state === "pinned" && !out.includes("pinned")) out.push("pinned");
  return out;
}

/** What a row offers first (R11, REF-01): a dormant item is not «снять» first, it is «открыть»;
 * a withdrawn item is «вернуть в публикацию»; a live unused one may be withdrawn. */
export function primaryAction(row: Pick<UsageRow, "state" | "published">): "unpublish" | "publish" | "open" {
  if (!row.published || row.state === "unpublished") return "publish";
  if (row.state === "dormant") return "open";
  return row.state === "unused" ? "unpublish" : "open";
}

/** The sort of the table (ADM-03, design §3.1): hints first, then the share of errors, then the quietest. */
function hintWeight(r: UsageRow): number {
  const b = rowBadges(r);
  if (r.state === "errors_only" || b.includes("errors_only")) return 4;
  if (r.state === "dormant" || b.includes("dormant")) return 3;
  if (r.state === "unused" || b.includes("unused")) return 2;
  if (b.length > 0) return 1;
  return 0;
}

export function sortUsageRows(rows: UsageRow[]): UsageRow[] {
  const weight = hintWeight;
  return rows.toSorted((a, b) => {
    const w = weight(b) - weight(a);
    if (w !== 0) return w;
    const e = (successShare(a) ?? 1) - (successShare(b) ?? 1);
    if (e !== 0) return e;
    const c = a.calls - b.calls;
    if (c !== 0) return c;
    return a.itemName.localeCompare(b.itemName);
  });
}

/** The column «отклонено подтверждений» (R17): a number, or «нет данных» — not zero (TBL-02, TBL-03). */
export function confirmationsText(row: Pick<UsageRow, "confirmationsRejected">): { known: boolean; value: number | null } {
  return { known: row.confirmationsRejected !== null, value: row.confirmationsRejected };
}

/** The mode of a row (R17): personal, platform, platform read-only, or a skill. */
export function modeLabel(row: Pick<UsageRow, "itemType" | "mode">): "skill" | "personal" | "platform" | "unknown" {
  if (row.itemType === "skill") return "skill";
  if (row.mode === "personal") return "personal";
  if (row.mode === "platform") return "platform";
  return "unknown";
}

/** Groups of the card: implicit ones are hidden until «show implicit» (R18, GRP-03). */
export function visibleGroups(groups: UsageGroupSlice[], showImplicit: boolean): UsageGroupSlice[] {
  return showImplicit ? groups : groups.filter((g) => g.builtin === null);
}

/** The control row «Все пользователи» is the total of the item, outside the tops (R18). */
export function controlGroup(groups: UsageGroupSlice[]): UsageGroupSlice | null {
  return groups.find((g) => g.builtin === "all") ?? null;
}

// ─── publication intervals (R13) ────────────────────────────────────

export interface PublicationInfo {
  publishedAt: string | null;
  unpublishedAt: string | null;
  /** «дата публикации оценочная»: published before the rollout (R13, PUB-04) */
  estimated: boolean;
  /** days the item spent withdrawn before it came back; null — it never came back (R13) */
  removedDays: number | null;
  returnedAt: string | null;
  /** days it has been published in the current interval */
  availableDays: number;
  /** «молодая»: published less than the hint window ago (R13, PUB-03) */
  young: boolean;
}

/** The intervals are oldest first; the last open one is the current state (R13, PUB-02). */
export function publicationInfo(intervals: UsageInterval[], hintDays: number, now: Date): PublicationInfo {
  const last = intervals.at(-1) ?? null;
  const prev = intervals.length > 1 ? intervals.at(-2) : null;
  const publishedAt = last?.publishedAt ?? null;
  const unpublishedAt = last?.unpublishedAt ?? null;
  const removedDays = prev?.unpublishedAt && last?.publishedAt ? daysBetween(prev.unpublishedAt, last.publishedAt) : null;
  const availableDays = publishedAt ? (unpublishedAt ? daysBetween(publishedAt, unpublishedAt) : daysBetween(publishedAt, now.toISOString())) : 0;
  return {
    publishedAt,
    unpublishedAt,
    estimated: last?.estimated ?? false,
    removedDays,
    returnedAt: removedDays === null ? null : (last?.publishedAt ?? null),
    availableDays,
    young: publishedAt !== null && unpublishedAt === null && daysBetween(publishedAt, now.toISOString()) < hintDays,
  };
}

/** «снята N дней, возвращена <дата>» — the one sentence of the card and of the confirmation (R13, ACT-08, ACT-13). */
export function withdrawnNote(info: PublicationInfo): { removedDays: number; returnedAt: string } | null {
  return info.removedDays === null || info.returnedAt === null ? null : { removedDays: info.removedDays, returnedAt: info.returnedAt };
}

/** The «young» state of a table row (R13, PUB-03). */
export function isYoung(publishedAt: string | null, unpublishedAt: string | null, hintDays: number, now: Date): boolean {
  if (publishedAt === null || unpublishedAt !== null) return false;
  return daysBetween(publishedAt, now.toISOString()) < hintDays;
}

/** The mark of a withdrawn row (R23, CUT-01): the date it was withdrawn. */
export function withdrawnLabel(row: Pick<UsageRow, "published" | "unpublishedAt">): { withdrawn: boolean; at: string | null } {
  return { withdrawn: !row.published, at: row.unpublishedAt };
}

/** A deleted item is a tombstone line without metrics (R23, CUT-02). */
export function deletedLabel(row: Pick<UsageRow, "deletedAt">): { deleted: boolean; at: string | null } {
  return { deleted: row.deletedAt !== null, at: row.deletedAt };
}

// ─── the drill-down (R21) ───────────────────────────────────────────

export interface DrilldownWindow {
  from: string;
  to: string;
  /** the asked period was longer than the drill-down window and was cut (DRL-02) */
  clamped: boolean;
}

/** The window of the drill-down is never longer than the configured one (R21, DRL-02). */
export function drilldownWindow(from: string, to: string, drilldownDays: number): DrilldownWindow {
  const span = daysBetween(from, to) + 1;
  if (span <= drilldownDays) return { from, to, clamped: false };
  const start = new Date(new Date(day(to)).getTime() - (drilldownDays - 1) * 86_400_000).toISOString();
  return { from: day(start), to, clamped: true };
}

/** p50/p95 as the table prints them (R17, R21). */
export function latencyText(p50: number | null, p95: number | null): string | null {
  if (p50 === null && p95 === null) return null;
  return `${p50 ?? "—"} / ${p95 ?? "—"}`;
}

// ─── candidates (R20, R10, R15) ─────────────────────────────────────

/** «много инструментов» — at least the configured number of allowed tools (R20, CST-04). */
export function isToolsMany(tools: number | null, threshold: number): boolean {
  return tools !== null && tools >= threshold;
}

/** The chips of the panel with the number of candidates per reason (design §3.2). */
export function reasonCounts(candidates: UsageCandidate[]): { reason: CandidateReason; count: number }[] {
  return CANDIDATE_REASONS.map((reason) => ({ reason, count: candidates.filter((c) => c.reasons.includes(reason)).length }));
}

/** «много ошибок авторизации» needs both the share and the calls (R10, CST-03): 60 % at 10 calls is not enough. */
export function hasManyAuth(authShare: number | null, calls: number, meta: UsageMeta): boolean {
  return authShare !== null && authShare >= meta.thresholds.authShare && calls >= meta.thresholds.authMinCalls;
}

/** A candidate whose reason is «unavailable» carries the date of the last successful check,
 * or nothing when the item was never checked (R15, UNV-03). */
export function candidateCheck(c: Pick<UsageCandidate, "reasons" | "lastOkAt">): { unavailable: boolean; lastOkAt: string | null } {
  return { unavailable: c.reasons.includes("unavailable"), lastOkAt: c.reasons.includes("unavailable") ? c.lastOkAt : null };
}

// ─── «unavailable» is not «unused» (R15) ────────────────────────────

/** «недоступна» is a failed check only; `unconfigured` is the start catalog, not an error (R15, UNV-05). */
export function isUnavailable(status: string | null): boolean {
  return status === "error";
}

/** Both times of a check: the last one of any outcome and the last successful one (R15, UI-07). */
export function checkTimes(card: Pick<UsageItemCard, "lastCheckAt" | "lastOkAt">): { lastCheckAt: string | null; lastOkAt: string | null } {
  return { lastCheckAt: card.lastCheckAt, lastOkAt: card.lastOkAt };
}

/** A hint is not put on an unavailable item, nor on a skill (R15, R24, HNT-03, HNT-04). */
export function hintSuppressed(card: Pick<UsageItemCard, "itemType" | "status" | "states">): boolean {
  return card.itemType === "skill" || isUnavailable(card.status) || card.states.some((s) => s === "unavailable" || s === "not_granted" || s === "pinned");
}

// ─── skills (R24) ──────────────────────────────────────────────────

export interface SkillTelemetry {
  /** false — «нет данных о применении», not zero activations (R24, SKL-01) */
  hasData: boolean;
  activations: number | null;
  sessions: number | null;
  /** the card always explains that implicit use is not recorded (R24, ACT-14) */
  incomplete: true;
}

/** Skills count explicit activations and collected sessions only (R24, AGG-09, SKL-01–SKL-03). */
export function skillTelemetry(card: Pick<UsageItemCard, "skillActivations" | "skillSessions">): SkillTelemetry {
  const activations = card.skillActivations;
  const sessions = card.skillSessions;
  return { hasData: activations !== null || sessions !== null, activations, sessions, incomplete: true };
}

/** A skill never gets «unused», and never enters the goal metric (R24, HNT-03, SKL-04). */
export function skillInGoal(itemType: UsageRow["itemType"]): boolean {
  return itemType === "mcp";
}

// ─── the tiles (R16, R14) ──────────────────────────────────────────

export interface DeadShareView {
  mode: "value" | "progress" | "empty";
  value: number | null;
  percent: number;
  dead: number | null;
  total: number | null;
  baseline: number | null;
  delta: number | null;
  verifiedManuallyAt: string | null;
  droppedOut: { total: number; withCalls: number } | null;
}

/** The «dead share» tile: a value after 90 days, a progress of the observation before (R6, R14, RDY-02, RDY-05). */
export function deadShareView(tiles: UsageTiles, meta: UsageMeta): DeadShareView {
  const d = tiles.deadShare;
  const r = readiness(meta);
  if (!meta.ready.goal || d.value === null) {
    return { mode: "progress", value: null, percent: r.goalPercent, dead: d.dead, total: d.total, baseline: null, delta: null, verifiedManuallyAt: null, droppedOut: null };
  }
  return {
    mode: "value", value: d.value, percent: Math.min(100, Math.max(0, d.value)), dead: d.dead, total: d.total,
    baseline: d.baseline, delta: d.delta, verifiedManuallyAt: d.verifiedManuallyAt, droppedOut: d.droppedOut,
  };
}

/** The composition of «the share of successful calls» (R16, TIL-02): all actual calls of the
 * published items, admins and «outside the catalog» included; `auth` and `denied` out of the denominator. */
export function successComposition(tiles: UsageTiles): { value: number | null; auth: number; denied: number; outsideIncluded: true } {
  return { value: tiles.platformSuccess.value, auth: tiles.platformSuccess.auth, denied: tiles.platformSuccess.denied, outsideIncluded: true };
}

/** «разобрано кандидатов» is not a goal: it always carries the note and the target (R16, design §3.1). */
export function resolvedView(tiles: UsageTiles): { value: number; resolved: number; candidates: number; target: number; notGoal: true } {
  return {
    value: tiles.resolvedCandidates.value, resolved: tiles.resolvedCandidates.resolved,
    candidates: tiles.resolvedCandidates.candidates, target: tiles.resolvedCandidates.target, notGoal: true,
  };
}

// ─── the actions (R27–R30) ─────────────────────────────────────────

export interface UnpublishInput {
  name: string;
  reason: string;
  confirmName: string;
  connections: number;
}

/** The dialogs validate before the request: a reason always, the name when there are
 * connections to delete (R27, ACT-02, ACT-03). The server repeats the same codes. */
export function unpublishError(input: UnpublishInput): "reason_required" | "name_mismatch" | null {
  if (input.reason.trim() === "") return "reason_required";
  if (input.connections > 0 && input.confirmName.trim() !== input.name) return "name_mismatch";
  return null;
}

/** What a withdrawal touches (R27, ACT-01): users, connections, groups, agents and their tasks. */
export function impactCounts(impact: UsageImpact): {
  users: number; connections: number; groups: number; agents: number; clients: number; tasks: number;
} {
  const tasks = impact.collectionTasks.length + impact.serviceAgents.reduce((n, a) => n + a.tasks.length, 0);
  return {
    users: impact.users,
    connections: impact.connections,
    groups: impact.grants.length,
    agents: impact.serviceAgents.length,
    clients: impact.serviceClients.length,
    tasks,
  };
}

/** The warnings of the confirmation (R27, ACT-07, ACT-08): the calls of the 90-day window
 * and the incomplete window of an item that has just come back. */
export function impactWarnings(impact: Pick<UsageImpact, "calls90" | "lastCallAt" | "publication">): string[] {
  const out: string[] = [];
  if (impact.calls90 > 0) out.push("calls90");
  if (impact.publication.windowIncomplete || impact.publication.removedDays !== undefined) out.push("incompleteWindow");
  return out;
}

/** The preview of revoking one grant shows that group only (R28, ACT-10). */
export function revokeImpact(impact: UsageImpact, groupId: string): UsageImpact {
  return { ...impact, grants: impact.grants.filter((g) => g.groupId === groupId) };
}

/** The confirmations field is not asked when nothing is deleted (R27, ACT-03). */
export function needsConfirmName(impact: Pick<UsageImpact, "connections">): boolean {
  return impact.connections > 0;
}

/** A withdrawal of a skill has no cascade and says so (R30, ACT-14). */
export function skillImpactNote(type: UsageImpact["item"]["type"]): "skillTelemetry" | null {
  return type === "skill" ? "skillTelemetry" : null;
}

export interface PinInput {
  reason: string;
  reviewAt: string;
}

/** Pins need a reason and a date in the future (R12, PIN-03). */
export function pinError(input: PinInput, now: Date): "reason_required" | "review_at_past" | null {
  if (input.reason.trim() === "") return "reason_required";
  const at = new Date(input.reviewAt).getTime();
  if (input.reviewAt !== "" && (!Number.isFinite(at) || at <= now.getTime())) return "review_at_past";
  return null;
}

/** The default review date: now plus the configured period (R7, R12, PIN-04). */
export function defaultReviewAt(now: Date, pinDays: number): string {
  return new Date(now.getTime() + pinDays * 86_400_000).toISOString();
}

/** An effective pin hides the hint; an overdue one does not and is listed apart (R12, PIN-02). */
export function pinState(pin: Pick<UsagePin, "releasedAt" | "reviewAt">, now: Date): "released" | "overdue" | "effective" {
  if (pin.releasedAt !== null) return "released";
  return new Date(pin.reviewAt).getTime() <= now.getTime() ? "overdue" : "effective";
}

export function overduePins(pins: UsagePin[], now: Date): UsagePin[] {
  return pins.filter((p) => pinState(p, now) === "overdue");
}

/** Publication does not resume paused tasks; the confirmation says how many wait (R29, ACT-12). */
export function pendingTasks(card: Pick<UsageItemCard, "unresolvedTasks">): number {
  return card.unresolvedTasks.length;
}

// ─── the overlap (R22) ─────────────────────────────────────────────

/** Shared tool names of two items — a reference only, never a recommendation (R22, OVL-01). */
export function overlapLines(overlap: { itemId: string; itemName: string; tools: string[] }[]): { itemName: string; tools: string[] }[] {
  return overlap.map((o) => ({ itemName: o.itemName, tools: o.tools }));
}

/** The wording of the reference: no «дубль» and no action (R22, OVL-02). */
export const OVERLAP_NOTE_KEY = "admin.catalogUsage.overlapNote";

// ─── privacy and money (R25, R26, R16) ────────────────────────────

/** Keys the report must never have: money, tokens and personalities (R16, R25, R26, TIL-04).
 * The report counts people, it never names them. */
const FORBIDDEN_KEYS = /(cost|price|usd|token|money|email|user_?id|user_?name|person|@)/i;

/** True when an answer carries a monetary or personal field; a test keeps it false for every answer. */
export function hasMoneyOrPersonalities(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(hasMoneyOrPersonalities);
  if (typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([k, v]) => FORBIDDEN_KEYS.test(k) || hasMoneyOrPersonalities(v));
}

/** A personal field of the report: the screen has none, the API has none (R26, CAL-03). */
export function hasPersonalities(value: unknown): boolean {
  return hasMoneyOrPersonalities(value);
}
