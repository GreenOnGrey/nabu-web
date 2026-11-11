import { describe, expect, it } from "vitest";
import type {
  UsageCandidate, UsageImpact, UsageInterval, UsageItemCard, UsageMeta, UsagePin, UsageRow, UsageTiles,
} from "../../api/types";
import { createI18n } from "../../lib/i18n";
import {
  CATALOG_TABS, CANDIDATE_REASONS, CSV_COLUMNS, OVERLAP_NOTE_KEY, SUPPRESSION_ORDER, USAGE_PATHS, ZERO_UUID, candidateCheck,
  catalogRows, checkTimes, clampPeriod, confirmationsText, controlGroup, csvCells, csvNoteKey, day, daysBetween, deadShareView,
  defaultFilters, defaultPeriod, defaultReviewAt, deletedLabel, drilldownWindow, exportPath, filterCount, freshness,
  hasManyAuth, hasMoneyOrPersonalities, hasPersonalities, hintSuppressed, impactCounts, impactWarnings, isToolsMany,
  isUnavailable, isYoung, itemCardSections, latencyText, modeLabel, needsConfirmName, outsideRows, overduePins, overlapLines, pinError,
  pendingTasks, pinState, primaryAction, publicationInfo, readiness, reasonCounts, resolvedView, revokeImpact, rowBadges,
  skillImpactNote, skillInGoal, skillTelemetry, sortUsageRows, successComposition, successShare, thresholdItems, unpublishError,
  usageColumns, usageParams, usageSections, visibleGroups, visibleRows, withdrawnLabel, withdrawnNote,
} from "./catalogUsage";

// FTR.NAB.CHAT-0005 qa: the web side of the tab «Usage» of the catalog.

const NOW = new Date("2026-03-02T14:20:00Z");
const iso = (daysFromNow: number) => new Date(NOW.getTime() + daysFromNow * 86_400_000).toISOString();

const meta = (over: Partial<UsageMeta> = {}): UsageMeta => ({
  dataFrom: "2026-01-15",
  updatedAt: "2026-03-02T14:05:00Z",
  ready: { quick: true, hints: true, goal: true, observationDays: 46, observationLeft: 44 },
  windows: { hintDays: 30, referenceDays: 90, goalDays: 90, drilldownDays: 31 },
  thresholds: {
    unusedDays: 30, referenceDays: 90, pinDays: 90, singleUserMax: 1,
    errorsShare: 0.7, errorsMinCalls: 20, authShare: 0.5, authMinCalls: 20, toolsCandidate: 10,
  },
  goalMetric: { value: 15, baseline: 22.5, delta: -7.5, verifiedManuallyAt: "2026-04-01" },
  windowClamped: false,
  ...over,
});

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  itemId: "11111111-1111-1111-1111-111111111111",
  itemName: "Jira",
  itemType: "mcp",
  mode: "platform",
  published: true,
  publishedAt: "2025-12-01T09:00:00Z",
  unpublishedAt: null,
  deletedAt: null,
  toolCount: 12,
  calls: 310,
  adminCalls: 12,
  serviceCalls: 40,
  users: 7,
  sessions: 22,
  ok: 280,
  errorsByCode: { tool_error: 18, transport_error: 6, auth: 4, denied: 2 },
  authCalls: 4,
  deniedCalls: 2,
  p50Ms: 420,
  p95Ms: 2600,
  lastCallAt: "2026-02-27T11:00:00Z",
  calls90: 940,
  availableDays: 30,
  hints: [],
  state: "active",
  confirmationsRejected: null,
  groups: [{ groupId: "g1", groupName: "Бухгалтерия", builtin: null, calls: 310 }],
  ...over,
});

const tiles = (over: Partial<UsageTiles> = {}): UsageTiles => ({
  deadShare: {
    value: 15, dead: 6, total: 40, baseline: 22.5, delta: -7.5,
    verifiedManuallyAt: "2026-04-01", droppedOut: { total: 3, withCalls: 1 },
  },
  publishedToolCount: { value: 168, trend: [{ day: "2026-01-15", value: 180 }] },
  platformSuccess: { value: 0.91, denied: 34, auth: 120, trend: [{ day: "2026-01-15", value: 0.88 }] },
  resolvedCandidates: { value: 0.33, resolved: 4, candidates: 12, target: 0.3, note: "not_goal" },
  topCalls: [{ itemId: "i1", itemName: "Jira", calls: 310 }],
  topErrors: [{ itemId: "i1", itemName: "Figma", code: "tool_error", calls: 18 }],
  unusedCount: 9,
  pinnedUnused: 2,
  ...over,
});

const impact = (over: Partial<UsageImpact> = {}): UsageImpact => ({
  item: { id: "i1", name: "Яндекс Почта", type: "mcp", mode: "personal", published: true },
  grants: [
    { groupId: "g1", groupName: "Бухгалтерия", builtin: null, users: 14 },
    { groupId: "g2", groupName: "Продажи", builtin: null, users: 18 },
    { groupId: "g3", groupName: "Все пользователи", builtin: "all", users: 37 },
  ],
  users: 37,
  connections: 12,
  collectionTasks: [
    { taskId: "t1", userEmail: "a@b.c", title: "Сбор почты" },
    { taskId: "t2", userEmail: "d@e.f", title: "Сбор почты" },
    { taskId: "t3", userEmail: "g@h.i", title: "Разбор встреч" },
  ],
  serviceAgents: [
    { name: "night-report", tasks: [{ taskId: "t4", title: "Ночной отчёт" }] },
    { name: "mail-digest", tasks: [] },
  ],
  serviceClients: [{ clientId: "c1", name: "hammurapi", agents: ["night-report"] }],
  calls90: 43,
  lastCallAt: "2025-11-02T08:00:00Z",
  publication: { publishedAt: "2025-10-01T10:00:00Z", unpublishedAt: null, availableDays: 62, removedDays: 200, windowIncomplete: true },
  ...over,
});

const card = (over: Partial<UsageItemCard> = {}): UsageItemCard => ({
  itemId: "i1", itemName: "Яндекс Почта", itemTitle: "Яндекс Почта", itemType: "mcp", mode: "personal", status: "ok",
  published: true, publishedAt: "2025-10-01T10:00:00Z", unpublishedAt: null, publishedEstimated: false,
  lastCheckAt: "2026-03-01T10:00:00Z", lastOkAt: "2026-02-28T09:00:00Z", toolCount: 4,
  calls: 34, adminCalls: 0, serviceCalls: 0, users: 1, sessions: 3, ok: 34, authCalls: 0, deniedCalls: 0,
  p50Ms: 420, p95Ms: 1100, lastCallAt: "2026-02-03T09:12:00Z", calls90: 34, availableDays: 30,
  hints: [], states: [], skillActivations: null, skillSessions: null, unresolvedTasks: [],
  ...over,
});

describe("FTR.NAB.CHAT-0005 place of the report and the contract (R1, R26)", () => {
  it("ADM-01: the catalog offers the tab «Usage» beside its items", () => {
    expect(CATALOG_TABS).toEqual(["items", "usage"]);
  });

  it("ADM-02: every report and action goes through the admin API and nowhere else", () => {
    const paths = Object.values(USAGE_PATHS).flatMap((p) => (typeof p === "function" ? [p("i1", "p1")] : [p]));
    expect(paths.length).toBeGreaterThan(10);
    for (const p of paths) expect(p.startsWith("/admin/api/v1/catalog/")).toBe(true);
    expect(paths).toContain("/admin/api/v1/catalog/usage");
    expect(paths).toContain("/admin/api/v1/catalog/usage/summary");
    expect(paths).toContain("/admin/api/v1/catalog/usage/export.csv");
    expect(paths.some((p) => p.endsWith("/unpublish"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/publish"))).toBe(true);
    expect(paths.some((p) => p.includes("/pins"))).toBe(true);
  });

  it("ADM-03: candidates stand above the table and the table sorts by hints and errors", () => {
    expect(usageSections()).toEqual(["header", "banner", "tiles", "candidates", "filters", "table", "thresholds"]);
    const quiet = row({ itemId: "a", itemName: "quiet", calls: 10, ok: 10, hints: [], state: "active" });
    const broken = row({ itemId: "b", itemName: "broken", calls: 25, ok: 5, hints: ["errors_only"], state: "errors_only" });
    const unused = row({ itemId: "c", itemName: "unused", calls: 0, ok: 0, hints: ["unused"], state: "unused" });
    const dormant = row({ itemId: "d", itemName: "dormant", calls: 0, ok: 0, hints: ["unused", "dormant"], state: "dormant" });
    expect(sortUsageRows([quiet, unused, dormant, broken]).map((r) => r.itemName)).toEqual(["broken", "dormant", "unused", "quiet"]);
  });

  it("ADM-04: the card shows groups, intervals, tools and pins in that order", () => {
    expect(itemCardSections()).toEqual(["publication", "calls", "groups", "tools", "overlap", "pins"]);
  });
});

describe("FTR.NAB.CHAT-0005 thresholds and readiness (R5–R7)", () => {
  it("CFG-01: the footnote lists every threshold of the answer and no variable name", () => {
    const items = thresholdItems(meta());
    expect(items.map((i) => i.code)).toEqual([
      "unusedDays", "referenceDays", "pinDays", "singleUserMax", "errorsShare", "errorsMinCalls", "authShare", "authMinCalls",
      "toolsCandidate", "drilldownDays", "resolvedTarget",
    ]);
    const by = Object.fromEntries(items.map((i) => [i.code, i.value]));
    expect(by).toMatchObject({ unusedDays: 30, referenceDays: 90, pinDays: 90, singleUserMax: 1, errorsShare: 0.7, errorsMinCalls: 20,
      authShare: 0.5, authMinCalls: 20, toolsCandidate: 10, drilldownDays: 31 });
    const text = items.map((i) => i.code).join(" ");
    expect(text).not.toMatch(/CATALOG_USAGE/);
  });

  it("CFG-02: a 45-day hint window moves the banner and the hint", () => {
    const m = meta({
      thresholds: { ...meta().thresholds, unusedDays: 45 },
      windows: { ...meta().windows, hintDays: 45 },
      ready: { quick: true, hints: false, goal: false, observationDays: 20, observationLeft: 25 },
    });
    const r = readiness(m);
    expect(r.hintDays).toBe(45);
    expect(r.banner).toBe(true);
    expect(r.leftDays).toBe(25);
    expect(r.hintPercent).toBe(44);
    expect(thresholdItems(m).find((i) => i.code === "unusedDays")?.value).toBe(45);
  });

  it("FRH-01: 14:20 with a tick at 14:05 is 15 minutes and not stale", () => {
    const f = freshness("2026-03-02T14:05:00Z", NOW);
    expect(f).toEqual({ minutes: 15, stale: false });
  });

  it("UI-02: an updatedAt older than an hour is marked delayed", () => {
    expect(freshness("2026-03-02T12:50:00Z", NOW).stale).toBe(true);
    expect(freshness("2026-03-02T12:50:00Z", NOW).minutes).toBe(90);
  });

  it("RDY-01: after 10 days the banner waits 20 days and no hint appears", () => {
    const m = meta({ ready: { quick: true, hints: false, goal: false, observationDays: 10, observationLeft: 20 } });
    const r = readiness(m);
    expect(r.banner).toBe(true);
    expect(r.leftDays).toBe(20);
    expect(r.hintPercent).toBe(33);
  });

  it("RDY-02: 30 days of data is not enough for the dead-share value", () => {
    const m = meta({ ready: { quick: true, hints: true, goal: false, observationDays: 30, observationLeft: 60 } });
    const view = deadShareView(tiles(), m);
    expect(view.mode).toBe("progress");
    expect(view.value).toBeNull();
    expect(view.percent).toBe(33);
  });

  it("RDY-04: after 7 days the quick hints work and «unused» still waits", () => {
    const m = meta({ ready: { quick: true, hints: false, goal: false, observationDays: 7, observationLeft: 23 } });
    const r = readiness(m);
    expect(m.ready.quick).toBe(true);
    expect(r.hintsReady).toBe(false);
    expect(r.banner).toBe(true);
    expect(r.leftDays).toBe(23);
    expect(thresholdItems(m).map((i) => i.code)).toContain("errorsMinCalls");
  });

  it("RDY-03: a period before the first day of data starts at the first day", () => {
    expect(clampPeriod("2025-11-01", "2026-03-02", "2026-01-15")).toEqual({ from: "2026-01-15", to: "2026-03-02" });
    expect(clampPeriod("2026-02-01", "2026-03-02", "2026-01-15").from).toBe("2026-02-01");
  });

  it("RDY-05: after 90 days the tile shows the value of the goal row", () => {
    const view = deadShareView(tiles(), meta());
    expect(view.mode).toBe("value");
    expect(view).toMatchObject({ value: 15, dead: 6, total: 40, baseline: 22.5, delta: -7.5, verifiedManuallyAt: "2026-04-01" });
    expect(view.droppedOut).toEqual({ total: 3, withCalls: 1 });
  });
});

describe("FTR.NAB.CHAT-0005 hints of the table (R8–R11, R24)", () => {
  it("HNT-01: an item with an explicit grant and no calls is «unused» and may be withdrawn", () => {
    const r = row({ hints: ["unused"], state: "unused", calls: 0, ok: 0 });
    expect(rowBadges(r)).toEqual(["unused"]);
    expect(primaryAction(r)).toBe("unpublish");
  });

  it("HNT-02: calls of administrators keep an item unused", () => {
    const r = row({ hints: ["unused"], state: "unused", calls: 5, adminCalls: 5, ok: 5 });
    expect(rowBadges(r)).toEqual(["unused"]);
    expect(r.adminCalls).toBe(5);
  });

  it("HNT-03: a skill without activations has no unused hint", () => {
    expect(rowBadges(row({ itemType: "skill", hints: [], state: "active" }))).toEqual([]);
    expect(hintSuppressed({ itemType: "skill", status: "ok", states: [] })).toBe(true);
  });

  it("HNT-04: five suppressed states carry no unused badge but keep their own", () => {
    const cases: [UsageRow["state"], string[]][] = [
      ["not_granted", []], ["young", []], ["service_only", []], ["unavailable", []], ["pinned", ["pinned"]],
    ];
    for (const [state, badges] of cases) {
      const r = row({ state, hints: [], itemType: "mcp" });
      expect(rowBadges(r)).toEqual(badges);
      expect(rowBadges(r)).not.toContain("unused");
    }
    for (const state of ["not_granted", "unpublished", "unavailable", "young", "pinned", "service_only", "dormant", "unused"] as const) {
      expect(SUPPRESSION_ORDER).toContain(state);
    }
  });

  it("REF-01: a dormant item is marked «затихла» and is not withdrawn first", () => {
    const r = row({ hints: ["unused"], state: "dormant", calls: 0, calls90: 21, lastCallAt: iso(-40) });
    expect(rowBadges(r)[0]).toBe("dormant");
    expect(rowBadges(r)).toContain("unused");
    expect(primaryAction(r)).toBe("open");
    expect(r.calls90).toBe(21);
  });

  it("AUT-03: a high auth share is a column and not a state", () => {
    const keys = usageColumns().map((c) => c.key);
    expect(keys).toContain("auth");
    expect(keys).not.toContain("not_connected");
    expect(SUPPRESSION_ORDER as string[]).not.toContain("not_connected");
    expect(successShare(row({ calls: 100, ok: 70, authCalls: 20, deniedCalls: 10 }))).toBe(1);
  });

  it("HNT-05: a single user is its own hint", () => {
    const r = row({ hints: ["single_user"], state: "single_user", users: 1 });
    expect(rowBadges(r)).toEqual(["single_user"]);
  });
});

describe("FTR.NAB.CHAT-0005 candidates (R20, R10, R15, R22)", () => {
  it("CST-01: candidates work from static reasons on day 10", () => {
    const m = meta({ ready: { quick: true, hints: false, goal: false, observationDays: 10, observationLeft: 20 } });
    expect(readiness(m).banner).toBe(true);
    const list: UsageCandidate[] = [
      { itemId: "a", itemName: "Grafana", itemType: "mcp", reasons: ["not_granted", "tools_many"], lastOkAt: null, calls: 0, authShare: null, tools: 14 },
      { itemId: "b", itemName: "Figma", itemType: "mcp", reasons: ["many_auth", "tools_overlap"], lastOkAt: null, calls: 54, authShare: 0.6, tools: 6 },
    ];
    const counts = reasonCounts(list);
    expect(counts).toHaveLength(CANDIDATE_REASONS.length);
    expect(counts).toHaveLength(7);
    expect(counts.find((c) => c.reason === "not_granted")?.count).toBe(1);
  });

  it("AUT-01: 60 percent auth at 30 calls is a candidate mark with the link to Connections", () => {
    expect(hasManyAuth(0.6, 30, meta())).toBe(true);
  });

  it("AUT-02: 60 percent auth at 10 calls is not the mark", () => {
    expect(hasManyAuth(0.6, 10, meta())).toBe(false);
  });

  it("CST-03: many auth needs the share and at least 20 calls", () => {
    const m = meta();
    expect(hasManyAuth(0.6, 30, m)).toBe(true);
    expect(hasManyAuth(0.6, 10, m)).toBe(false);
    expect(hasManyAuth(0.4, 30, m)).toBe(false);
  });

  it("CST-04: ten allowed tools is a candidate, nine is not", () => {
    expect(isToolsMany(10, 10)).toBe(true);
    expect(isToolsMany(9, 10)).toBe(false);
    expect(isToolsMany(null, 10)).toBe(false);
  });

  it("UNV-03: an unavailable candidate that was never checked shows no date", () => {
    expect(candidateCheck({ reasons: ["unavailable"], lastOkAt: null })).toEqual({ unavailable: true, lastOkAt: null });
    expect(candidateCheck({ reasons: ["unavailable"], lastOkAt: "2026-01-28T10:00:00Z" }).lastOkAt).toBe("2026-01-28T10:00:00Z");
    expect(candidateCheck({ reasons: ["tools_many"], lastOkAt: "2026-01-28T10:00:00Z" })).toEqual({ unavailable: false, lastOkAt: null });
  });

  it("OVL-01: three shared names of another item are a reference", () => {
    expect(overlapLines([{ itemId: "i2", itemName: "Jira", tools: ["search", "getIssue", "createIssue"] }]))
      .toEqual([{ itemName: "Jira", tools: ["search", "getIssue", "createIssue"] }]);
  });

  it("OVL-02: the wording of the overlap is no recommendation and no action", () => {
    const ru = createI18n("ru").t;
    const text = ru(OVERLAP_NOTE_KEY);
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/дубл/i);
  });
});

const intervals = (): UsageInterval[] => [
  { publishedAt: iso(-100), unpublishedAt: iso(-63), estimated: true },
  { publishedAt: iso(-3), unpublishedAt: null },
];

describe("FTR.NAB.CHAT-0005 publication window (R13)", () => {
  it("PUB-01: withdrawn 60 days and returned 3 days ago", () => {
    const info = publicationInfo(intervals(), 30, NOW);
    expect(info.removedDays).toBe(60);
    expect(info.returnedAt?.slice(0, 10)).toBe(iso(-3).slice(0, 10));
    expect(info.estimated).toBe(false);
    expect(withdrawnNote(info)).toEqual({ removedDays: 60, returnedAt: iso(-3) });
  });

  it("PUB-02: the last of the intervals is the current state", () => {
    const info = publicationInfo(intervals(), 30, NOW);
    expect(info.publishedAt).toBe(iso(-3));
    expect(info.unpublishedAt).toBeNull();
  });

  it("PUB-03: an item published 10 days ago is young", () => {
    expect(publicationInfo([{ publishedAt: iso(-10), unpublishedAt: null }], 30, NOW).young).toBe(true);
    expect(isYoung(iso(-10), null, 30, NOW)).toBe(true);
    expect(isYoung(iso(-40), null, 30, NOW)).toBe(false);
  });

  it("PUB-04: an interval estimated before the rollout is marked", () => {
    const info = publicationInfo([{ publishedAt: "2025-12-01T09:00:00Z", unpublishedAt: null, estimated: true }], 30, NOW);
    expect(info.estimated).toBe(true);
  });

  it("ACT-13: a return after 60 days is written as withdrawn 60 days", () => {
    const info = publicationInfo([{ publishedAt: iso(-70), unpublishedAt: iso(-60) }, { publishedAt: iso(0), unpublishedAt: null }], 30, NOW);
    expect(withdrawnNote(info)?.removedDays).toBe(60);
  });

  it("CUT-01: a withdrawn item appears only under «including withdrawn»", () => {
    const live = row({ itemId: "a", published: true });
    const cut = row({ itemId: "b", published: false, state: "unpublished", unpublishedAt: iso(-1) });
    expect(visibleRows([live, cut], false).map((r) => r.itemId)).toEqual(["a"]);
    expect(visibleRows([live, cut], true).map((r) => r.itemId)).toEqual(["a", "b"]);
    expect(withdrawnLabel(cut)).toEqual({ withdrawn: true, at: iso(-1) });
  });

  it("PUB-05: 90 days with 60 withdrawn leave 30 days of availability", () => {
    const info = publicationInfo([
      { publishedAt: iso(-90), unpublishedAt: iso(-60) },
      { publishedAt: iso(-30), unpublishedAt: null },
    ], 30, NOW);
    expect(info.removedDays).toBe(30);
    expect(info.availableDays).toBe(30);
  });

  it("CUT-02: a deleted item is a tombstone line without metrics", () => {
    const gone = row({ itemId: "c", published: false, calls: 0, deletedAt: "2026-01-01T00:00:00Z" });
    expect(deletedLabel(gone)).toEqual({ deleted: true, at: "2026-01-01T00:00:00Z" });
    expect(deletedLabel(row()).deleted).toBe(false);
  });
});

describe("FTR.NAB.CHAT-0005 the table (R17–R19, R23)", () => {
  it("TBL-01: the month step and a group reach the request", () => {
    const f = { ...defaultFilters(NOW), step: "month" as const, group: "g1" };
    expect(usageParams(f)).toMatchObject({ step: "month", group: "g1" });
  });

  it("TBL-02: rejected confirmations of an item are a number", () => {
    expect(confirmationsText(row({ confirmationsRejected: 3 }))).toEqual({ known: true, value: 3 });
  });

  it("TBL-03: no binding is «no data», not zero", () => {
    expect(confirmationsText(row({ confirmationsRejected: null }))).toEqual({ known: false, value: null });
  });

  it("TBL-04: a combination of filters is sent as it is", () => {
    const f = {
      ...defaultFilters(NOW), callerKind: "service" as const,
      channel: "web", mode: "platform" as const, includeUnpublished: true, hint: "unused",
    };
    expect(usageParams(f)).toEqual({
      from: "2026-02-01", to: "2026-03-02", step: "day", callerKind: "service", channel: "web", mode: "platform",
      includeUnpublished: true, hint: "unused",
    });
    expect(filterCount(f, NOW)).toBe(5);
  });

  it("TBL-05: the table carries the columns of the requirement", () => {
    expect(usageColumns().map((c) => c.key)).toEqual([
      "item", "hints", "state", "tools", "calls", "adminCalls", "serviceCalls", "users", "success", "errors", "auth",
      "sessions", "confirmations", "latency", "lastCall", "calls90",
    ]);
    expect(row({ toolCount: 12 }).toolCount).toBe(12);
    expect(modeLabel(row())).toBe("platform");
    expect(modeLabel(row({ itemType: "skill", mode: null }))).toBe("skill");
    expect(latencyText(420, 2600)).toBe("420 / 2600");
    expect(latencyText(null, null)).toBeNull();
  });

  it("GRP-03: implicit groups are hidden until asked and the total is the control row", () => {
    const groups = [
      { groupId: "g1", groupName: "Бухгалтерия", builtin: null, calls: 212 },
      { groupId: "a", groupName: "Все пользователи", builtin: "all" as const, calls: 978 },
      { groupId: "b", groupName: "Администраторы", builtin: "admins" as const, calls: 64 },
    ];
    expect(visibleGroups(groups, false).map((g) => g.groupName)).toEqual(["Бухгалтерия"]);
    expect(visibleGroups(groups, true)).toHaveLength(3);
    expect(controlGroup(groups)?.calls).toBe(978);
  });

  it("CUT-03: calls outside the catalog are separated and have no groups", () => {
    const outside = row({ itemId: ZERO_UUID, itemType: "unknown", itemName: "postgres-legacy", groups: [] });
    const rows = [row(), outside];
    expect(outsideRows(rows).map((r) => r.itemName)).toEqual(["postgres-legacy"]);
    expect(outsideRows(rows)[0].groups).toEqual([]);
    expect(catalogRows(rows).map((r) => r.itemName)).toEqual(["Jira"]);
  });

  it("CAL-03: the report has no slice by user and no list of who uses what", () => {
    const keys = usageColumns().map((c) => c.key);
    expect(keys.filter((k) => /user/i.test(k))).toEqual(["users"]);
    const params = Object.keys(usageParams({ ...defaultFilters(NOW), group: "g1" }));
    expect(params).not.toContain("user");
    expect(params).not.toContain("userId");
    expect(CSV_COLUMNS.join(" ")).not.toMatch(/user_?id|email|person|user_?name/i);
  });
});

describe("FTR.NAB.CHAT-0005 drill-down (R21)", () => {
  it("DRL-01: a 30-day drill-down is not cut", () => {
    expect(drilldownWindow("2026-02-01", "2026-03-02", 31)).toEqual({ from: "2026-02-01", to: "2026-03-02", clamped: false });
  });

  it("DRL-02: a 90-day drill-down is cut to 31 days", () => {
    const w = drilldownWindow("2025-12-03", "2026-03-02", 31);
    expect(w.clamped).toBe(true);
    expect(daysBetween(w.from, w.to) + 1).toBe(31);
    expect(day(w.from)).toBe("2026-01-31");
  });
});

describe("FTR.NAB.CHAT-0005 the actions (R27–R30)", () => {
  it("ACT-01: the preview counts 12 connections, 3 groups, 2 agents and 4 tasks", () => {
    expect(impactCounts(impact())).toEqual({ users: 37, connections: 12, groups: 3, agents: 2, clients: 1, tasks: 4 });
  });

  it("ACT-02: a withdrawal without a reason is refused", () => {
    expect(unpublishError({ name: "Jira", reason: "  ", confirmName: "Jira", connections: 0 })).toBe("reason_required");
  });

  it("ACT-03: a wrong name is refused while there are connections, and not asked without them", () => {
    const base = { name: "Jira", reason: "no longer needed", confirmName: "Jira" };
    expect(unpublishError({ ...base, connections: 12 })).toBeNull();
    expect(unpublishError({ ...base, confirmName: "jira", connections: 12 })).toBe("name_mismatch");
    expect(unpublishError({ ...base, confirmName: "", connections: 0 })).toBeNull();
    expect(needsConfirmName({ connections: 12 })).toBe(true);
    expect(needsConfirmName({ connections: 0 })).toBe(false);
  });

  it("ACT-07: calls of the 90-day window are a warning of the confirmation", () => {
    expect(impactWarnings(impact())).toContain("calls90");
    expect(impactWarnings(impact({ calls90: 0, lastCallAt: null, publication: { publishedAt: iso(-30), unpublishedAt: null } })))
      .not.toContain("calls90");
  });

  it("ACT-08: a recently returned item warns about the incomplete window", () => {
    expect(impactWarnings(impact({ calls90: 0, publication: { publishedAt: iso(-3), unpublishedAt: null, removedDays: 60, windowIncomplete: true } })))
      .toEqual(["incompleteWindow"]);
  });

  it("ACT-10: the preview of a grant revocation shows one group", () => {
    const one = revokeImpact(impact(), "g1");
    expect(one.grants.map((g) => g.groupName)).toEqual(["Бухгалтерия"]);
    expect(one.grants[0].users).toBe(14);
  });

  it("ACT-12: publication does not resume paused tasks", () => {
    const c = card({ unresolvedTasks: [{ taskId: "t1", title: "Ночной отчёт", agentName: "night-report" }] });
    expect(pendingTasks(c)).toBe(1);
  });

  it("ACT-14: a skill withdrawal warns about incomplete telemetry and has no cascade", () => {
    expect(skillImpactNote("skill")).toBe("skillTelemetry");
    expect(skillImpactNote("mcp")).toBeNull();
    expect(impact({ item: { ...impact().item, type: "skill", name: "go-conventions" }, connections: 0 }).connections).toBe(0);
  });

  it("PIN-03: a pin needs a reason and a date in the future", () => {
    expect(pinError({ reason: "", reviewAt: iso(30) }, NOW)).toBe("reason_required");
    expect(pinError({ reason: "ждём интеграцию с 1С", reviewAt: iso(-1) }, NOW)).toBe("review_at_past");
    expect(pinError({ reason: "ждём интеграцию с 1С", reviewAt: iso(30) }, NOW)).toBeNull();
  });

  it("PIN-04: the default review date is 90 days ahead", () => {
    expect(defaultReviewAt(NOW, 90)).toBe(iso(90));
  });

  it("PIN-01: a pinned item hides the hint and stays in the goal metric", () => {
    const r = row({ state: "pinned", hints: [], calls: 0 });
    expect(rowBadges(r)).toEqual(["pinned"]);
    expect(rowBadges(r)).not.toContain("unused");
    expect(hintSuppressed({ itemType: "mcp", status: "ok", states: ["pinned"] })).toBe(true);
    expect(skillInGoal("mcp")).toBe(true);
  });

  it("PIN-02: a pin past its review date is overdue and no longer effective", () => {
    const pins: UsagePin[] = [
      { id: "p1", itemId: "i1", reason: "ждём интеграцию", pinnedBy: null, pinnedAt: iso(-100), reviewAt: iso(-10), releasedAt: null, effective: false },
      { id: "p2", itemId: "i2", reason: "пилот", pinnedBy: null, pinnedAt: iso(-10), reviewAt: iso(80), releasedAt: null, effective: true },
    ];
    expect(pinState(pins[0], NOW)).toBe("overdue");
    expect(overduePins(pins, NOW).map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("FTR.NAB.CHAT-0005 «unavailable» is not «unused» (R15)", () => {
  it("UNV-01: a failed check suppresses the hint", () => {
    expect(isUnavailable("error")).toBe(true);
    expect(hintSuppressed({ itemType: "mcp", status: "error", states: ["unavailable"] })).toBe(true);
  });

  it("UNV-02: a successful check removes the label and the hint comes back", () => {
    expect(isUnavailable("ok")).toBe(false);
    expect(hintSuppressed({ itemType: "mcp", status: "ok", states: [] })).toBe(false);
  });

  it("UNV-04: the last check changes every time, the last successful one only on success", () => {
    const failed = checkTimes(card({ lastCheckAt: "2026-03-01T10:00:00Z", lastOkAt: "2026-02-28T09:00:00Z" }));
    const ok = checkTimes(card({ lastCheckAt: "2026-03-02T10:00:00Z", lastOkAt: "2026-03-02T10:00:00Z" }));
    expect(failed.lastOkAt).toBe("2026-02-28T09:00:00Z");
    expect(ok.lastOkAt).toBe("2026-03-02T10:00:00Z");
  });

  it("UNV-05: unconfigured is not an error", () => {
    expect(isUnavailable("unconfigured")).toBe(false);
    expect(hintSuppressed({ itemType: "mcp", status: "unconfigured", states: [] })).toBe(false);
  });

  it("UI-07: both check times are kept apart", () => {
    expect(checkTimes(card())).toEqual({ lastCheckAt: "2026-03-01T10:00:00Z", lastOkAt: "2026-02-28T09:00:00Z" });
  });
});

describe("FTR.NAB.CHAT-0005 skills (R24)", () => {
  it("SKL-01: no application data is not zero activations", () => {
    expect(skillTelemetry(card({ itemType: "skill", skillActivations: null, skillSessions: null })))
      .toMatchObject({ hasData: false, activations: null, sessions: null, incomplete: true });
  });

  it("SKL-02: five activations in three sessions", () => {
    expect(skillTelemetry(card({ itemType: "skill", skillActivations: 5, skillSessions: 3 })))
      .toMatchObject({ hasData: true, activations: 5, sessions: 3 });
  });

  it("SKL-03: a skill collected but not activated still has a session", () => {
    expect(skillTelemetry(card({ itemType: "skill", skillActivations: 0, skillSessions: 2 })))
      .toMatchObject({ hasData: true, activations: 0, sessions: 2 });
  });

  it("SKL-04: a skill never enters the goal metric", () => {
    expect(skillInGoal("skill")).toBe(false);
    expect(skillInGoal("mcp")).toBe(true);
  });
});

describe("FTR.NAB.CHAT-0005 tiles, CSV and privacy (R16, R25, R26)", () => {
  it("TIL-02: the successful-share composition keeps auth and denied outside the denominator", () => {
    expect(successComposition(tiles())).toEqual({ value: 0.91, auth: 120, denied: 34, outsideIncluded: true });
  });

  it("TIL-03: candidates resolved is shown with the note «not a goal» and the target", () => {
    const view = resolvedView(tiles());
    expect(view).toMatchObject({ resolved: 4, candidates: 12, target: 0.3, notGoal: true });
  });

  it("SEC-02: the aggregates keep counters and no personalities", () => {
    const daily = { day: "2026-03-01", itemName: "Jira", calls: 10, ok: 9, users: 2, sessions: 3, admin_calls: 1, service_calls: 0 };
    expect(hasPersonalities(daily)).toBe(false);
    expect(hasPersonalities({ ...daily, userEmail: "a@b.c" })).toBe(true);
  });

  it("UI-06: the export carries the note about no personalities", () => {
    const ru = createI18n("ru").t;
    expect(ru(csvNoteKey())).toMatch(/нет/);
    expect(exportPath(defaultFilters(NOW))).toContain("/export.csv?");
  });

  it("TIL-04: no money or token in the answers and in the CSV", () => {
    // the preview of an action names the users it touches; the report itself never does (R26)
    const answers = { rows: [row()], tiles: tiles(), meta: meta() };
    expect(hasMoneyOrPersonalities(answers)).toBe(false);
    expect(hasPersonalities(answers)).toBe(false);
    // the check is not vacuous
    expect(hasMoneyOrPersonalities({ costUsd: 1 })).toBe(true);
    expect(hasMoneyOrPersonalities({ tokens: 10 })).toBe(true);
    expect(hasMoneyOrPersonalities({ userEmail: "a@b.c" })).toBe(true);
  });

  it("CSV-01: the export repeats the filters of the screen and the numbers of the table", () => {
    const f = { ...defaultFilters(NOW), step: "month" as const, group: "g1" };
    const url = new URL(exportPath(f), "https://example.test");
    expect(url.pathname).toBe("/admin/api/v1/catalog/usage/export.csv");
    expect(url.searchParams.get("step")).toBe("month");
    expect(url.searchParams.get("group")).toBe("g1");
    expect(url.searchParams.get("from")).toBe(f.from);
    const cells = csvCells(row());
    expect(cells.calls).toBe("310");
    expect(cells.admin_calls).toBe("12");
    expect(cells.tools).toBe("12");
    expect(cells.errors_by_code).toBe("tool_error=18 transport_error=6 auth=4 denied=2");
  });

  it("CSV-02: the exported file has no personalities and keeps the BOM note", () => {
    const cells = csvCells(row({ groups: [{ groupId: "g1", groupName: "Бухгалтерия", builtin: null, calls: 310 }] }));
    expect(Object.values(cells).join(" ")).not.toMatch(/@|\+\d{10}/);
    const ru = createI18n("ru").t;
    expect(ru(csvNoteKey())).toMatch(/почт|идентификатор/i);
    expect(resolvedView(tiles()).notGoal).toBe(true);
  });
});

describe("FTR.NAB.CHAT-0005 defaults", () => {
  it("R2: a new tab shows the last 30 days of all published items", () => {
    const f = defaultFilters(NOW);
    expect(defaultPeriod(NOW)).toEqual({ from: "2026-02-01", to: "2026-03-02" });
    expect(f).toMatchObject({ step: "day", includeUnpublished: false, group: "", callerKind: "", mode: "" });
    expect(filterCount(f, NOW)).toBe(0);
  });
});
