import type { TFunction } from "i18next";
import { Fragment, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiUrl } from "../../api/base";
import { api, qs } from "../../api/client";
import type { AuditEntry, List } from "../../api/types";
import { intlLocale } from "../../lib/i18n";
import { dateTime } from "../../lib/format";
import { Icon, useToast } from "@green-on-grey/ui-kit";
import { prettyArgs } from "./auditArgs";

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

/** One block of the details of an audit row: the label, the full text and the copy
 * button (design §3.10). */
function Detail({ label, text, copyLabel, onCopy }: { label: string; text: string; copyLabel: string; onCopy: (text: string) => void }) {
  return (
    <div>
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <span className="small muted">{label}</span>
        <button className="btn ghost sm" onClick={(ev) => { ev.stopPropagation(); onCopy(text); }}>
          <Icon name="copy" size={14} />{copyLabel}
        </button>
      </div>
      <pre className="mono small" style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</pre>
    </div>
  );
}

/** The audit (R28, design §3.10): filters by agent kind and period, CSV export;
 * time, agent, on whose behalf, channel, tool, result. A row with arguments or an
 * error opens its details: the full text with a copy button (design §3.10). */
export function AuditAdmin() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [params] = useSearchParams();
  const [agentKind, setAgentKind] = useState("");
  const [days, setDays] = useState(7);
  const [result, setResult] = useState("");
  const [open, setOpen] = useState<number | null>(null);
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
  // AUD-08: the toast tells the truth — a copy can be refused by the browser
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ kind: "ok", title: t("admin.audit.copied") });
    } catch {
      toast({ kind: "error", title: t("admin.audit.copyFailed") });
    }
  };
  const cell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
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
        <table className="t" style={{ tableLayout: "fixed", minWidth: 720 }}>
          <colgroup>
            <col style={{ width: 150 }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: 92 }} />
            <col />
            <col style={{ width: "23%" }} />
          </colgroup>
          <thead><tr><th>{t("admin.audit.time")}</th><th>{t("admin.audit.agent")}</th><th>{t("admin.audit.onBehalf")}</th><th>{t("admin.audit.channel")}</th><th>{t("admin.audit.tool")}</th><th>{t("admin.audit.result")}</th></tr></thead>
          <tbody>
            {rows.map((e) => {
              const actor = auditActor(e, t);
              const detailed = Boolean(e.error || e.argsSummary);
              const expanded = open === e.id;
              const toggle = () => setOpen(expanded ? null : e.id);
              return (
                <Fragment key={e.id}>
                  <tr
                    className={detailed ? "clickable" : undefined}
                    tabIndex={detailed ? 0 : undefined}
                    aria-expanded={detailed ? expanded : undefined}
                    onClick={detailed ? toggle : undefined}
                    onKeyDown={detailed ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } } : undefined}
                  >
                    <td className="small" style={{ whiteSpace: "normal" }}>
                      {detailed && <span style={{ display: "inline-block", transform: expanded ? "rotate(180deg)" : undefined }}><Icon name="down" size={12} className="muted" /></span>}{" "}
                      {dateTime(e.at, lng)}
                    </td>
                    <td>{e.agent}<div className="small muted">{t(`admin.audit.kinds.${e.agentKind}`)}</div></td>
                    <td>{actor.name}{actor.note && <div className="small muted">{actor.note}</div>}</td>
                    <td className="small" style={cell} title={e.channel}>{e.channel}</td>
                    <td><span className="mono small">{e.server ? `${e.server}: ` : ""}{e.tool}</span>{e.argsSummary && <div className="small muted mono" style={cell}>{e.argsSummary}</div>}</td>
                    <td>{e.result === "ok" ? <span className="ok-t">{t("admin.audit.results.ok")}</span> : (
                      <span className="err-t">
                        {t("admin.audit.results.error")}
                        {/* The message of the provider or of the tool: a failed turn of the model is here too (R28). */}
                        {e.error && <div className="small muted mono" style={cell}>{e.error}</div>}
                      </span>)}</td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={6}>
                        {e.argsSummary && (
                          <div style={{ marginBottom: e.error ? 12 : 0 }}>
                            <Detail label={t("admin.audit.args")} text={prettyArgs(e.argsSummary)} copyLabel={t("admin.audit.copy")} onCopy={copy} />
                          </div>
                        )}
                        {e.error && <Detail label={t("admin.audit.error")} text={e.error} copyLabel={t("admin.audit.copy")} onCopy={copy} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && !list.isLoading && <tr><td colSpan={6} className="muted">{t("admin.audit.empty")}</td></tr>}
          </tbody>
        </table>
      </div>
      {list.hasNextPage && <button className="btn ghost sm" onClick={() => list.fetchNextPage()}>{t("common.more")}</button>}
    </>
  );
}
