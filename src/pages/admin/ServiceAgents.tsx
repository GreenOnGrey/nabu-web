import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { AdminCatalogItem, Harness, List, ModelConnection, Run, ServiceAgent, ServiceClient } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { dateTime } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { Modal, Switch } from "../../components/ui";

/** Service agents (R15–R17, design §3.8): the table and the configuration form, the run log. */
export function ServiceAgentsAdmin() {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ServiceAgent | "new" | null>(null);
  const [runsOf, setRunsOf] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin", "service-agents"], queryFn: () => api.get<{ items: ServiceAgent[] }>("/admin/api/v1/service-agents") });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("admin.service-agents.title")}</h2>
        <button className="btn primary sm" onClick={() => setEditing("new")}><Icon name="plus" size={15} />{t("admin.service-agents.add")}</button>
      </div>
      <p className="t2">{t("admin.service-agents.lead")}</p>
      <div style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr><th>{t("admin.service-agents.name")}</th><th>{t("admin.service-agents.model")}</th><th>{t("admin.service-agents.workspace")}</th><th>{t("admin.service-agents.clients")}</th><th>{t("admin.service-agents.week")}</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((a) => (
              <tr key={a.name} style={a.enabled ? undefined : { opacity: 0.55 }}>
                <td><b className="mono">{a.name}</b><div className="small muted">{a.description}</div></td>
                <td className="small"><span className="mono">{a.harness} · {a.model.model}</span>{a.model.thinking && a.model.thinking !== "off" ? ` · ${a.model.thinking}` : ""}</td>
                <td>{t(`admin.service-agents.workspaces.${a.workspace}`)}</td>
                <td>{a.clients.join(", ") || <span className="muted">—</span>}</td>
                <td>{a.runsWeek}{a.failedWeek > 0 && <span className="err-t"> · {t("admin.service-agents.failed", { count: a.failedWeek })}</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm" onClick={() => setRunsOf(a.name)}>{t("admin.service-agents.runs")}</button>{" "}
                  <button className="btn sm" onClick={() => setEditing(a)}>{t("common.edit")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <AgentForm agent={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {runsOf && <Runs name={runsOf} onClose={() => setRunsOf(null)} />}
    </>
  );
}

function Chips({ all, selected, onChange }: { all: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {all.map((x) => {
        const on = selected.includes(x);
        return <button key={x} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(on ? selected.filter((y) => y !== x) : [...selected, x])}>{x}</button>;
      })}
      {all.length === 0 && <span className="small muted">—</span>}
    </div>
  );
}

function AgentForm({ agent, onClose }: { agent: ServiceAgent | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ["admin", "connections"], queryFn: () => api.get<{ items: ModelConnection[] }>("/admin/api/v1/model-connections") });
  const catalog = useQuery({ queryKey: ["admin", "catalog"], queryFn: () => api.get<{ items: AdminCatalogItem[] }>("/admin/api/v1/catalog") });
  const clients = useQuery({ queryKey: ["admin", "clients"], queryFn: () => api.get<{ items: ServiceClient[] }>("/admin/api/v1/clients") });
  const harnesses = useQuery({ queryKey: ["admin", "harnesses"], queryFn: () => api.get<{ items: Harness[] }>("/admin/api/v1/harnesses") });
  const [f, setF] = useState<Omit<ServiceAgent, "enabled" | "runsWeek" | "failedWeek" | "updatedAt">>(agent ?? {
    name: "", description: "", harness: "pi", model: { connectionId: "", model: "", thinking: "off" }, instructions: "",
    skills: [], mcp: [], acceptCallerMcp: true, workspace: "none", limits: { timeoutSec: 1800, maxTokens: 0 }, clients: [],
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => (agent ? api.put(`/admin/api/v1/service-agents/${agent.name}`, f) : api.post("/admin/api/v1/service-agents", f)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "service-agents"] }); qc.invalidateQueries({ queryKey: ["admin", "clients"] }); onClose(); },
  });
  const del = useMutation({
    mutationFn: () => api.del(`/admin/api/v1/service-agents/${agent!.name}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "service-agents"] }); onClose(); },
  });
  const models = (conns.data?.items ?? []).flatMap((c) => c.models.map((m) => ({ c, m })));
  const cur = models.find((x) => x.c.id === f.model.connectionId && x.m.id === f.model.model);
  const levels = cur?.m.reasoning ? ["off", ...Object.entries(cur.m.thinkingLevelMap ?? {}).filter(([, v]) => v).map(([k]) => k)] : ["off"];
  const skills = (catalog.data?.items ?? []).filter((i) => i.type === "skill").flatMap((i) => i.skills);
  const platformMcp = (catalog.data?.items ?? []).filter((i) => i.type === "mcp" && i.mode === "platform").map((i) => i.name);
  return (
    <Modal wide title={agent ? agent.name : t("admin.service-agents.add")} onClose={onClose} footer={<>
      {agent && <button className="btn danger" style={{ marginRight: "auto" }} onClick={() => del.mutate()}>{t("common.delete")}</button>}
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!f.name || !f.model.model || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      <div className="form-grid">
        <div className="field"><label htmlFor="sa-name">{t("admin.service-agents.name")}</label><input id="sa-name" className="inp mono" disabled={!!agent} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="report-builder" /></div>
        <div className="field"><label htmlFor="sa-h">Harness</label>
          <select id="sa-h" className="inp" value={f.harness} onChange={(e) => set("harness", e.target.value)}>
            {(harnesses.data?.items ?? [{ name: "pi" }]).map((h) => <option key={h.name} value={h.name}>{h.name === "pi" ? "Pi" : h.name}</option>)}
          </select></div>
      </div>
      <div className="field"><label htmlFor="sa-d">{t("admin.service-agents.purpose")}</label><input id="sa-d" className="inp" value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="sa-m">{t("admin.service-agents.model")}</label>
          <select id="sa-m" className="inp" value={`${f.model.connectionId}|${f.model.model}`} onChange={(e) => { const [connectionId, model] = e.target.value.split("|"); set("model", { connectionId, model, thinking: "off" }); }}>
            <option value="|">—</option>
            {models.map(({ c, m }) => <option key={`${c.id}|${m.id}`} value={`${c.id}|${m.id}`}>{c.name} · {m.id}</option>)}
          </select></div>
        <div className="field"><label htmlFor="sa-t">{t("admin.models.thinking")}</label>
          <select id="sa-t" className="inp" value={f.model.thinking ?? "off"} onChange={(e) => set("model", { ...f.model, thinking: e.target.value })}>
            {levels.map((l) => <option key={l} value={l}>{t(`admin.models.levels.${l}`, { defaultValue: l })}</option>)}
          </select></div>
      </div>
      <div className="field"><label htmlFor="sa-i">{t("admin.service-agents.instructions")}</label><textarea id="sa-i" className="inp" rows={4} value={f.instructions} onChange={(e) => set("instructions", e.target.value)} /></div>
      <div className="field"><label>{t("admin.service-agents.skills")}</label><Chips all={[...new Set([...skills, ...f.skills])]} selected={f.skills} onChange={(v) => set("skills", v)} /></div>
      <div className="field"><label>MCP</label><Chips all={[...new Set([...platformMcp, ...f.mcp])]} selected={f.mcp} onChange={(v) => set("mcp", v)} />
        <div className="hint">{t("admin.service-agents.mcpHint")}</div>
        <div style={{ marginTop: 8 }}><Switch on={f.acceptCallerMcp} onChange={(v) => set("acceptCallerMcp", v)} label={t("admin.service-agents.callerMcp")} /></div></div>
      <div className="field"><label>{t("admin.service-agents.workspace")}</label>
        <div className="mini-seg" style={{ display: "inline-flex" }}>
          {(["none", "nabu", "external"] as const).map((w) => <button key={w} className={f.workspace === w ? "on" : ""} onClick={() => set("workspace", w)}>{t(`admin.service-agents.workspaces.${w}`)}</button>)}
        </div></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="sa-to">{t("admin.service-agents.timeout")}</label><input id="sa-to" type="number" min={60} className="inp" value={f.limits.timeoutSec} onChange={(e) => set("limits", { ...f.limits, timeoutSec: Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor="sa-tok">{t("admin.service-agents.maxTokens")}</label><input id="sa-tok" type="number" min={0} className="inp" value={f.limits.maxTokens} onChange={(e) => set("limits", { ...f.limits, maxTokens: Number(e.target.value) })} /></div>
      </div>
      <div className="field"><label>{t("admin.service-agents.clients")}</label><Chips all={(clients.data?.items ?? []).map((c) => c.name)} selected={f.clients} onChange={(v) => set("clients", v)} /></div>
      {(save.error || del.error) && <div className="err-text">{errorText(t, save.error ?? del.error)}</div>}
    </Modal>
  );
}

function Runs({ name, onClose }: { name: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const runs = useQuery({ queryKey: ["admin", "runs", name], queryFn: () => api.get<List<Run>>(`/admin/api/v1/service-agents/${name}/runs?limit=50`) });
  return (
    <Modal wide title={t("admin.service-agents.runsOf", { name })} onClose={onClose}>
      {runs.data?.items.length === 0 && <div className="muted">{t("admin.service-agents.noRuns")}</div>}
      <table className="t">
        <tbody>
          {runs.data?.items.map((r) => (
            <tr key={r.id}>
              <td className="small">{dateTime(r.startedAt, intlLocale(i18n.language))}</td>
              <td>{r.clientName}{r.initiator && <div className="small muted">{r.initiator}</div>}</td>
              <td><span className={r.status === "succeeded" ? "ok-t" : r.status === "failed" ? "err-t" : "muted"}>{t(`admin.service-agents.status.${r.status}`, { defaultValue: r.status })}</span></td>
              <td className="small t2">{r.errorText ?? r.summary?.slice(0, 160) ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
