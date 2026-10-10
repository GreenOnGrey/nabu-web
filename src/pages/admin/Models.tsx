import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { CheckResult, Choice, ModelConnection, ModelDef, PersonalModels } from "../../api/types";
import { errorText } from "../../lib/errors";
import { llmErrorText } from "../../lib/llm";
import { Icon } from "../../components/Icon";
import { Modal, Switch, useToast } from "../../components/ui";

interface ConnList {
  items: ModelConnection[];
  types: { type: string; baseUrl?: string; models?: ModelDef[] }[];
}

/** Model connections (R19, R21; FTR.HMR.CMN-0004): type, key,
 * models, check, state; the default and available models of personal agents. */
export function ModelsAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [keyFor, setKeyFor] = useState<ModelConnection | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const conns = useQuery({ queryKey: ["admin", "connections"], queryFn: () => api.get<ConnList>("/admin/api/v1/model-connections") });
  const inv = () => qc.invalidateQueries({ queryKey: ["admin", "connections"] });
  const check = useMutation({
    mutationFn: (id: string) => api.post<CheckResult>(`/admin/api/v1/model-connections/${id}/check`),
    onSuccess: (r, id) => { setChecks((c) => ({ ...c, [id]: r })); inv(); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const patch = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.patch(`/admin/api/v1/model-connections/${id}`, { enabled }),
    onSuccess: inv,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/api/v1/model-connections/${id}`),
    onSuccess: inv,
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("admin.models.title")}</h2>
        <button className="btn primary sm" onClick={() => setAdding(true)}><Icon name="plus" size={15} />{t("admin.models.add")}</button>
      </div>
      <p className="t2">{t("admin.models.lead")}</p>
      {conns.data?.items.map((c) => (
        <div className="svc" key={c.id}>
          <div className="h">
            <Icon name="cpu" /><b>{c.name}</b>
            <span className="mode">{t(`admin.models.types.${c.type}`)}</span>
            <span className={`st ${c.status === "ok" ? "ok" : c.status === "unchecked" ? "draft" : c.status === "disabled" ? "none" : "review"}`}>
              {t(`admin.models.status.${c.status}`, { defaultValue: llmErrorText(t, c.status) })}
            </span>
            <span className="spacer" />
            <Switch on={c.enabled} onChange={(v) => patch.mutate({ id: c.id, enabled: v })} label={t("admin.models.enabled")} />
          </div>
          <div className="small t2">{c.baseUrl} · {t("admin.models.key")} …{c.keyLast4}</div>
          <div className="chips" style={{ margin: "8px 0" }}>{c.models.map((m) => <span key={m.id} className="chip mono">{m.id}</span>)}</div>
          {checks[c.id] && (
            <div className="small" style={{ marginBottom: 8 }}>
              {checks[c.id].results.map((r) => (
                <div key={r.model}>{r.ok ? <span className="ok-t">✓</span> : <span className="err-t">✗</span>} <span className="mono">{r.model}</span>{" "}
                  {r.ok ? `${r.latencyMs ?? ""} ms` : llmErrorText(t, r.errorClass ?? "bad_request")}</div>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" disabled={check.isPending} onClick={() => check.mutate(c.id)}><Icon name="play" size={14} />{t("admin.models.check")}</button>
            <button className="btn sm" onClick={() => setKeyFor(c)}>{t("admin.models.replaceKey")}</button>
            <button className="btn sm danger" onClick={() => del.mutate(c.id)}>{t("common.delete")}</button>
          </div>
        </div>
      ))}
      {conns.data && <PersonalModelsBlock conns={conns.data.items} />}
      {adding && conns.data && <AddConnection types={conns.data.types} onClose={() => setAdding(false)} />}
      {keyFor && <ReplaceKey conn={keyFor} onClose={() => setKeyFor(null)} />}
    </>
  );
}

function AddConnection({ types, onClose }: { types: ConnList["types"]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [type, setType] = useState("deepseek");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState("");
  const preset = types.find((x) => x.type === type);
  const body = () => ({ type, name, baseUrl: baseUrl || preset?.baseUrl || "", apiKey,
    models: type === "deepseek" ? [] : models.split(/[\s,]+/).filter(Boolean) });
  const draft = useMutation({ mutationFn: () => api.post<CheckResult>("/admin/api/v1/model-connections/check", body()) });
  const create = useMutation({
    mutationFn: () => api.post("/admin/api/v1/model-connections", body()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "connections"] }); onClose(); },
  });
  return (
    <Modal title={t("admin.models.add")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn" disabled={!apiKey || draft.isPending} onClick={() => draft.mutate()}>{t("admin.models.check")}</button>
      <button className="btn primary" disabled={!apiKey || create.isPending} onClick={() => create.mutate()}>{t("common.save")}</button>
    </>}>
      <div className="field"><label>{t("admin.models.type")}</label>
        <div className="mini-seg" style={{ display: "inline-flex" }}>
          {types.map((x) => <button key={x.type} className={type === x.type ? "on" : ""} onClick={() => setType(x.type)}>{t(`admin.models.types.${x.type}`)}</button>)}
        </div>
      </div>
      <div className="field"><label htmlFor="c-name">{t("admin.models.name")}</label><input id="c-name" className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "deepseek" ? "DeepSeek" : "LiteLLM"} /></div>
      <div className="field"><label htmlFor="c-url">{t("admin.models.baseUrl")}</label><input id="c-url" className="inp" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={preset?.baseUrl ?? "http://litellm:4000/v1"} /></div>
      <div className="field"><label htmlFor="c-key">{t("admin.models.key")}</label><input id="c-key" type="password" autoComplete="off" className="inp" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
      {type !== "deepseek" && (
        <div className="field"><label htmlFor="c-models">{t("admin.models.models")}</label><input id="c-models" className="inp" value={models} onChange={(e) => setModels(e.target.value)} placeholder="gpt-4.1, claude-sonnet" />
          <div className="hint">{t("admin.models.modelsHint")}</div></div>
      )}
      {draft.data && draft.data.results.map((r) => (
        <div key={r.model} className="small">{r.ok ? <span className="ok-t">✓</span> : <span className="err-t">✗</span>} <span className="mono">{r.model}</span> {r.ok ? "" : llmErrorText(t, r.errorClass ?? "bad_request")}</div>
      ))}
      {(draft.error || create.error) && <div className="err-text">{errorText(t, draft.error ?? create.error)}</div>}
    </Modal>
  );
}

function ReplaceKey({ conn, onClose }: { conn: ModelConnection; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const save = useMutation({
    mutationFn: () => api.put(`/admin/api/v1/model-connections/${conn.id}/key`, { apiKey: key }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "connections"] }); onClose(); },
  });
  return (
    <Modal title={t("admin.models.replaceKey")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={key.length < 8 || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      <input type="password" autoComplete="off" className="inp" value={key} onChange={(e) => setKey(e.target.value)} aria-label={t("admin.models.key")} />
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

const same = (a: Choice | null, b: Choice) => !!a && a.connectionId === b.connectionId && a.model === b.model;

/** The default and the selectable models of personal agents (R19). */
function PersonalModelsBlock({ conns }: { conns: ModelConnection[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const pm = useQuery({ queryKey: ["admin", "personal-models"], queryFn: () => api.get<PersonalModels>("/admin/api/v1/personal-models") });
  const save = useMutation({
    mutationFn: (v: PersonalModels) => api.put<PersonalModels>("/admin/api/v1/personal-models", { ...v }),
    onSuccess: (v) => qc.setQueryData(["admin", "personal-models"], v),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const all: Choice[] = conns.flatMap((c) => c.models.map((m) => ({ connectionId: c.id, model: m.id })));
  const label = (c: Choice) => `${conns.find((x) => x.id === c.connectionId)?.name ?? "?"} · ${c.model}`;
  if (!pm.data) return null;
  const cur = pm.data;
  const defModel = conns.find((c) => c.id === cur.default?.connectionId)?.models.find((m) => m.id === cur.default?.model);
  const levels = defModel?.reasoning ? ["off", ...Object.entries(defModel.thinkingLevelMap ?? {}).filter(([, v]) => v).map(([k]) => k)] : ["off"];
  return (
    <div className="svc" style={{ marginTop: 18 }}>
      <div className="h"><Icon name="users" /><b>{t("admin.models.personal")}</b></div>
      <div className="small t2" style={{ marginBottom: 10 }}>{t("admin.models.personalHint")}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="pm-def">{t("admin.models.default")}</label>
          <select id="pm-def" className="inp" value={cur.default ? `${cur.default.connectionId}|${cur.default.model}` : ""}
            onChange={(e) => {
              const [connectionId, model] = e.target.value.split("|");
              save.mutate({ ...cur, default: e.target.value ? { connectionId, model, thinking: "off" } : null });
            }}>
            <option value="">—</option>
            {all.map((c) => <option key={`${c.connectionId}|${c.model}`} value={`${c.connectionId}|${c.model}`}>{label(c)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pm-th">{t("admin.models.thinking")}</label>
          <select id="pm-th" className="inp" disabled={!cur.default} value={cur.default?.thinking ?? "off"}
            onChange={(e) => cur.default && save.mutate({ ...cur, default: { ...cur.default, thinking: e.target.value } })}>
            {levels.map((l) => <option key={l} value={l}>{t(`admin.models.levels.${l}`, { defaultValue: l })}</option>)}
          </select>
        </div>
      </div>
      <div className="lab small muted" style={{ marginBottom: 6 }}>{t("admin.models.available")}</div>
      <div className="chips">
        {all.map((c) => {
          const on = cur.available.some((a) => same(a, c));
          return (
            <button key={`${c.connectionId}|${c.model}`} className={`chip${on ? " on" : ""}`} aria-pressed={on}
              onClick={() => save.mutate({ ...cur, available: on ? cur.available.filter((a) => !same(a, c)) : [...cur.available, c] })}>
              {label(c)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
