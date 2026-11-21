import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { CommAdminSettings, ModelConnection } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Switch, useToast } from "@green-on-grey/ui-kit";
import { CommUsage } from "./CommUsage";

interface SourceItem { id: string; name: string; title: string; mode: string; adapter: string | null; commSource: boolean; published: boolean; commSources: { key: string; title: string }[] }

const TABS = ["settings", "stats"] as const;
type Tab = (typeof TABS)[number];

/** The memory of communications in the administration (FTR.NAB.CMN-0003 R29, FTR.NAB.MEM-0001 R25, design §3.6–3.8),
 * a section of its own with two tabs: «Settings» — whether it is allowed, the retention, the models, the limits and
 * the sources; «Statistics» — the usage of the month. Nothing here shows what is collected (R22). */
export function CommAdmin() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const tab: Tab = sp.get("tab") === "stats" ? "stats" : "settings";
  return (
    <>
      <h2 style={{ margin: 0 }}>{t("admin.comm.title")}</h2>
      <p className="lead">{t("admin.comm.lead")}</p>
      <div className="mtabs" role="tablist">
        {TABS.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? "on" : ""}
            onClick={() => setSp(x === "settings" ? {} : { tab: x }, { replace: true })}>{t(`admin.comm.tabs.${x}`)}</button>
        ))}
      </div>
      {tab === "settings" ? <CommSettings /> : <CommUsage />}
    </>
  );
}

/** The settings of the memory of communications: the switch, the retention in months, the models of the collection,
 * the compaction, the embeddings, the monthly limit, the limits of a run and which MCP servers are sources. */
function CommSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const done = () => { qc.invalidateQueries({ queryKey: ["admin", "comm"] }); toast({ kind: "ok", title: t("common.saved") }); };
  const cur = useQuery({ queryKey: ["admin", "comm", "settings"], queryFn: () => api.get<CommAdminSettings>("/admin/api/v1/settings/comm") });
  const conns = useQuery({ queryKey: ["admin", "connections"], queryFn: () => api.get<{ items: ModelConnection[] }>("/admin/api/v1/model-connections") });
  const sources = useQuery({ queryKey: ["admin", "comm", "sources"], queryFn: () => api.get<{ items: SourceItem[]; adapters: string[] }>("/admin/api/v1/comm/sources") });
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch<CommAdminSettings>("/admin/api/v1/settings/comm", body), onSuccess: done, onError: fail });
  const mark = useMutation({
    mutationFn: ({ id, ...body }: { id: string; adapter?: string; commSource?: boolean }) => api.patch(`/admin/api/v1/comm/sources/${id}`, body),
    onSuccess: done, onError: fail,
  });
  const [months, setMonths] = useState<string | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [timeout, setTimeoutMin] = useState<string | null>(null);
  const [threads, setThreads] = useState<string | null>(null);
  const s = cur.data;
  if (!s) return null;
  const models = (conns.data?.items ?? []).filter((c) => c.enabled).flatMap((c) => c.models.map((m) => ({ value: `${c.id}|${m.id}`, label: `${c.name} · ${m.name || m.id}` })));
  const choice = (v: CommAdminSettings["model"]) => (v ? `${v.connectionId}|${v.model}` : "");
  const pick = (field: "model" | "embeddings" | "compactModel", v: string) => {
    const [connectionId, model] = v.split("|");
    save.mutate({ [field]: v ? { connectionId, model } : null });
  };
  const retention = Number(months ?? s.retentionMonths), l = Number((limit ?? String(s.monthlyLimitUsd)).replace(",", "."));
  return (
    <>
      <div className="svc" style={{ maxWidth: 640 }}>
        <Switch on={s.enabled} disabled={save.isPending} onChange={(on) => save.mutate({ enabled: on })} label={t("admin.comm.enabled")} />
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="comm-ret">{t("admin.comm.retention")}</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="comm-ret" className="inp" style={{ width: 120 }} inputMode="numeric" value={months ?? String(s.retentionMonths)} onChange={(e) => setMonths(e.target.value)} />
            <span className="muted">{t("admin.comm.months")}</span>
            <button className="btn" disabled={!Number.isInteger(retention) || retention < 1 || retention > 60 || retention === s.retentionMonths || save.isPending} onClick={() => { save.mutate({ retentionMonths: retention }); setMonths(null); }}>{t("common.save")}</button>
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
          <label htmlFor="comm-compact">{t("admin.comm.compactModel")}</label>
          <select id="comm-compact" className="inp" value={choice(s.compactModel)} disabled={save.isPending} onChange={(e) => pick("compactModel", e.target.value)}>
            <option value="">{t("admin.comm.compactModelHint")}</option>
            {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
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
        <h4 style={{ margin: "18px 0 6px" }}>{t("admin.comm.collectTitle")}</h4>
        <CollectLimit id="comm-timeout" label={t("admin.comm.runTimeout")} unit={t("admin.comm.minutes")} hint={t("admin.comm.runTimeoutHint")}
          value={s.runTimeoutMinutes} fallback={s.defaults.runTimeoutMinutes} max={120} draft={timeout} setDraft={setTimeoutMin}
          busy={save.isPending} onSave={(v) => save.mutate({ runTimeoutMinutes: v })} />
        <CollectLimit id="comm-threads" label={t("admin.comm.batchThreads")} hint={t("admin.comm.batchThreadsHint")}
          value={s.batchThreads} fallback={s.defaults.batchThreads} max={100} draft={threads} setDraft={setThreads}
          busy={save.isPending} onSave={(v) => save.mutate({ batchThreads: v })} />
        {(!s.model || conns.data) && (
          <ThinkingOff value={s.thinkingOff} type={conns.data?.items.find((c) => c.id === s.model?.connectionId)?.type} busy={save.isPending}
            onSave={(v) => save.mutate({ thinkingOff: v })} />
        )}
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

    </>
  );
}

/** A limit of the collection the administrator sets over the value of the installation (FTR.NAB.CMN-0003
 * decision 52): an integer from 1 to max; "reset" returns the value of the installation (null). */
function CollectLimit({ id, label, unit, hint, value, fallback, max, draft, setDraft, busy, onSave }: {
  id: string; label: string; unit?: string; hint: string; value: number | null; fallback: number; max: number;
  draft: string | null; setDraft: (v: string | null) => void; busy: boolean; onSave: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  const shown = draft ?? String(value ?? fallback);
  const n = Number(shown);
  const valid = Number.isInteger(n) && n >= 1 && n <= max;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row" style={{ gap: 8 }}>
        <input id={id} className="inp" style={{ width: 120 }} inputMode="numeric" value={shown} onChange={(e) => setDraft(e.target.value)} />
        {unit && <span className="muted">{unit}</span>}
        <button className="btn" disabled={!valid || n === (value ?? fallback) || busy} onClick={() => { onSave(n); setDraft(null); }}>{t("common.save")}</button>
        {value !== null && <button className="btn ghost" disabled={busy} onClick={() => { onSave(null); setDraft(null); }}>{t("admin.comm.reset")}</button>}
      </div>
      <div className="hint">{hint} {t("admin.comm.byDefault", { value: fallback })}</div>
    </div>
  );
}

/** The explicit thinking off of the model of the collection (FTR.NAB.CMN-0003 R29, design §3.10, decision 26): a
 * switch and the way. DeepSeek, Z.AI and GigaChat switch it off by their own parameter, so they get a hint. */
function ThinkingOff({ value, type, busy, onSave }: {
  value: CommAdminSettings["thinkingOff"]; type?: string; busy: boolean; onSave: (v: CommAdminSettings["thinkingOff"]) => void;
}) {
  const { t } = useTranslation();
  if (type && type !== "openai_compatible") {
    return <div className="field"><div className="hint">{t("admin.comm.thinkingAlways")}</div></div>;
  }
  return (
    <div className="field">
      <Switch on={value !== null} disabled={busy} onChange={(on) => onSave(on ? "chat-template" : null)} label={t("admin.comm.thinkingOff")} />
      {value !== null && (
        <>
          <label htmlFor="comm-thinking" style={{ marginTop: 8 }}>{t("admin.comm.thinkingWay")}</label>
          <select id="comm-thinking" className="inp" value={value} disabled={busy}
            onChange={(e) => onSave(e.target.value as NonNullable<CommAdminSettings["thinkingOff"]>)}>
            <option value="chat-template">{t("admin.comm.thinkingChatTemplate")}</option>
            <option value="reasoning-effort">{t("admin.comm.thinkingReasoningEffort")}</option>
          </select>
          <div className="hint">{t("admin.comm.thinkingHint")}</div>
        </>
      )}
    </div>
  );
}
