import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, qs } from "../../api/client";
import type { CommLevels, CommUsage, CommUsageDay } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { Chart, Icon, type ChartSeries } from "@green-on-grey/ui-kit";

const OUTCOMES = ["ok", "busy", "rate_limited", "source_access", "timeout", "error"] as const;

/** The usage of the memory of communications in the administration (FTR.NAB.MEM-0001 R25, R26, design §3.7, §3.8):
 * cards, three charts, the collection, the compaction, the commitments and the users. Numbers only, never content. */
export function CommUsage() {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  // the current month once: a clock read in render is impure (react/purity)
  const [thisMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [month, setMonth] = useState(thisMonth);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [brokenOnly, setBrokenOnly] = useState(false);
  const usage = useQuery({
    queryKey: ["admin", "comm", "usage", month, brokenOnly],
    queryFn: () => api.get<CommUsage>(`/admin/api/v1/comm/usage${qs({ month, broken: brokenOnly ? true : undefined })}`),
  });
  const daily = useQuery({
    queryKey: ["admin", "comm", "usage", "daily", month, user?.id ?? ""],
    queryFn: () => api.get<{ days: CommUsageDay[] }>(`/admin/api/v1/comm/usage/daily${qs({ month, user: user?.id })}`),
  });
  const n = (v: number) => new Intl.NumberFormat(lng).format(v);
  const usd = (v: number) => new Intl.NumberFormat(lng, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
  const date = (iso: string) => new Intl.DateTimeFormat(lng, { day: "numeric", month: "short" }).format(new Date(iso));
  const u = usage.data;
  const days = daily.data?.days ?? [];
  // the labels of the days of a month: the numbers only, the month is above the charts
  const x = days.map((d) => String(Number(d.day.slice(8, 10))));
  const money = (v: number) => new Intl.NumberFormat(lng, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const series = (level: keyof CommLevels, id: string, color: ChartSeries["color"], label: string): ChartSeries => ({
    id, label, color, kind: "bar", values: days.map((d) => d.levels[level]),
  });

  return (
    <>
      <div className="ctlrow" style={{ marginBottom: 12 }}>
        <label className="row small" style={{ gap: 6, alignItems: "center" }}>
          {t("admin.comm.use.month")}
          <input className="inp" type="month" value={month} max={thisMonth} onChange={(e) => setMonth(e.target.value || month)} />
        </label>
        {user && (
          <span className="tg">
            {t("admin.comm.use.chip", { email: user.email })}
            <button type="button" className="tg-x" aria-label={t("admin.comm.use.chipClear")} onClick={() => setUser(null)}><Icon name="x" size={11} /></button>
          </span>
        )}
      </div>

      {usage.error && (
        <div className="err-text">{errorText(t, usage.error)} <button className="btn sm" onClick={() => usage.refetch()}>{t("comm.retry")}</button></div>
      )}

      {u && (
        <>
          <div className="kpi">
            <div><b>{n(u.enabledUsers)}</b><span>{t("admin.comm.use.users")} · {t("admin.comm.use.activeUsers", { count: u.activeUsers })}</span></div>
            <div><b>{n(u.notes)}</b><span>{t("admin.comm.use.records")}<br />{t("admin.comm.use.levelsShort", { ...u.levels })}</span></div>
            <div><b>{u.compaction.ratio != null ? t("admin.comm.use.ratio", { ratio: u.compaction.ratio }) : "—"}</b><span>{t("admin.comm.use.compaction")}</span></div>
            <div><b>{usd(u.costUsd)}</b><span>{t("admin.comm.use.costTitle")}<br />{t("admin.comm.use.costSplit", { collect: usd(u.cost.collect), compact: usd(u.cost.compact) })}</span></div>
            <div>
              <b className={u.compaction.brokenUsers > 0 ? "err-text" : undefined}>{n(u.compaction.brokenUsers)}</b>
              <span>{t("admin.comm.use.broken")}
                {u.compaction.brokenUsers > 0 && (
                  <> · <button type="button" className="linkish" aria-pressed={brokenOnly} onClick={() => setBrokenOnly(!brokenOnly)}>{t("admin.comm.use.brokenFilter")}</button></>
                )}
              </span>
            </div>
          </div>

          {days.length > 0 && (
            <>
              <div className="lab" style={{ margin: "14px 0 4px" }}>{t("admin.comm.use.charts.cost")}</div>
              <Chart ariaLabel={t("admin.comm.use.charts.cost")} x={x} height={200} format={money} stacked
                series={[
                  { id: "collect", label: t("admin.comm.use.series.collect"), color: 1, kind: "bar", values: days.map((d) => d.costCollect) },
                  { id: "compact", label: t("admin.comm.use.series.compact"), color: 2, kind: "bar", values: days.map((d) => d.costCompact) },
                ]} />
              <div className="lab" style={{ margin: "14px 0 4px" }}>{t("admin.comm.use.charts.volume")}</div>
              <Chart ariaLabel={t("admin.comm.use.charts.volume")} x={x} height={200} format={n}
                series={[
                  { id: "messages", label: t("admin.comm.use.series.messages"), color: 1, kind: "line", values: days.map((d) => d.messages) },
                  { id: "created", label: t("admin.comm.use.series.created"), color: 2, kind: "line", axis: "right", dashed: true, values: days.map((d) => d.created) },
                ]} />
              <div className="lab" style={{ margin: "14px 0 4px" }}>{t("admin.comm.use.charts.levels")}</div>
              <Chart ariaLabel={t("admin.comm.use.charts.levels")} x={x} height={200} format={n} stacked
                series={[
                  series("day", "level-day", 1, t("comm.level.day")),
                  series("week", "level-week", 2, t("comm.level.week")),
                  series("month", "level-month", 3, t("comm.level.month")),
                  series("thread", "level-thread", 4, t("comm.level.thread")),
                ]} />
            </>
          )}
          {days.length === 0 && !daily.isLoading && <div className="muted small" style={{ margin: "12px 0" }}>{t("admin.comm.use.noData")}</div>}

          <h4 style={{ margin: "18px 0 6px" }}>{t("admin.comm.use.collectBlock")}</h4>
          <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
            <table className="t" style={{ maxWidth: 340 }}>
              <tbody>
                {OUTCOMES.filter((k) => (u.collect.outcomes[k] ?? 0) > 0).map((k) => {
                  const total = OUTCOMES.reduce((s, kk) => s + (u.collect.outcomes[kk] ?? 0), 0);
                  return (
                    <tr key={k}><td>{t(`admin.comm.use.outcomes.${k}`)}</td>
                      <td className="small">{t("admin.comm.use.shares", { count: u.collect.outcomes[k], pct: total ? Math.round((u.collect.outcomes[k] / total) * 100) : 0 })}</td></tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ minWidth: 260 }}>
              <div className="lab">{t("admin.comm.use.bySource")}</div>
              {u.collect.messagesBySource.map((s) => (
                <div className="srcl" key={s.itemId + s.source}>
                  <Icon name="mail" size={13} /><span>{s.title}</span><b>{n(s.messages)}</b>
                </div>
              ))}
              {u.collect.messagesBySource.length === 0 && <div className="small muted">—</div>}
            </div>
          </div>

          <h4 style={{ margin: "18px 0 6px" }}>{t("admin.comm.use.compactBlock")}</h4>
          <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
            {u.compaction.lastNightAt && <span className="small">{t("admin.comm.use.lastNight", { date: date(u.compaction.lastNightAt) })}</span>}
            <span className="small">{t("admin.comm.use.okCount", { count: n(u.compaction.ok) })}</span>
            <span className="small">{t("admin.comm.use.failedCount", { count: n(u.compaction.failed) })}</span>
          </div>

          <h4 style={{ margin: "18px 0 6px" }}>{t("admin.comm.use.commitmentsBlock")}</h4>
          <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
            <span className="small">{t("admin.comm.use.commitmentsOpen", { count: n(u.commitments.open) })}</span>
            <span className="small">{t("admin.comm.use.commitmentsClosed", { count: n(u.commitments.closedInMonth) })}</span>
            <span className="small">{t("admin.comm.use.commitmentsOverdue", { count: n(u.commitments.overdue) })}</span>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="t">
              <thead><tr>
                <th>{t("admin.comm.use.cols.user")}</th><th>{t("admin.comm.use.cols.notes")}</th><th>{t("admin.comm.use.cols.runs")}</th>
                <th>{t("admin.comm.use.cols.lastCollect")}</th><th>{t("admin.comm.use.cols.costCollect")}</th><th>{t("admin.comm.use.cols.costCompact")}</th>
                <th>{t("admin.comm.use.cols.limit")}</th><th>{t("admin.comm.use.cols.lastCompact")}</th><th>{t("admin.comm.use.cols.openCommitments")}</th>
              </tr></thead>
              <tbody>
                {u.items.map((row) => (
                  <tr key={row.userId} className={user?.id === row.userId ? "sel-row" : ""} onClick={() => setUser(user?.id === row.userId ? null : { id: row.userId, email: row.email })}>
                    <td><b>{row.email}</b></td>
                    <td className="small nowrap">{t("admin.comm.use.levelsShort", { ...row.levels })}</td>
                    <td>{n(row.runs)}</td>
                    <td className="small nowrap">{row.lastCollect ? `${t(`admin.comm.use.outcomes.${row.lastCollect.outcome}`, { defaultValue: row.lastCollect.outcome })} · ${date(row.lastCollect.at)}` : "—"}</td>
                    <td className="nowrap">{usd(row.costCollect)}</td>
                    <td className="nowrap">{usd(row.costCompact)}</td>
                    <td style={{ minWidth: 110 }}>{u.monthlyLimitUsd > 0 ? <div className="meter"><i className={row.limitUsedPct >= 90 ? "hot" : ""} style={{ width: `${Math.min(100, row.limitUsedPct)}%` }} /></div> : "—"}</td>
                    <td className="small nowrap">{row.compactBroken ? <span className="err-text"><Icon name="alert" size={12} /> {t("admin.comm.use.broken")}</span> : row.lastCompactAt ? date(row.lastCompactAt) : "—"}</td>
                    <td>{row.openCommitments > 0 ? <span className="due">{row.openCommitments}</span> : "—"}</td>
                  </tr>
                ))}
                {u.items.length === 0 && <tr><td colSpan={9} className="muted">{t("admin.comm.use.noData")}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="hintbox" style={{ marginTop: 12 }}><Icon name="lock" /><span>{t("admin.comm.noContent")}</span></div>
        </>
      )}
    </>
  );
}
