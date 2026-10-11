import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { CommAdminSettings, ModelConnection } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Icon } from "../../components/Icon";
import { Switch, useToast } from "../../components/ui";

interface SourceItem { id: string; name: string; title: string; mode: string; adapter: string | null; commSource: boolean; published: boolean; commSources: { key: string; title: string }[] }
interface Usage { enabledUsers: number; notes: number; costUsd: number; monthlyLimitUsd: number; items: { userId: string; email: string; notes: number; runs: number; costUsd: number; limitUsedPct: number }[] }

/** The memory of communications in the administration (FTR.NAB.CMN-0003 R29,
 * design §3.10), a section of its own: whether it is allowed, the retention, the model of the
 * collection, the monthly limit, which MCP servers are sources, and the
 * usage. Nothing here shows what is collected (R22). */
export function CommAdmin() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const done = () => { qc.invalidateQueries({ queryKey: ["admin", "comm"] }); toast({ kind: "ok", title: t("common.saved") }); };
  const cur = useQuery({ queryKey: ["admin", "comm", "settings"], queryFn: () => api.get<CommAdminSettings>("/admin/api/v1/settings/comm") });
  const conns = useQuery({ queryKey: ["admin", "connections"], queryFn: () => api.get<{ items: ModelConnection[] }>("/admin/api/v1/model-connections") });
  const sources = useQuery({ queryKey: ["admin", "comm", "sources"], queryFn: () => api.get<{ items: SourceItem[]; adapters: string[] }>("/admin/api/v1/comm/sources") });
  const usage = useQuery({ queryKey: ["admin", "comm", "usage"], queryFn: () => api.get<Usage>("/admin/api/v1/comm/usage") });
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch<CommAdminSettings>("/admin/api/v1/settings/comm", body), onSuccess: done, onError: fail });
  const mark = useMutation({
    mutationFn: ({ id, ...body }: { id: string; adapter?: string; commSource?: boolean }) => api.patch(`/admin/api/v1/comm/sources/${id}`, body),
    onSuccess: done, onError: fail,
  });
  const [days, setDays] = useState<string | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const s = cur.data;
  if (!s) return null;
  const money = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" });
  const models = (conns.data?.items ?? []).filter((c) => c.enabled).flatMap((c) => c.models.map((m) => ({ value: `${c.id}|${m.id}`, label: `${c.name} · ${m.name || m.id}` })));
  const choice = (v: CommAdminSettings["model"]) => (v ? `${v.connectionId}|${v.model}` : "");
  const pick = (field: "model" | "embeddings", v: string) => {
    const [connectionId, model] = v.split("|");
    save.mutate({ [field]: v ? { connectionId, model } : null });
  };
  const d = Number(days ?? s.retentionDays), l = Number((limit ?? String(s.monthlyLimitUsd)).replace(",", "."));
  return (
    <>
      <h2 style={{ margin: 0 }}>{t("admin.comm.title")}</h2>
      <p className="lead">{t("admin.comm.lead")}</p>
      <div className="svc" style={{ maxWidth: 640 }}>
        <Switch on={s.enabled} disabled={save.isPending} onChange={(on) => save.mutate({ enabled: on })} label={t("admin.comm.enabled")} />
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="comm-ret">{t("admin.comm.retention")}</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="comm-ret" className="inp" style={{ width: 120 }} inputMode="numeric" value={days ?? String(s.retentionDays)} onChange={(e) => setDays(e.target.value)} />
            <span className="muted">{t("admin.settings.days")}</span>
            <button className="btn" disabled={!Number.isInteger(d) || d < 1 || d > 3650 || d === s.retentionDays || save.isPending} onClick={() => { save.mutate({ retentionDays: d }); setDays(null); }}>{t("common.save")}</button>
          </div>
          <div className="hint">{t("admin.comm.retentionHint")}</div>
        </div>
        <div className="field">
          <label htmlFor="comm-model">{t("admin.comm.model")}</label>
          <select id="comm-model" className="inp" value={choice(s.model)} disabled={save.isPending} onChange={(e) => pick("model", e.target.value)}>
            <option value="">{t("admin.comm.notChosen")}</option>
            {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {!s.model && s.enabled && <div className="hint warn-t">{t("admin.comm.modelMissing")}</div>}
        </div>
        <div className="field">
          <label htmlFor="comm-emb">{t("admin.comm.embeddings")}</label>
          <select id="comm-emb" className="inp" value={choice(s.embeddings)} disabled={save.isPending || !s.vectorsAvailable} onChange={(e) => pick("embeddings", e.target.value)}>
            <option value="">{t("admin.comm.notChosen")}</option>
            {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <div className={`hint${s.semantic ? "" : " warn-t"}`}>
            {!s.vectorsAvailable ? t("admin.comm.noVectors") : s.semantic ? t("admin.comm.embeddingsHint") : t("admin.comm.wordsOnly")}
          </div>
        </div>
        <div className="field">
          <label htmlFor="comm-limit">{t("admin.comm.limit")}</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="comm-limit" className="inp" style={{ width: 120 }} inputMode="decimal" value={limit ?? String(s.monthlyLimitUsd)} onChange={(e) => setLimit(e.target.value)} />
            <span className="muted">USD</span>
            <button className="btn" disabled={!Number.isFinite(l) || l < 0 || l === s.monthlyLimitUsd || save.isPending} onClick={() => { save.mutate({ monthlyLimitUsd: l }); setLimit(null); }}>{t("common.save")}</button>
          </div>
          <div className="hint">{t("admin.comm.limitHint")}</div>
        </div>
      </div>

      <h4 style={{ margin: "22px 0 6px" }}>{t("admin.comm.sources")}</h4>
      <p className="small muted" style={{ marginTop: 0 }}>{t("admin.comm.sourcesHint")}</p>
      <div style={{ overflowX: "auto", maxWidth: 760 }}>
        <table className="t">
          <thead><tr><th>{t("admin.comm.server")}</th><th>{t("admin.comm.adapter")}</th><th>{t("admin.comm.gives")}</th><th>{t("admin.comm.isSource")}</th></tr></thead>
          <tbody>
            {sources.data?.items.filter((x) => x.mode === "personal").map((x) => (
              <tr key={x.id}>
                <td><b>{x.title || x.name}</b>{!x.published && <div className="small muted">{t("admin.comm.unpublished")}</div>}</td>
                <td>
                  <select className="sel" value={x.adapter ?? ""} disabled={mark.isPending || x.commSource} onChange={(e) => mark.mutate({ id: x.id, adapter: e.target.value })} aria-label={t("admin.comm.adapter")}>
                    <option value="">—</option>
                    {sources.data!.adapters.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
                <td className="small">{x.commSources.map((c) => c.title).join(", ") || "—"}</td>
                <td><Switch on={x.commSource} disabled={mark.isPending || !x.adapter} onChange={(on) => mark.mutate({ id: x.id, commSource: on })} label={<span className="sr-only">{t("admin.comm.isSource")}</span>} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 style={{ margin: "22px 0 6px" }}>{t("admin.comm.usage")}</h4>
      {usage.data && (
        <>
          <div className="row" style={{ gap: 24, marginBottom: 10 }}>
            <span><span className="small muted">{t("admin.comm.enabledUsers")}</span><div><b>{usage.data.enabledUsers}</b></div></span>
            <span><span className="small muted">{t("admin.comm.notes")}</span><div><b>{usage.data.notes.toLocaleString(i18n.language)}</b></div></span>
            <span><span className="small muted">{t("admin.comm.cost")}</span><div><b>{money.format(usage.data.costUsd)}</b></div></span>
          </div>
          {usage.data.items.length > 0 && (
            <div style={{ overflowX: "auto", maxWidth: 760 }}>
              <table className="t">
                <thead><tr><th>{t("admin.comm.user")}</th><th>{t("admin.comm.notes")}</th><th>{t("admin.comm.runs")}</th><th>{t("admin.comm.cost")}</th><th>{t("admin.comm.limit")}</th></tr></thead>
                <tbody>
                  {usage.data.items.map((u) => (
                    <tr key={u.userId}><td>{u.email}</td><td>{u.notes}</td><td>{u.runs}</td><td>{money.format(u.costUsd)}</td>
                      <td style={{ minWidth: 120 }}>{usage.data!.monthlyLimitUsd > 0 ? <div className="meter"><i className={u.limitUsedPct >= 90 ? "warn" : ""} style={{ width: `${Math.min(100, u.limitUsedPct)}%` }} /></div> : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="hintbox" style={{ maxWidth: 760, marginTop: 12 }}><Icon name="lock" /><span>{t("admin.comm.noContent")}</span></div>
        </>
      )}
    </>
  );
}
