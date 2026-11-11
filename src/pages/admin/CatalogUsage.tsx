import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, qs } from "../../api/client";
import { useAdminGroups } from "../../api/queries";
import type {
  UsageCandidate, UsageImpact, UsageItemAnswer, UsageMeta, UsagePage, UsagePin, UsageRow, UsageSummaryAnswer, UsageToolRow,
} from "../../api/types";
import { errorText } from "../../lib/errors";
import { dateTime, relativeTime } from "../../lib/format";
import { intlLocale } from "../../lib/i18n";
import { Empty, Loading, Modal, useToast } from "@green-on-grey/ui-kit";
import {
  USAGE_PATHS, candidateCheck, catalogRows, checkTimes, clampPeriod, confirmationsText, controlGroup, deadShareView, defaultFilters,
  defaultPeriod, defaultReviewAt,
  drilldownWindow, exportPath, filterCount, freshness, hasManyAuth, impactCounts, impactWarnings, isUnavailable,
  itemCardSections, latencyText, modeLabel, needsConfirmName, overduePins, overlapLines, pinError, pinState, primaryAction,
  publicationInfo, readiness, reasonCounts, resolvedView, revokeImpact, rowBadges, skillImpactNote, skillTelemetry,
  outsideRows, sortUsageRows, successComposition, successShare, thresholdItems, unpublishError, usageParams, usageSections,
  visibleGroups, visibleRows, withdrawnLabel, withdrawnNote,
} from "./catalogUsage";
import type { CatalogTab, UsageFilters } from "./catalogUsage";

// The texts live under `admin.catalogUsage.*`: design §4 names them `admin.usage.*`, but that
// namespace already belongs to the tokens-and-cost section of the administration
// (FTR.NAB.CMN-0001 R27), which this feature does not change.

/** A row for a candidate that is not among the rows of the period: the card needs only the item. */
function stubRow(itemId: string, itemName: string, itemType: UsageRow["itemType"]): UsageRow {
  return {
    itemId, itemName, itemType, mode: null, published: true, publishedAt: null, unpublishedAt: null, deletedAt: null,
    toolCount: null, calls: 0, adminCalls: 0, serviceCalls: 0, users: 0, sessions: 0, ok: 0, errorsByCode: {}, authCalls: 0,
    deniedCalls: 0, p50Ms: null, p95Ms: null, lastCallAt: null, calls90: 0, availableDays: 0, hints: [], state: "active",
    confirmationsRejected: null, groups: [],
  };
}

/** A day without the time: «данные с 1 сент. 2026» and the dates of publication (design §3.1, §3.5). */
function dateOnly(iso: string, lng: string): string {
  return new Intl.DateTimeFormat(lng, { dateStyle: "medium" }).format(new Date(iso));
}

/** The tab «Usage» of the catalog (FTR.NAB.CHAT-0005 R1–R31, design §3.1–§3.13):
 * the header with the first day of data and the freshness, the observation banner,
 * the tiles, «candidates for review», the filters, the flat table «item × period»
 * with the drill-down, the card of an item and the two actions with their previews.
 * The server computes readiness, hints and thresholds; this screen composes them. */
export function CatalogUsage() {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const qc = useQueryClient();
  const toast = useToast();
  const [now] = useState(() => new Date());
  const [filters, setFilters] = useState(() => defaultFilters(now));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<UsageRow | null>(null);
  const [unpublish, setUnpublish] = useState<UsageRow | null>(null);
  const [publish, setPublish] = useState<UsageRow | null>(null);
  const [revoke, setRevoke] = useState<{ row: UsageRow; groupId: string } | null>(null);
  const [pin, setPin] = useState<UsageRow | null>(null);
  const [showImplicit, setShowImplicit] = useState(false);
  // the columns of sessions and rejected confirmations are hidden by default (design §3.3)
  const [allColumns, setAllColumns] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  const params = usageParams(filters);
  const rows = useQuery({
    queryKey: ["admin", "catalog-usage", "rows", params],
    queryFn: () => api.get<UsagePage<UsageRow>>(`${USAGE_PATHS.rows}${qs(params)}`),
  });
  const summary = useQuery({
    queryKey: ["admin", "catalog-usage", "summary", filters.from, filters.to, filters.includeUnpublished],
    queryFn: () => api.get<UsageSummaryAnswer>(`${USAGE_PATHS.summary}${qs({ from: filters.from, to: filters.to, includeUnpublished: filters.includeUnpublished })}`),
  });
  const candidates = useQuery({
    queryKey: ["admin", "catalog-usage", "candidates", filters.from, filters.to],
    queryFn: () => api.get<UsagePage<UsageCandidate>>(`${USAGE_PATHS.candidates}${qs({ from: filters.from, to: filters.to })}`),
  });
  const pins = useQuery({
    queryKey: ["admin", "catalog-usage", "pins", "overdue"],
    queryFn: () => api.get<UsagePage<UsagePin>>(`${USAGE_PATHS.pins}?overdue=true`),
  });
  // the groups of the administration, implicit ones included (R18)
  const groups = useAdminGroups();
  const meta = rows.data?.meta ?? summary.data?.meta;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "catalog-usage"] });
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });

  const download = useMutation({
    mutationFn: () => api.blob(exportPath(filters)),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catalog-usage-${filters.from}-${filters.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: fail,
  });

  if (!meta && rows.isLoading) return <Loading />;
  if (rows.error) {
    return (
      <Empty icon="alert" title={t("admin.catalogUsage.loadFailed")} />
    );
  }

  const sections = usageSections();
  const visible = visibleRows(rows.data?.items ?? [], filters.includeUnpublished);
  const sorted = sortUsageRows(catalogRows(visible));
  const outside = outsideRows(visible);
  // a period earlier than the first day of data starts at that day (R6, RDY-03)
  const changeFilters = (f: UsageFilters) => setFilters(meta ? { ...f, ...clampPeriod(f.from, f.to, meta.dataFrom) } : f);
  const list = candidates.data?.items ?? [];
  const overdue = overduePins(pins.data?.items ?? [], now);

  return (
    <div className="nb-cu">
      {sections.includes("header") && meta && (
        <div className="nb-cu-head">
          <div>
            <h2 className="nb-cu-h1">{t("admin.catalogUsage.title")}</h2>
            <div className="nb-cu-meta">
              {t("admin.catalogUsage.dataFrom", { date: dateOnly(meta.dataFrom, lng) })}
              {" · "}
              <b>{t("admin.catalogUsage.updated", { time: relativeTime(meta.updatedAt, lng, now) })}</b>
              {freshness(meta.updatedAt, now).stale && <span className="nb-cu-stale"> {t("admin.catalogUsage.stale")}</span>}
            </div>
          </div>
          <div className="nb-cu-actions">
            <div className="mini-seg">
              {(["day", "week", "month"] as const).map((s) => (
                <button key={s} className={filters.step === s ? "on" : ""} onClick={() => setFilters({ ...filters, step: s })}>
                  {t(`admin.catalogUsage.step.${s}`)}
                </button>
              ))}
            </div>
            <button className="btn primary sm" disabled={download.isPending} onClick={() => download.mutate()}>
              {t("admin.catalogUsage.exportCsv")}
            </button>
          </div>
        </div>
      )}

      {sections.includes("banner") && meta && <ObservationBanner meta={meta} />}
      {sections.includes("tiles") && summary.data && <Tiles tiles={summary.data.tiles} meta={meta ?? summary.data.meta} overdue={overdue.length} />}
      {sections.includes("candidates") && (
        <CandidatesPanel
          candidates={list}
          reasons={reasonCounts(list)}
          showAll={showAllCandidates}
          onShowAll={() => setShowAllCandidates(true)}
          onOpen={(c) => setOpenItem(rows.data?.items.find((x) => x.itemId === c.itemId) ?? stubRow(c.itemId, c.itemName, c.itemType))}
          meta={meta}
        />
      )}

      {sections.includes("filters") && (
        <Filters
          filters={filters}
          onChange={changeFilters}
          showImplicit={showImplicit}
          onShowImplicit={setShowImplicit}
          onReset={() => { setFilters(defaultFilters(now)); setShowImplicit(false); }}
          count={filterCount(filters, now)}
          groups={(groups.data?.items ?? []).map((g) => ({ groupId: g.id, groupName: g.name }))}
        />
      )}
      {sections.includes("filters") && (
        <label className="nb-cu-check">
          <input type="checkbox" checked={allColumns} onChange={(e) => setAllColumns(e.target.checked)} />
          {t("admin.catalogUsage.allColumns")}
        </label>
      )}

      {sections.includes("table") && (
        <div className="nb-cu-tablewrap">
          <table className="t nb-cu-table">
            <thead>
              <tr>
                <th>{t("admin.catalogUsage.col.item")}</th>
                <th>{t("admin.catalogUsage.col.hints")}</th>
                <th>{t("admin.catalogUsage.col.state")}</th>
                <th className="nb-cu-num">{t("admin.catalogUsage.col.tools")}</th>
                <th className="nb-cu-num">{t("admin.catalogUsage.col.calls")}</th>
                <th className="nb-cu-num">{t("admin.catalogUsage.col.adminCalls")}</th>
                <th className="nb-cu-num">{t("admin.catalogUsage.col.serviceCalls")}</th>
                <th className="nb-cu-num">{t("admin.catalogUsage.col.users")}</th>
                <th>{t("admin.catalogUsage.col.success")}</th>
                <th>{t("admin.catalogUsage.col.errors")}</th>
                <th className="nb-cu-num">{t("admin.catalogUsage.col.auth")}</th>
                <th className="nb-cu-num">{t("admin.catalogUsage.col.latency")}</th>
                <th>{t("admin.catalogUsage.col.lastCall")}</th>
                <th className="nb-cu-num">{t("admin.catalogUsage.col.calls90")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <Row key={r.itemId} row={r} filters={filters} expanded={expanded === r.itemId} allColumns={allColumns}
                  onExpand={() => setExpanded(expanded === r.itemId ? null : r.itemId)}
                  onOpen={() => setOpenItem(r)} onUnpublish={() => setUnpublish(r)} onPublish={() => setPublish(r)}
                  onPin={() => setPin(r)} meta={meta} />
              ))}
              {outside.length > 0 && (
                <tr className="nb-cu-outside-sep"><td colSpan={allColumns ? 17 : 15}>{t("admin.catalogUsage.outsideRows", { count: outside.length })}</td></tr>
              )}
              {outside.map((r) => (
                <Row key={`${r.itemId}-${r.itemName}`} row={r} filters={filters} expanded={false} allColumns={allColumns} onExpand={() => undefined}
                  onOpen={() => setOpenItem(r)} onUnpublish={() => setUnpublish(r)} onPublish={() => setPublish(r)}
                  onPin={() => setPin(r)} meta={meta} />
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={allColumns ? 17 : 15} className="nb-cu-empty">{t("admin.catalogUsage.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="nb-cu-note">
        <span>{t("admin.catalogUsage.groupsNote")}</span>
        <span className="nb-cu-hint">{t("admin.catalogUsage.privacy")}</span>
      </div>

      {sections.includes("thresholds") && meta && <Thresholds meta={meta} />}

      {overdue.length > 0 && (
        <section className="nb-cu-sec">
          <h3 className="nb-cu-h3">{t("admin.catalogUsage.overduePins", { count: overdue.length })}</h3>
          {overdue.map((p) => <div key={p.id} className="nb-cu-kv"><span>{p.reason}</span><span>{dateTime(p.reviewAt, lng)}</span></div>)}
        </section>
      )}

      {openItem && (
        <ItemCardDialog row={openItem} meta={meta} filters={filters} showImplicit={showImplicit}
          onClose={() => setOpenItem(null)} onUnpublish={() => { setOpenItem(null); setUnpublish(openItem); }}
          onPin={() => { setOpenItem(null); setPin(openItem); }}
          onRevoke={(groupId) => { setOpenItem(null); setRevoke({ row: openItem, groupId }); }} />
      )}
      {unpublish && <UnpublishDialog row={unpublish} onClose={() => setUnpublish(null)} onDone={() => { setUnpublish(null); invalidate(); }} />}
      {publish && <PublishDialog row={publish} onClose={() => setPublish(null)} onDone={() => { setPublish(null); invalidate(); }} />}
      {revoke && <RevokeDialog row={revoke.row} groupId={revoke.groupId} onClose={() => setRevoke(null)} onDone={() => { setRevoke(null); invalidate(); }} />}
      {pin && meta && <PinDialog row={pin} pinDays={meta.thresholds.pinDays} onClose={() => setPin(null)} onDone={() => { setPin(null); invalidate(); }} />}
    </div>
  );
}

/** The kinds of the tab; the items of the catalog stay the first one (R1, design §3.1). */
export function CatalogTabs({ value, onChange }: { value: CatalogTab; onChange: (t: CatalogTab) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mini-seg nb-cu-tabs">
      <button className={value === "items" ? "on" : ""} onClick={() => onChange("items")}>{t("admin.catalogUsage.tabItems")}</button>
      <button className={value === "usage" ? "on" : ""} onClick={() => onChange("usage")}>{t("admin.catalogUsage.tabUsage")}</button>
    </div>
  );
}

function ObservationBanner({ meta }: { meta: UsageMeta }) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const r = readiness(meta);
  if (r.hintsReady && r.goalReady) return null;
  const hint = !r.hintsReady;
  const left = hint ? r.leftDays : r.goalLeftDays;
  const percent = hint ? r.hintPercent : r.goalPercent;
  const target = hint ? r.hintDays : r.goalDays;
  return (
    <div className="nbar info nb-cu-banner">
      <div>
        <b>{t("admin.catalogUsage.observation", { date: dateOnly(meta.dataFrom, lng) })}</b>{" "}
        {hint
          ? t("admin.catalogUsage.observationLeft", { count: left })
          : t("admin.catalogUsage.observationGoalLeft", { count: left })}
        <div className="small muted">{hint ? t("admin.catalogUsage.observationHint") : t("admin.catalogUsage.observationGoalHint")}</div>
      </div>
      <div className="meter"><i style={{ width: `${percent}%` }} /></div>
      <span className="small muted">{t("admin.catalogUsage.observed", { days: r.observedDays, target })}</span>
    </div>
  );
}

function Tiles({ tiles, meta, overdue }: { tiles: UsageSummaryAnswer["tiles"]; meta: UsageMeta; overdue: number }) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const n = (v: number) => new Intl.NumberFormat(lng).format(v);
  const pct = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat(lng, { style: "percent", maximumFractionDigits: 0 }).format(v));
  const dead = deadShareView(tiles, meta);
  const success = successComposition(tiles);
  const resolved = resolvedView(tiles);
  return (
    <>
      <div className="nb-cu-tiles">
        <div className="nb-cu-tile">
          <div className="lab">{t("admin.catalogUsage.tile.dead")}</div>
          {dead.mode === "value" ? (
            <>
              <div className="v">{pct(dead.value === null ? null : dead.value / 100)}</div>
              <div className="sub">{t("admin.catalogUsage.tile.deadOf", { dead: dead.dead ?? 0, total: dead.total ?? 0, days: meta.windows.goalDays })}</div>
              {dead.baseline !== null && dead.delta !== null && (
                <div className="delta">{t("admin.catalogUsage.tile.deadDelta", { delta: dead.delta, baseline: dead.baseline })}</div>
              )}
              {dead.verifiedManuallyAt && <div className="small muted">{t("admin.catalogUsage.tile.verified", { date: dateTime(dead.verifiedManuallyAt, lng) })}</div>}
              {dead.droppedOut && (
                <div className="sub">{t("admin.catalogUsage.tile.dropped", { total: dead.droppedOut.total, calls: dead.droppedOut.withCalls })}</div>
              )}
            </>
          ) : (
            <>
              <div className="v">{t("admin.catalogUsage.tile.progress", { days: meta.ready.observationDays, target: meta.windows.goalDays })}</div>
              <div className="meter"><i style={{ width: `${dead.percent}%` }} /></div>
              <div className="sub">{t("admin.catalogUsage.tile.afterDays", { days: meta.windows.goalDays })}</div>
            </>
          )}
        </div>
        <div className="nb-cu-tile">
          <div className="lab">{t("admin.catalogUsage.tile.tools")}</div>
          <div className="v">{n(tiles.publishedToolCount.value)}</div>
          <div className="sub">{t("admin.catalogUsage.tile.trend", { count: tiles.publishedToolCount.trend.length })}</div>
        </div>
        <div className="nb-cu-tile" title={t("admin.catalogUsage.tile.successHint", { auth: n(success.auth), denied: n(success.denied) })}>
          <div className="lab">{t("admin.catalogUsage.tile.success")}</div>
          <div className="v">{pct(success.value)}</div>
          <div className="sub">{t("admin.catalogUsage.tile.successSub", { auth: n(success.auth), denied: n(success.denied) })}</div>
        </div>
        <div className="nb-cu-tile">
          <div className="lab">{t("admin.catalogUsage.tile.resolved")}</div>
          <div className="v">{pct(resolved.value)}</div>
          <div className="sub">{t("admin.catalogUsage.tile.resolvedSub", { resolved: resolved.resolved, candidates: resolved.candidates, target: resolved.target })}</div>
        </div>
        <div className="nb-cu-tile">
          <div className="lab">{t("admin.catalogUsage.tile.unused")}</div>
          <div className="v">{n(tiles.unusedCount)}</div>
          <div className="sub">{t("admin.catalogUsage.tile.pinnedUnused", { count: tiles.pinnedUnused })}</div>
          <div className="sub">{t("admin.catalogUsage.tile.unusedSub", { days: meta.thresholds.unusedDays })}</div>
        </div>
        <div className="nb-cu-tile">
          <div className="lab">{t("admin.catalogUsage.tile.topCalls")}</div>
          {tiles.topCalls.map((c) => <div key={c.itemId} className="nb-cu-listrow"><span>{c.itemName}</span><b>{n(c.calls)}</b></div>)}
        </div>
        <div className="nb-cu-tile">
          <div className="lab">{t("admin.catalogUsage.tile.topErrors")}</div>
          {tiles.topErrors.map((c) => (
            <div key={`${c.itemId}-${c.code}`} className="nb-cu-listrow"><span>{c.itemName} <span className="mono small">{c.code}</span></span><b>{n(c.calls)}</b></div>
          ))}
        </div>
      </div>
      {overdue > 0 && <div className="small muted nb-cu-overdue">{t("admin.catalogUsage.tile.overdue", { count: overdue })}</div>}
    </>
  );
}

function CandidatesPanel({ candidates, reasons, showAll, onShowAll, onOpen, meta }: {
  candidates: UsageCandidate[]; reasons: { reason: string; count: number }[]; showAll: boolean;
  onShowAll: () => void; onOpen: (c: UsageCandidate) => void; meta?: UsageMeta;
}) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const shown = showAll ? candidates : candidates.slice(0, 5);
  return (
    <section className="nb-cu-panel">
      <div className="nb-cu-panel-head">
        <b>{t("admin.catalogUsage.candidates.title", { count: candidates.length })}</b>
        <div className="nb-cu-chips">
          {reasons.map((r) => (
            <span key={r.reason} className={`mode nb-cu-chip${r.reason === "unavailable" ? " nb-cu-chip-red" : ""}`}>
              {t(`admin.catalogUsage.reason.${r.reason}`)}{r.count > 0 ? ` ${r.count}` : ""}
            </span>
          ))}
        </div>
      </div>
      {shown.map((c) => {
        const check = candidateCheck(c);
        return (
          <div key={c.itemId} className="nb-cu-cand">
            <div>
              <b>{c.itemName}</b>
              <div className="small muted">{t(`admin.catalogUsage.type.${c.itemType}`)}</div>
            </div>
            <div className="nb-cu-chips">
              {c.reasons.map((r) => <span key={r} className="mode">{t(`admin.catalogUsage.reason.${r}`)}</span>)}
            </div>
            <div className="small muted">
              {check.unavailable
                ? (check.lastOkAt ? t("admin.catalogUsage.candidates.lastOk", { date: dateTime(check.lastOkAt, lng) }) : t("admin.catalogUsage.candidates.neverOk"))
                : t("admin.catalogUsage.candidates.calls", { count: c.calls })}
              {c.authShare !== null && meta && hasManyAuth(c.authShare, c.calls, meta) && <> {" · "}{t("admin.catalogUsage.candidates.toConnections")}</>}
            </div>
            <button className="btn sm" onClick={() => onOpen(c)}>{t("admin.catalogUsage.candidates.open")}</button>
          </div>
        );
      })}
      {!showAll && candidates.length > 5 && (
        <button className="btn ghost sm nb-cu-showall" onClick={onShowAll}>{t("admin.catalogUsage.candidates.all", { count: candidates.length })}</button>
      )}
    </section>
  );
}

function Filters({ filters, onChange, showImplicit, onShowImplicit, onReset, count, groups }: {
  filters: ReturnType<typeof defaultFilters>; onChange: (f: ReturnType<typeof defaultFilters>) => void;
  showImplicit: boolean; onShowImplicit: (v: boolean) => void; onReset: () => void; count: number;
  groups: { groupId: string; groupName: string }[];
}) {
  const { t } = useTranslation();
  return (
    <div className="nb-cu-filters">
      <label className="nb-cu-field">
        {t("admin.catalogUsage.filter.group")}
        <select className="inp" value={filters.group} onChange={(e) => onChange({ ...filters, group: e.target.value })}>
          <option value="">{t("admin.catalogUsage.filter.allGroups")}</option>
          {groups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}
        </select>
      </label>
      <label className="nb-cu-field">
        {t("admin.catalogUsage.filter.caller")}
        <select className="inp" value={filters.callerKind} onChange={(e) => onChange({ ...filters, callerKind: e.target.value as typeof filters.callerKind })}>
          <option value="">{t("admin.catalogUsage.filter.all")}</option>
          <option value="personal">{t("admin.catalogUsage.filter.people")}</option>
          <option value="service">{t("admin.catalogUsage.filter.service")}</option>
          <option value="client">{t("admin.catalogUsage.filter.client")}</option>
        </select>
      </label>
      <label className="nb-cu-field">
        {t("admin.catalogUsage.filter.mode")}
        <select className="inp" value={filters.mode} onChange={(e) => onChange({ ...filters, mode: e.target.value as typeof filters.mode })}>
          <option value="">{t("admin.catalogUsage.filter.all")}</option>
          <option value="personal">{t("connections.personal")}</option>
          <option value="platform">{t("connections.platform")}</option>
        </select>
      </label>
      <label className="nb-cu-check">
        <input type="checkbox" checked={filters.includeUnpublished} onChange={(e) => onChange({ ...filters, includeUnpublished: e.target.checked })} />
        {t("admin.catalogUsage.filter.includeUnpublished")}
      </label>
      <label className="nb-cu-field">
        {t("admin.catalogUsage.filter.channel")}
        <input className="inp" value={filters.channel} onChange={(e) => onChange({ ...filters, channel: e.target.value })} placeholder="web" />
      </label>
      <label className="nb-cu-field">
        {t("admin.catalogUsage.filter.from")}
        <input className="inp" type="date" value={filters.from} max={filters.to} onChange={(e) => onChange({ ...filters, from: e.target.value })} />
      </label>
      <label className="nb-cu-field">
        {t("admin.catalogUsage.filter.to")}
        <input className="inp" type="date" value={filters.to} min={filters.from} onChange={(e) => onChange({ ...filters, to: e.target.value })} />
      </label>
      <label className="nb-cu-check">
        <input type="checkbox" checked={showImplicit} onChange={(e) => onShowImplicit(e.target.checked)} />
        {t("admin.catalogUsage.filter.implicit")}
      </label>
      {count > 0 && <button className="btn ghost sm" onClick={onReset}>{t("admin.catalogUsage.filter.reset")}</button>}
    </div>
  );
}

function Row({ row, filters, expanded, onExpand, onOpen, onUnpublish, onPublish, onPin, meta, allColumns }: {
  row: UsageRow; filters: ReturnType<typeof defaultFilters>; expanded: boolean; onExpand: () => void; onOpen: () => void;
  onUnpublish: () => void; onPublish: () => void; onPin: () => void; meta?: UsageMeta; allColumns: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const n = (v: number) => new Intl.NumberFormat(lng).format(v);
  const share = successShare(row);
  const action = primaryAction(row);
  if (row.deletedAt) {
    return (
      <tr className="nb-cu-withdrawn">
        <td><div className="nb-cu-pos"><b>{row.itemName}</b><span className="small muted">{t("admin.catalogUsage.deletedRow", { date: dateOnly(row.deletedAt, lng) })}</span></div></td>
        <td colSpan={allColumns ? 16 : 14} className="small muted">{t("admin.catalogUsage.deletedNoMetrics")}</td>
      </tr>
    );
  }
  return (
    <>
      <tr className={row.itemType === "unknown" ? "nb-cu-outside" : !row.published ? "nb-cu-withdrawn" : undefined}>
        <td>
          <div className="nb-cu-pos">
            <b>
              {row.itemType !== "unknown" && <button className="linklike nb-cu-caret" onClick={onExpand} aria-expanded={expanded}>{expanded ? "▾" : "▸"}</button>}
              {row.itemName}
            </b>
            <span className="small muted">
              {row.itemType === "unknown" ? t("admin.catalogUsage.type.outside") : t(`admin.catalogUsage.type.${row.itemType}`)}
              {" · "}
              {t(`admin.catalogUsage.mode.${modeLabel(row)}`)}
            </span>
          </div>
        </td>
        <td>
          {row.itemType === "skill" ? <span className="small muted">{t("admin.catalogUsage.hint.notSet")}</span>
            : rowBadges(row).length === 0 ? <span className="small muted">—</span>
              : rowBadges(row).map((b) => <span key={b} className={`mode nb-cu-chip${b === "errors_only" ? " nb-cu-chip-red" : b === "dormant" || b === "unused" ? " nb-cu-chip-amber" : ""}`}>{t(`admin.catalogUsage.hint.${b}`)}</span>)}
        </td>
        <td>
          {!row.published && withdrawnLabel(row).at
            ? <span className="mode">{t("admin.catalogUsage.state.withdrawn", { date: dateOnly(withdrawnLabel(row).at ?? "", lng) })}</span>
            : <span className="mode">{t(`admin.catalogUsage.state.${row.state}`)}</span>}
        </td>
        <td className="nb-cu-num">{row.toolCount === null ? "—" : n(row.toolCount)}</td>
        <td className="nb-cu-num">{n(row.calls)}</td>
        <td className="nb-cu-num">{n(row.adminCalls)}</td>
        <td className="nb-cu-num">{n(row.serviceCalls)}</td>
        <td className="nb-cu-num">{n(row.users)}</td>
        {allColumns && <td className="nb-cu-num">{n(row.sessions)}</td>}
        {allColumns && <td className="nb-cu-num">{confirmationsText(row).known ? n(row.confirmationsRejected ?? 0) : t("admin.catalogUsage.noData")}</td>}
        <td>{share === null ? <span className="muted">—</span>
          : <span className={share < (meta?.thresholds.errorsShare ?? 0.7) ? "nb-cu-bad" : undefined}>{new Intl.NumberFormat(lng, { style: "percent", maximumFractionDigits: 0 }).format(share)}</span>}</td>
        <td className="small mono">{Object.entries(row.errorsByCode).map(([c, v]) => `${c} ${v}`).join(" · ") || "—"}</td>
        <td className="nb-cu-num">{n(row.authCalls)}</td>
        <td className="nb-cu-num">{latencyText(row.p50Ms, row.p95Ms) ?? "—"}</td>
        <td>{row.lastCallAt ? dateTime(row.lastCallAt, lng) : <span className="muted">—</span>}</td>
        <td className="nb-cu-num">{row.itemType === "unknown" ? "—" : n(row.calls90)}</td>
        <td className="nb-cu-rowactions">
          <button className="btn sm" onClick={onOpen}>{t("admin.catalogUsage.open")}</button>
          {action === "unpublish" && <button className="btn sm" onClick={onUnpublish}>{t("admin.catalogUsage.unpublish")}</button>}
          {action === "publish" && <button className="btn sm" onClick={onPublish}>{t("admin.catalogUsage.publish")}</button>}
          {row.itemType === "mcp" && row.published && <button className="btn ghost sm" onClick={onPin}>{t("admin.catalogUsage.pin")}</button>}
        </td>
      </tr>
      {expanded && meta && (
        <tr className="nb-cu-drill">
          <td colSpan={allColumns ? 17 : 15}>
            <Drilldown row={row} filters={filters} meta={meta} />
          </td>
        </tr>
      )}
    </>
  );
}

function Drilldown({ row, filters, meta }: { row: UsageRow; filters: ReturnType<typeof defaultFilters>; meta: UsageMeta }) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const w = drilldownWindow(filters.from, filters.to, meta.windows.drilldownDays);
  const tools = useQuery({
    queryKey: ["admin", "catalog-usage", "tools", row.itemId, w.from, w.to],
    queryFn: () => api.get<UsagePage<UsageToolRow>>(`${USAGE_PATHS.tools(row.itemId)}${qs({ from: w.from, to: w.to })}`),
  });
  return (
    <div className="nb-cu-drillin">
      <div className="small muted">{w.clamped ? t("admin.catalogUsage.drill.clamped", { days: meta.windows.drilldownDays }) : t("admin.catalogUsage.drill.title", { from: w.from, to: w.to })}</div>
      <table className="t nb-cu-mini">
        <thead><tr><th>{t("admin.catalogUsage.drill.tool")}</th><th className="nb-cu-num">{t("admin.catalogUsage.col.calls")}</th><th className="nb-cu-num">{t("admin.catalogUsage.col.errors")}</th><th className="nb-cu-num">{t("admin.catalogUsage.col.latency")}</th></tr></thead>
        <tbody>
          {(tools.data?.items ?? []).map((tool) => (
            <tr key={tool.tool}>
              <td className="mono">{tool.tool}</td><td className="nb-cu-num">{tool.calls}</td><td className="nb-cu-num">{tool.errors}</td>
              <td className="nb-cu-num">{latencyText(tool.p50Ms, tool.p95Ms) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small muted">{t("admin.catalogUsage.drill.window", { from: dateTime(w.from, lng), to: dateTime(w.to, lng) })}</div>
    </div>
  );
}

function ItemCardDialog({ row, meta, filters, showImplicit, onClose, onUnpublish, onPin, onRevoke }: {
  row: UsageRow; meta?: UsageMeta; filters: ReturnType<typeof defaultFilters>; showImplicit: boolean; onClose: () => void;
  onUnpublish: () => void; onPin: () => void; onRevoke: (groupId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const [now] = useState(() => new Date());
  const qc = useQueryClient();
  const n = (v: number) => new Intl.NumberFormat(lng).format(v);
  const unpin = useMutation({
    mutationFn: (pinId: string) => api.del(USAGE_PATHS.pin(row.itemId, pinId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "catalog-usage"] }),
  });
  const card = useQuery({
    queryKey: ["admin", "catalog-usage", "item", row.itemId, filters.from, filters.to],
    queryFn: () => api.get<UsageItemAnswer>(`${USAGE_PATHS.item(row.itemId)}${qs({ from: filters.from, to: filters.to })}`),
  });
  const data = card.data;
  const info = publicationInfo(data?.publications ?? [], meta?.thresholds.unusedDays ?? 30, now);
  const note = withdrawnNote(info);
  const skill = skillTelemetry(data?.item ?? { skillActivations: null, skillSessions: null });
  const times = data ? checkTimes(data.item) : { lastCheckAt: null, lastOkAt: null };
  const w = drilldownWindow(filters.from, filters.to, meta?.windows.drilldownDays ?? 31);
  const tools = useQuery({
    queryKey: ["admin", "catalog-usage", "card-tools", row.itemId, w.from, w.to],
    enabled: card.isSuccess,
    queryFn: () => api.get<UsagePage<UsageToolRow>>(`${USAGE_PATHS.tools(row.itemId)}${qs({ from: w.from, to: w.to })}`),
  });
  return (
    <Modal wide title={row.itemName} onClose={onClose} footer={<>
      {row.published && <button className="btn" onClick={onUnpublish}>{t("admin.catalogUsage.unpublish")}</button>}
      {row.itemType === "mcp" && row.published && <button className="btn" onClick={onPin}>{t("admin.catalogUsage.pin")}</button>}
      <button className="btn ghost" onClick={onClose}>{t("common.close")}</button>
    </>}>
      {itemCardSections().includes("publication") && (
        <section className="nb-cu-sec">
          <h4 className="nb-cu-h4">{t("admin.catalogUsage.card.publication")}</h4>
          <div className="nb-cu-kv"><span>{t("admin.catalogUsage.card.published")}</span><span>{info.publishedAt ? dateOnly(info.publishedAt, lng) : "—"}</span></div>
          <div className="nb-cu-kv"><span>{t("admin.catalogUsage.card.withdrawn")}</span><span>{info.unpublishedAt ? dateOnly(info.unpublishedAt, lng) : "—"}</span></div>
          {note && <div className="nb-cu-kv"><span>{t("admin.catalogUsage.card.interval")}</span><span>{t("admin.catalogUsage.card.withdrawnNote", { count: note.removedDays, date: dateOnly(note.returnedAt, lng) })}</span></div>}
          {info.estimated && <div className="small muted">{t("admin.catalogUsage.card.estimated")}</div>}
          <div className="small muted">{t("admin.catalogUsage.card.modeHistory")}</div>
          <div className="small muted">{t("admin.catalogUsage.card.availableDays", { count: info.availableDays, days: row.availableDays })}</div>
          {isUnavailable(data?.item.status ?? null) && <div className="small nb-cu-bad">{t("admin.catalogUsage.card.unavailable")}</div>}
        </section>
      )}
      {itemCardSections().includes("calls") && (
        <section className="nb-cu-sec">
          <h4 className="nb-cu-h4">{t("admin.catalogUsage.card.calls")}</h4>
          <div className="nb-cu-stats">
            <Stat label={t("admin.catalogUsage.col.calls")} value={n(data?.item.calls ?? row.calls)} />
            <Stat label={t("admin.catalogUsage.col.adminCalls")} value={n(data?.item.adminCalls ?? row.adminCalls)} />
            <Stat label={t("admin.catalogUsage.col.serviceCalls")} value={n(data?.item.serviceCalls ?? row.serviceCalls)} />
            <Stat label={t("admin.catalogUsage.col.users")} value={n(data?.item.users ?? row.users)} />
            <Stat label={t("admin.catalogUsage.col.sessions")} value={n(data?.item.sessions ?? row.sessions)} />
            <Stat label={t("admin.catalogUsage.col.lastCall")} value={(data?.item.lastCallAt ?? row.lastCallAt) ? dateTime(data?.item.lastCallAt ?? row.lastCallAt ?? "", lng) : "—"} />
            <Stat label={t("admin.catalogUsage.col.calls90")} value={n(data?.item.calls90 ?? row.calls90)} />
            <Stat label={t("admin.catalogUsage.card.lastCheck")} value={times.lastCheckAt ? dateTime(times.lastCheckAt, lng) : "—"} />
            <Stat label={t("admin.catalogUsage.card.lastOk")} value={times.lastOkAt ? dateTime(times.lastOkAt, lng) : "—"} />
          </div>
        </section>
      )}
      {itemCardSections().includes("groups") && (
        <section className="nb-cu-sec">
          <h4 className="nb-cu-h4">{t("admin.catalogUsage.card.groups")}</h4>
          <table className="t nb-cu-mini">
            <thead><tr><th>{t("admin.catalogUsage.filter.group")}</th><th className="nb-cu-num">{t("admin.catalogUsage.col.calls")}</th><th /></tr></thead>
            <tbody>
              {visibleGroups(data?.groups ?? row.groups, showImplicit).map((g) => (
                <tr key={g.groupId}>
                  <td>{g.groupName}{g.builtin && <> <span className="mode">{t("admin.catalogUsage.implicit")}</span></>}</td>
                  <td className="nb-cu-num">{n(g.calls)}</td>
                  <td>{g.builtin === null && <button className="btn ghost sm" onClick={() => onRevoke(g.groupId)}>{t("admin.catalogUsage.revokeGrant")}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {controlGroup(data?.groups ?? []) && <div className="small muted">{t("admin.catalogUsage.card.controlRow", { calls: n(controlGroup(data?.groups ?? [])?.calls ?? 0) })}</div>}
          <div className="small muted">{t("admin.catalogUsage.groupsNote")}</div>
        </section>
      )}
      {itemCardSections().includes("tools") && (
        <section className="nb-cu-sec">
          <h4 className="nb-cu-h4">{t("admin.catalogUsage.card.tools")}</h4>
          <div className="small muted">{t("admin.catalogUsage.drill.clamped", { days: meta?.windows.drilldownDays ?? 31 })}</div>
          <table className="t nb-cu-mini">
            <thead><tr><th>{t("admin.catalogUsage.drill.tool")}</th><th className="nb-cu-num">{t("admin.catalogUsage.col.calls")}</th><th className="nb-cu-num">{t("admin.catalogUsage.col.errors")}</th><th className="nb-cu-num">{t("admin.catalogUsage.col.latency")}</th></tr></thead>
            <tbody>
              {(tools.data?.items ?? []).map((tool) => (
                <tr key={tool.tool}>
                  <td className="mono">{tool.tool}</td><td className="nb-cu-num">{tool.calls}</td><td className="nb-cu-num">{tool.errors}</td>
                  <td className="nb-cu-num">{latencyText(tool.p50Ms, tool.p95Ms) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {itemCardSections().includes("overlap") && (
        <section className="nb-cu-sec">
          <h4 className="nb-cu-h4">{t("admin.catalogUsage.card.overlap")}</h4>
          {overlapLines(data?.overlap ?? []).map((o) => (
            <div key={o.itemName} className="small">{o.itemName}: {o.tools.length} · <span className="mono">{o.tools.join(", ")}</span></div>
          ))}
          <div className="small muted">{t("admin.catalogUsage.overlapNote")}</div>
        </section>
      )}
      {itemCardSections().includes("pins") && (
        <section className="nb-cu-sec">
          <h4 className="nb-cu-h4">{t("admin.catalogUsage.card.pins")}</h4>
          {(data?.pins ?? []).length === 0 && <div className="small muted">{t("admin.catalogUsage.card.noPins")}</div>}
          {(data?.pins ?? []).map((p) => (
            <div key={p.id} className="nb-cu-kv">
              <span>{p.reason}</span>
              <span>
                {t(`admin.catalogUsage.pinState.${pinState(p, now)}`)} · {dateTime(p.reviewAt, lng)}
                {p.releasedAt === null && <> <button className="btn ghost sm" onClick={() => unpin.mutate(p.id)}>{t("admin.catalogUsage.unpin")}</button></>}
              </span>
            </div>
          ))}
        </section>
      )}
      {row.itemType === "skill" && (
        <section className="nb-cu-sec">
          <h4 className="nb-cu-h4">{t("admin.catalogUsage.card.skills")}</h4>
          <div className="nb-cu-stats">
            <Stat label={t("admin.catalogUsage.card.activations")} value={skill.activations === null ? t("admin.catalogUsage.card.noApplication") : n(skill.activations)} />
            <Stat label={t("admin.catalogUsage.col.sessions")} value={skill.sessions === null ? "—" : n(skill.sessions)} />
            <Stat label={t("admin.catalogUsage.col.hints")} value={t("admin.catalogUsage.hint.notSet")} />
          </div>
          <div className="small nb-cu-chip-amber">{t("admin.catalogUsage.card.skillTelemetry")}</div>
        </section>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="nb-cu-stat"><span className="lab">{label}</span><span className="v">{value}</span></div>;
}

function UnpublishDialog({ row, onClose, onDone }: { row: UsageRow; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const impact = useQuery({
    queryKey: ["admin", "catalog-usage", "impact", row.itemId],
    queryFn: () => api.post<UsageImpact>(USAGE_PATHS.unpublishImpact(row.itemId)),
  });
  const act = useMutation({
    mutationFn: () => api.post(USAGE_PATHS.unpublish(row.itemId), { reason, confirmName }),
    onSuccess: onDone,
  });
  const data = impact.data;
  const error = data ? unpublishError({ name: data.item.name, reason, confirmName, connections: data.connections }) : null;
  const counts = data ? impactCounts(data) : null;
  const warnings = data ? impactWarnings(data) : [];
  return (
    <Modal wide title={t("admin.catalogUsage.unpublishTitle", { name: row.itemName })} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!data || error !== null || act.isPending} onClick={() => act.mutate()}>{t("admin.catalogUsage.unpublish")}</button>
    </>}>
      <p className="small">{t("admin.catalogUsage.unpublishText")}</p>
      {counts && (
        <div className="nb-cu-stats">
          <Stat label={t("admin.catalogUsage.impact.users")} value={String(counts.users)} />
          <Stat label={t("admin.catalogUsage.impact.connections")} value={String(counts.connections)} />
          <Stat label={t("admin.catalogUsage.impact.groups")} value={String(counts.groups)} />
          <Stat label={t("admin.catalogUsage.impact.agents")} value={String(counts.agents)} />
          <Stat label={t("admin.catalogUsage.impact.clients")} value={String(counts.clients)} />
          <Stat label={t("admin.catalogUsage.impact.tasks")} value={String(counts.tasks)} />
        </div>
      )}
      {data && data.grants.length > 0 && (
        <div className="small">{data.grants.map((g) => `${g.groupName} · ${g.users}`).join(", ")}</div>
      )}
      {data && data.serviceAgents.length > 0 && (
        <div className="small">{data.serviceAgents.map((a) => `${a.name} · ${a.tasks.length}`).join(", ")}</div>
      )}
      {warnings.includes("calls90") && data && (
        <div className="small nb-cu-chip-amber">{t("admin.catalogUsage.impact.calls90", { count: data.calls90, date: data.lastCallAt ? dateTime(data.lastCallAt, lng) : "—" })}</div>
      )}
      {warnings.includes("incompleteWindow") && <div className="small nb-cu-chip-amber">{t("admin.catalogUsage.impact.incomplete")}</div>}
      {data && skillImpactNote(data.item.type) && <div className="small nb-cu-chip-amber">{t("admin.catalogUsage.skillImpact")}</div>}
      <label className="nb-cu-field nb-cu-col">
        {t("admin.catalogUsage.reasonLabel")}
        <textarea className="inp" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {data && needsConfirmName(data) && (
        <label className="nb-cu-field nb-cu-col">
          {t("admin.catalogUsage.confirmName", { name: data.item.name })}
          <input className="inp mono" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </label>
      )}
      {error && <div className="err-text">{t(`admin.catalogUsage.error.${error}`)}</div>}
      {impact.error && <div className="err-text">{errorText(t, impact.error)}</div>}
      {act.error && <div className="err-text">{errorText(t, act.error)}</div>}
    </Modal>
  );
}

function PublishDialog({ row, onClose, onDone }: { row: UsageRow; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [period] = useState(() => defaultPeriod(new Date()));
  const card = useQuery({
    queryKey: ["admin", "catalog-usage", "item", row.itemId, "publish"],
    queryFn: () => api.get<UsageItemAnswer>(`${USAGE_PATHS.item(row.itemId)}${qs(period)}`),
  });
  const tasks = card.data?.item.unresolvedTasks ?? [];
  const act = useMutation({ mutationFn: () => api.post(USAGE_PATHS.publish(row.itemId), { reason }), onSuccess: onDone });
  return (
    <Modal title={t("admin.catalogUsage.publishTitle", { name: row.itemName })} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={reason.trim() === "" || act.isPending} onClick={() => act.mutate()}>{t("admin.catalogUsage.publish")}</button>
    </>}>
      <p className="small">{t("admin.catalogUsage.publishText")}</p>
      <p className="small muted">{t("admin.catalogUsage.publishTasks", { count: tasks.length })}</p>
      {tasks.map((task) => (
        <div key={task.taskId} className="nb-cu-kv"><span>{task.title}</span><span>{task.agentName ?? ""}</span></div>
      ))}
      <label className="nb-cu-field nb-cu-col">
        {t("admin.catalogUsage.reasonLabel")}
        <textarea className="inp" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {reason.trim() === "" && <div className="small muted">{t("admin.catalogUsage.error.reason_required")}</div>}
      {act.error && <div className="err-text">{errorText(t, act.error)}</div>}
    </Modal>
  );
}

function RevokeDialog({ row, groupId, onClose, onDone }: { row: UsageRow; groupId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const groupName = row.groups.find((g) => g.groupId === groupId)?.groupName ?? "";
  const [reason, setReason] = useState("");
  const impact = useQuery({
    queryKey: ["admin", "catalog-usage", "grant-impact", row.itemId, groupId],
    queryFn: () => api.post<UsageImpact>(USAGE_PATHS.grantImpact(row.itemId), { groupId }),
  });
  const act = useMutation({
    mutationFn: () => api.del(USAGE_PATHS.revokeGrant(row.itemId, groupId) + qs({ reason })),
    onSuccess: onDone,
  });
  const data = impact.data ? revokeImpact(impact.data, groupId) : null;
  const counts = data ? impactCounts(data) : null;
  return (
    <Modal title={t("admin.catalogUsage.revokeTitle", { group: data?.grants[0]?.groupName ?? groupName })} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={reason.trim() === "" || act.isPending} onClick={() => act.mutate()}>{t("admin.catalogUsage.revokeGrant")}</button>
    </>}>
      {counts && (
        <div className="nb-cu-stats">
          <Stat label={t("admin.catalogUsage.impact.groups")} value={String(counts.groups)} />
          <Stat label={t("admin.catalogUsage.impact.users")} value={String(counts.users)} />
          <Stat label={t("admin.catalogUsage.impact.connections")} value={String(counts.connections)} />
          <Stat label={t("admin.catalogUsage.impact.tasks")} value={String(counts.tasks)} />
        </div>
      )}
      <label className="nb-cu-field nb-cu-col">
        {t("admin.catalogUsage.reasonLabel")}
        <textarea className="inp" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {reason.trim() === "" && <div className="small muted">{t("admin.catalogUsage.error.reason_required")}</div>}
      {impact.error && <div className="err-text">{errorText(t, impact.error)}</div>}
      {act.error && <div className="err-text">{errorText(t, act.error)}</div>}
    </Modal>
  );
}

function PinDialog({ row, pinDays, onClose, onDone }: { row: UsageRow; pinDays: number; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [now] = useState(() => new Date());
  const [reason, setReason] = useState("");
  const [reviewAt, setReviewAt] = useState(() => defaultReviewAt(now, pinDays).slice(0, 10));
  const error = pinError({ reason, reviewAt }, now);
  const act = useMutation({
    mutationFn: () => api.post(USAGE_PATHS.pinsOf(row.itemId), {
      reason,
      // the server fills the date when it is absent (R12, PIN-04)
      ...(reviewAt ? { reviewAt: new Date(`${reviewAt}T00:00:00Z`).toISOString() } : {}),
    }),
    onSuccess: onDone,
  });
  return (
    <Modal title={t("admin.catalogUsage.pinTitle")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={error !== null || act.isPending} onClick={() => act.mutate()}>{t("admin.catalogUsage.pin")}</button>
    </>}>
      <label className="nb-cu-field nb-cu-col">
        {t("admin.catalogUsage.pinReason")}
        <input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="nb-cu-field nb-cu-col">
        {t("admin.catalogUsage.pinReviewAt")}
        <input className="inp mono" type="date" value={reviewAt} onChange={(e) => setReviewAt(e.target.value)} />
      </label>
      <div className="small muted">{t("admin.catalogUsage.pinHint")}</div>
      {error && <div className="err-text">{t(`admin.catalogUsage.error.${error}`)}</div>}
      {act.error && <div className="err-text">{errorText(t, act.error)}</div>}
    </Modal>
  );
}

/** Shares of the footnote read as percents; the rest are days and counts (R7, design §3.10). */
function thresholdValue(code: string, value: number): string {
  return code === "errorsShare" || code === "authShare" || code === "resolvedTarget"
    ? `${Math.round(value * 100)} %`
    : String(value);
}

function Thresholds({ meta }: { meta: UsageMeta }) {
  const { t } = useTranslation();
  return (
    <details className="nb-cu-thresholds">
      <summary>{t("admin.catalogUsage.thresholds")}</summary>
      <ul>
        {thresholdItems(meta).map((i) => (
          <li key={i.code}><b>{thresholdValue(i.code, i.value)}</b> — {t(`admin.catalogUsage.threshold.${i.code}`, { value: i.value })}</li>
        ))}
      </ul>
      <div className="small muted">{t("admin.catalogUsage.thresholdsHint")}</div>
    </details>
  );
}
