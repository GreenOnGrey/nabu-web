import type { TFunction } from "i18next";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiUrl } from "../../api/base";
import { api, qs } from "../../api/client";
import type { AuditEntry, List } from "../../api/types";
import { intlLocale } from "../../lib/i18n";
import { dateTime } from "../../lib/format";
import { Icon } from "@green-on-grey/ui-kit";

/** The period start is fixed per choice so the query key stays stable. */
const cache = new Map<number, string>();
function periodStart(days: number): { days: number; from: string } {
  if (!cache.has(days)) cache.set(days, new Date(Date.now() - days * 86400_000).toISOString());
  return { days, from: cache.get(days)! };
}

/** On whose behalf an action ran. A service agent acts for its client, and
 * the initiator is below; a built-in one (the collector of the memory of
 * communications) has no client — it is the platform acting for the user
 * whose mail it reads (FTR.NAB.CMN-0003 R30). A personal agent acts for its
 * user, through a client if there was one. */
function auditActor(e: AuditEntry, t: TFunction): { name: string | null; note: string | null } {
  if (e.agentKind !== "service") return { name: e.userEmail, note: e.clientName && t("admin.audit.via", { client: e.clientName }) };
  if (e.clientName) return { name: e.clientName, note: e.initiatorEmail };
  return { name: t("admin.audit.system"), note: e.initiatorEmail || e.userEmail };
}

/** The audit (R28, design §3.10): filters by agent kind and period, CSV export;
 * time, agent, on whose behalf, channel, tool, result. */
export function AuditAdmin() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const [agentKind, setAgentKind] = useState("");
  const [days, setDays] = useState(7);
  const [result, setResult] = useState("");
  const user = params.get("user") ?? "";
  const [since] = useState(() => periodStart(days));
  const from = days === since.days ? since.from : periodStart(days).from;
  const query = qs({ from, agentKind, result, user });
  const list = useInfiniteQuery({
    queryKey: ["admin", "audit", query],
    initialPageParam: "",
    queryFn: ({ pageParam }) => api.get<List<AuditEntry>>(`/admin/api/v1/audit${query}&limit=100${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const lng = intlLocale(i18n.language);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("admin.audit.title")}</h2>
        <a className="btn sm" href={apiUrl(`/admin/api/v1/audit/export.csv${query}`)}><Icon name="download" size={14} />{t("admin.audit.export")}</a>
      </div>
      <div className="row" style={{ gap: 12, margin: "14px 0" }}>
        <div className="mini-seg">{["", "personal", "service"].map((k) => <button key={k} className={agentKind === k ? "on" : ""} onClick={() => setAgentKind(k)}>{t(`admin.audit.kinds.${k || "all"}`)}</button>)}</div>
        <div className="mini-seg">{[1, 7, 30].map((d) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{t("admin.usage.days", { count: d })}</button>)}</div>
        <div className="mini-seg">{["", "ok", "error"].map((r) => <button key={r} className={result === r ? "on" : ""} onClick={() => setResult(r)}>{t(`admin.audit.results.${r || "all"}`)}</button>)}</div>
        {user && <span className="chip on">{t("admin.audit.oneUser")}</span>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr><th>{t("admin.audit.time")}</th><th>{t("admin.audit.agent")}</th><th>{t("admin.audit.onBehalf")}</th><th>{t("admin.audit.channel")}</th><th>{t("admin.audit.tool")}</th><th>{t("admin.audit.result")}</th></tr></thead>
          <tbody>
            {rows.map((e) => { const actor = auditActor(e, t); return (
              <tr key={e.id}>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{dateTime(e.at, lng)}</td>
                <td>{e.agent}<div className="small muted">{t(`admin.audit.kinds.${e.agentKind}`)}</div></td>
                <td>{actor.name}{actor.note && <div className="small muted">{actor.note}</div>}</td>
                <td className="small">{e.channel}</td>
                <td><span className="mono small">{e.server ? `${e.server}: ` : ""}{e.tool}</span>{e.argsSummary && <div className="small muted mono" style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.argsSummary}>{e.argsSummary}</div>}</td>
                <td>{e.result === "ok" ? <span className="ok-t">{t("admin.audit.results.ok")}</span> : <span className="err-t" title={e.error ?? ""}>{t("admin.audit.results.error")}</span>}</td>
              </tr>
            ); })}
            {rows.length === 0 && !list.isLoading && <tr><td colSpan={6} className="muted">{t("admin.audit.empty")}</td></tr>}
          </tbody>
        </table>
      </div>
      {list.hasNextPage && <button className="btn ghost sm" onClick={() => list.fetchNextPage()}>{t("common.more")}</button>}
    </>
  );
}
