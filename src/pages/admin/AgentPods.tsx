import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import type { AgentPod, AgentPods } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { dateTime, duration, relativeTime } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { Empty, Modal, useToast } from "../../components/ui";

type Filter = "all" | "busy" | "warm" | "starting" | "groups";
const FILTERS: Filter[] = ["all", "busy", "warm", "starting", "groups"];
const match: Record<Filter, (p: AgentPod) => boolean> = {
  all: () => true,
  busy: (p) => p.busy && p.state === "ready",
  warm: (p) => p.warm && p.state === "ready",
  starting: (p) => p.state === "starting",
  groups: (p) => p.ownerKind === "group",
};

/** Agents (FTR.NAB.CMN-0004 R16, design §3.6–3.8): the capacity and its
 * source, the warm reserve, the queue and the pods of agents. */
export function AgentPodsAdmin() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const locale = intlLocale(i18n.language);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirm, setConfirm] = useState<AgentPod | null>(null);
  const key = ["admin", "agent-pods"];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<AgentPods>("/admin/api/v1/agent-pods"), refetchInterval: 5000 });
  const stop = useMutation({
    mutationFn: ({ pod, force }: { pod: AgentPod; force: boolean }) => api.del(`/admin/api/v1/agent-pods/${pod.ownerId}${force ? "?force=true" : ""}`),
    onSuccess: () => { setConfirm(null); toast({ kind: "ok", title: t("admin.agent-pods.stopped") }); qc.invalidateQueries({ queryKey: key }); },
    onError: (e, v) => {
      // the turn began after the list was loaded: ask before interrupting it
      if (e instanceof ApiError && e.code === "agent_pod_busy" && !v.force) setConfirm(v.pod);
      else { setConfirm(null); toast({ kind: "error", title: errorText(t, e) }); qc.invalidateQueries({ queryKey: key }); }
    },
  });
  const title = <><h2 style={{ margin: 0 }}>{t("admin.agent-pods.title")}</h2><p className="lead">{t("admin.agent-pods.lead")}</p></>;
  if (q.isLoading) return <>{title}<p className="muted">{t("common.loading")}</p></>;
  if (q.isError || !q.data) {
    return <>{title}<div className="llmerr" role="alert"><span>{errorText(t, q.error)}</span>
      <button className="btn sm" onClick={() => q.refetch()}>{t("llm.retry")}</button></div></>;
  }
  const d = q.data;
  if (!d.enabled) return <>{title}<Empty icon="bolt" title={t("admin.agent-pods.local")} /></>;

  const now = new Date(q.dataUpdatedAt);
  const ago = (seconds: number) => duration(new Date(now.getTime() - seconds * 1000).toISOString(), locale, now);
  const ready = d.pods.filter((p) => p.state === "ready");
  const warm = ready.filter((p) => p.warm && !p.busy).length;
  const active = d.capacity.used - warm - d.capacity.starting;
  const max = d.capacity.max;
  const total = max ?? Math.max(d.capacity.used, 1);
  const pct = (n: number) => `${Math.min(100, (n / total) * 100)}%`;
  const full = max !== null && d.capacity.used >= max && d.queue.length > 0;
  const shown = d.pods.filter(match[filter]);
  return (
    <>
      {title}
      {full && (
        <div className="reqbox" role="status">
          <b><Icon name="alert" size={15} /> {t("admin.agent-pods.full")}</b>{" "}
          {t("admin.agent-pods.fullQueue", { count: d.queue.length, time: ago(d.queue.oldestSeconds) })}{" "}
          {t(`admin.agent-pods.fullSources.${d.capacity.source}`, { max, when: d.capacity.learnedAt ? dateTime(d.capacity.learnedAt, locale) : "" })}{" "}
          {d.capacity.source === "cluster" && d.capacity.probeAfter && <>{t("admin.agent-pods.fullProbe", { when: dateTime(d.capacity.probeAfter, locale) })}{" "}</>}
          {t("admin.agent-pods.fullAdvice")}
        </div>
      )}
      <div className="kpi">
        <div><b>{max === null ? d.capacity.used : `${d.capacity.used} / ${max}`}</b><span>{t("admin.agent-pods.pods")} · {t(`admin.agent-pods.sources.${d.capacity.source}`)}</span></div>
        <div><b>{d.warm.target === null ? d.warm.now : `${d.warm.now} / ${d.warm.target}`}</b><span>{t(d.warm.target === null ? "admin.agent-pods.warmAll" : "admin.agent-pods.warm")}</span></div>
        <div><b className={d.queue.length > 0 ? "warn-t" : undefined}>{d.queue.length}</b>
          <span>{d.queue.length > 0 ? t("admin.agent-pods.queueOldest", { time: ago(d.queue.oldestSeconds) }) : t("admin.agent-pods.queue")}</span></div>
        <div><b>{d.capacity.starting}</b><span>{t("admin.agent-pods.starting")}</span></div>
      </div>
      <div className="capbar" role="img" aria-label={`${t("admin.agent-pods.pods")}: ${d.capacity.used}${max === null ? "" : ` / ${max}`}`}>
        <i className="busy" style={{ width: pct(active) }} /><i className="warm" style={{ width: pct(warm) }} /><i className="start" style={{ width: pct(d.capacity.starting) }} />
      </div>
      <div className="caplegend">
        <span><i style={{ background: "var(--violet)" }} />{t("admin.agent-pods.legend.active", { count: active })}</span>
        <span><i style={{ background: "var(--amber)" }} />{t("admin.agent-pods.legend.warm", { count: warm })}</span>
        <span><i style={{ background: "var(--border-strong)" }} />{t("admin.agent-pods.legend.starting", { count: d.capacity.starting })}</span>
        {max !== null && <span>{t("admin.agent-pods.legend.free", { count: Math.max(0, max - d.capacity.used) })}</span>}
      </div>
      {d.pods.length === 0 && <Empty icon="bolt" title={t("admin.agent-pods.empty")}>{t("admin.agent-pods.emptyHint")}</Empty>}
      {d.pods.length > 0 && (
        <>
          <div className="chips">
            {FILTERS.map((f) => (
              <button key={f} className={`chip${filter === f ? " on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`admin.agent-pods.filters.${f}`, { count: d.pods.filter(match[f]).length })}
              </button>
            ))}
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="t">
              <thead><tr><th>{t("admin.agent-pods.cols.owner")}</th><th>{t("admin.agent-pods.cols.state")}</th><th>{t("admin.agent-pods.cols.sessions")}</th>
                <th>{t("admin.agent-pods.cols.activity")}</th><th>{t("admin.agent-pods.cols.node")}</th><th /></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.ownerId}>
                    <td><b>{p.title}</b><div className="small muted">{t(`admin.agent-pods.kinds.${p.ownerKind}`)}{p.channel ? ` · ${t(`channels.${p.channel}`)}` : ""}</div></td>
                    <td>
                      {p.state === "ready" && p.busy && <span className="st ok">{t("admin.agent-pods.states.busy")}</span>}
                      {p.state === "ready" && !p.busy && <span className="small">{t("admin.agent-pods.states.ready")}</span>}
                      {p.state === "starting" && <span className="small muted"><span className="spin" aria-hidden="true" /> {t("admin.agent-pods.states.starting", { time: duration(p.startedAt, locale, now) })}</span>}
                      {p.state === "stopping" && <span className="small muted">{t("admin.agent-pods.states.stopping", { reason: t(`admin.agent-pods.reasons.${p.stopReason || "idle"}`) })}</span>}
                      {p.warm && p.state === "ready" && <> <span className="chip" style={{ fontSize: 11, padding: "1px 8px" }}>{t("admin.agent-pods.warmMark")}</span></>}
                    </td>
                    <td className="mono small">{p.state === "ready" ? p.sessions : "—"}</td>
                    <td className="small">{relativeTime(p.lastActivityAt, locale, now)}</td>
                    <td className="mono small">{p.node || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {p.state === "ready" && (
                        <button className="btn sm" disabled={stop.isPending} onClick={() => (p.busy ? setConfirm(p) : stop.mutate({ pod: p, force: false }))}>
                          {t("admin.agent-pods.stop")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {confirm && (
        <Modal title={t("admin.agent-pods.stopTitle", { owner: confirm.title })} onClose={() => setConfirm(null)}
          footer={<><button className="btn ghost" onClick={() => setConfirm(null)}>{t("common.cancel")}</button>
            <button className="btn danger" disabled={stop.isPending} onClick={() => stop.mutate({ pod: confirm, force: true })}>{t("admin.agent-pods.stop")}</button></>}>
          <p>{t("admin.agent-pods.stopText")}</p>
        </Modal>
      )}
    </>
  );
}
