import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, qs } from "../../api/client";
import type { UsageGroup } from "../../api/types";
import { intlLocale } from "../../lib/i18n";

const GROUPS = ["user", "agent", "client", "model", "connection", "day"] as const;

/** The start of a period of n days back, as RFC 3339. */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

/** Usage (R27): tokens and cost by users, agents, clients, models, connections. */
export function UsageAdmin() {
  const { t, i18n } = useTranslation();
  const [groupBy, setGroupBy] = useState<(typeof GROUPS)[number]>("user");
  const [days, setDays] = useState(30);
  const data = useQuery({ queryKey: ["admin", "usage", groupBy, days],
    queryFn: () => api.get<{ items: UsageGroup[] }>(`/admin/api/v1/usage${qs({ groupBy, from: daysAgo(days) })}`) });
  const lng = intlLocale(i18n.language);
  const n = (v: number) => new Intl.NumberFormat(lng).format(v);
  const usd = (v: number) => new Intl.NumberFormat(lng, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
  const items = data.data?.items ?? [];
  const total = items.reduce((s, g) => s + g.costUsd, 0);
  return (
    <>
      <h2 style={{ marginTop: 0 }}>{t("admin.usage.title")}</h2>
      <div className="row" style={{ gap: 12, marginBottom: 14 }}>
        <div className="mini-seg">{GROUPS.map((g) => <button key={g} className={groupBy === g ? "on" : ""} onClick={() => setGroupBy(g)}>{t(`admin.usage.by.${g}`)}</button>)}</div>
        <div className="mini-seg">{[7, 30, 90].map((d) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{t("admin.usage.days", { count: d })}</button>)}</div>
      </div>
      <div className="kpi"><div><b>{usd(total)}</b><span>{t("admin.usage.cost")}</span></div>
        <div><b>{n(items.reduce((s, g) => s + g.tokensIn + g.tokensOut + g.cacheRead + g.cacheWrite, 0))}</b><span>{t("admin.usage.tokens")}</span></div>
        <div><b>{n(items.reduce((s, g) => s + g.requests, 0))}</b><span>{t("admin.usage.requests")}</span></div></div>
      <table className="t">
        <thead><tr><th>{t(`admin.usage.by.${groupBy}`)}</th><th>{t("admin.usage.in")}</th><th>{t("admin.usage.out")}</th><th>{t("admin.usage.cache")}</th><th>{t("admin.usage.cost")}</th></tr></thead>
        <tbody>
          {items.map((g) => (
            <tr key={g.key}><td>{g.label || "—"}</td><td>{n(g.tokensIn)}</td><td>{n(g.tokensOut)}</td><td>{n(g.cacheRead + g.cacheWrite)}</td><td>{usd(g.costUsd)}</td></tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} className="muted">{t("admin.usage.empty")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
