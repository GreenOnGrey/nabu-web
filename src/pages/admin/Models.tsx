import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { adminPath } from "./paths";
import { Icon, Modal, Switch, useToast } from "@green-on-grey/ui-kit";
import { api, ApiError } from "../../api/client";
import { adminKeys, useModelConnections } from "../../api/queries";
import type { CapsPatch, CheckResult, Choice, ConnectionType, ModelConnection, ModelConnectionList, ModelDef, ModelRef, PersonalModels } from "../../api/types";
import { errorText } from "../../lib/errors";
import { dateTime } from "../../lib/format";
import { intlLocale } from "../../lib/i18n";
import { llmErrorText } from "../../lib/llm";
import { choiceKey, modelIds, usableModel } from "../../lib/models";
import { ModelCaps } from "./ModelCaps";

const TYPES: ConnectionType[] = ["deepseek", "gigachat", "zai", "openai_compatible"];

/** Model connections (R19, R21; FTR.NAB.CHAT-0001 R7–R15, design §3.4): the
 * type, the key, the models with their capabilities, the check with probes,
 * the refresh of the list; the default and available models of personal agents. */
export function ModelsAdmin() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [keyFor, setKeyFor] = useState<ModelConnection | null>(null);
  const [modelsFor, setModelsFor] = useState<ModelConnection | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const conns = useModelConnections();
  const inv = () => qc.invalidateQueries({ queryKey: adminKeys.connections });
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const check = useMutation({
    mutationFn: (id: string) => api.post<CheckResult>(`/admin/api/v1/model-connections/${id}/check`),
    onSuccess: (r, id) => { setChecks((c) => ({ ...c, [id]: r })); inv(); },
    onError: fail,
  });
  const refresh = useMutation({
    mutationFn: (id: string) => api.post<ModelConnection>(`/admin/api/v1/model-connections/${id}/refresh`),
    onSuccess: inv,
    onError: fail,
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/admin/api/v1/model-connections/${id}`, body),
    onSuccess: inv,
    onError: fail,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/api/v1/model-connections/${id}`),
    onSuccess: inv,
    onError: fail,
  });
  // R9: a capability the probe did not confirm is switched off by the administrator
  const switchOff = (c: ModelConnection, model: string, cap: string) =>
    patch.mutate({ id: c.id, body: { models: c.models.map((m): ModelRef => (m.id === model ? { id: m.id, overrides: { [cap]: false } } : { id: m.id })) } });
  const addNew = (c: ModelConnection, id: string) =>
    patch.mutate({ id: c.id, body: { models: [...c.models.map((m) => m.id), id] } });
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
            {c.newCount > 0 && <span className="pchip">{t("admin.models.newCount", { count: c.newCount })}</span>}
            <span className="spacer" />
            <Switch on={c.enabled} onChange={(v) => patch.mutate({ id: c.id, body: { enabled: v } })} label={t("admin.models.enabled")} />
          </div>
          <div className="small t2">
            {c.baseUrl} · {t("admin.models.key")} …{c.keyLast4}
            {c.options.scope && <> · {c.options.scope}</>}
            {c.refreshedAt && <> · {t("admin.models.refreshedAt", { when: dateTime(c.refreshedAt, intlLocale(i18n.language)) })}</>}
          </div>
          <ModelRows conn={c} check={checks[c.id]} onSwitchOff={(m, cap) => switchOff(c, m, cap)} />
          {c.discovered.length > 0 && (
            <div className="model-new">
              {c.discovered.map((n) => (
                <span key={n.id} className="row" style={{ gap: 6 }}>
                  <span className="pchip">{t("admin.models.new")}</span><span className="mono small">{n.id}</span>
                  <button className="btn sm ghost" onClick={() => addNew(c, n.id)}><Icon name="plus" size={14} />{t("admin.models.addModel")}</button>
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn sm" disabled={check.isPending} onClick={() => check.mutate(c.id)}><Icon name="play" size={14} />{t("admin.models.check")}</button>
            <button className="btn sm" disabled={refresh.isPending} onClick={() => refresh.mutate(c.id)}><Icon name="refresh" size={14} />{t("admin.models.refresh")}</button>
            <button className="btn sm" onClick={() => setKeyFor(c)}>{t("admin.models.replaceKey")}</button>
            <button className="btn sm" onClick={() => setModelsFor(c)}>{t("admin.models.editModels")}</button>
            <button className="btn sm danger" onClick={() => del.mutate(c.id)}>{t("common.delete")}</button>
          </div>
        </div>
      ))}
      {conns.data && <PersonalModelsBlock conns={conns.data.items} />}
      {adding && conns.data && <AddConnection types={conns.data.types} onClose={() => setAdding(false)} />}
      {keyFor && <ReplaceKey conn={keyFor} onClose={() => setKeyFor(null)} />}
      {modelsFor && <EditModels conn={modelsFor} onClose={() => setModelsFor(null)} />}
    </>
  );
}

const price = (m: ModelDef) => (m.cost && (m.cost.input || m.cost.output) ? `${m.cost.input} / ${m.cost.output}` : "—");

/** The models of a connection with the results of the last check. */
function ModelRows({ conn, check, onSwitchOff }: { conn: ModelConnection; check?: CheckResult; onSwitchOff: (model: string, cap: string) => void }) {
  const { t } = useTranslation();
  const result = (id: string) => check?.results.find((r) => r.model === id);
  return (
    <table className="t models-t">
      <tbody>
        {conn.models.map((m) => {
          const r = result(m.id);
          return (
            <tr key={m.id}>
              <td className="mt-model"><b>{m.name || m.id}</b><div className="mono small muted mt-id">{m.id}{m.aliases?.length ? ` · ${m.aliases.join(", ")}` : ""}</div></td>
              <td><ModelCaps m={m} /></td>
              <td className="small muted">{price(m)}</td>
              <td className="small">
                {r && (r.ok ? <span className="ok-t"><Icon name="check" size={13} /> {r.embeddings ? t("admin.models.embeddingsModel") : t("admin.models.latency", { ms: r.latencyMs ?? 0 })}</span>
                  : <span className="err-t"><Icon name="alert" size={13} /> {llmErrorText(t, r.errorClass ?? "bad_request")}</span>)}
                {r?.caps && Object.entries(r.caps).filter(([, v]) => v !== "skipped").map(([cap, v]) => (
                  <div key={cap}>
                    {t(`admin.models.probe.${cap}`)}: {v === "confirmed" ? <span className="ok-t">{t("admin.models.confirmed")}</span>
                      : <><span className="warn-t">{t("models.unconfirmed")}</span> <button className="textbtn" onClick={() => onSwitchOff(m.id, cap)}>{t("admin.models.switchOff")}</button></>}
                  </div>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The editable table of models: a tick, the capabilities, an unfolding row
 * with the sources and the manual edits (design §3.4). */
function ModelTable({ models, picked, edits, onToggle, onEdit }: {
  models: ModelDef[];
  picked: Set<string>;
  edits: Record<string, CapsPatch>;
  onToggle: (id: string) => void;
  onEdit: (id: string, p: CapsPatch) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = models.filter((m) => !q || (m.name ?? m.id).toLowerCase().includes(q.toLowerCase()) || m.id.toLowerCase().includes(q.toLowerCase()));
  // design §3.4: a field the administrator changed is «manual» with «Reset»
  const manual = (m: ModelDef, f: keyof CapsPatch) => {
    const e = edits[m.id] ?? {};
    if (f in e) return true;
    return (m.overrides ?? []).includes(f) && !(e.reset ?? []).includes(f);
  };
  const reset = (m: ModelDef, f: keyof CapsPatch) => {
    const rest: CapsPatch = { ...edits[m.id] };
    delete rest[f];
    onEdit(m.id, (m.overrides ?? []).includes(f) ? { ...rest, reset: [...new Set([...(rest.reset ?? []), f])] } : rest);
  };
  const src = (m: ModelDef, f: keyof CapsPatch) => (
    <div className="src">
      {t(`models.src.${manual(m, f) ? "manual" : (m.sources?.[f] ?? "default")}`)}
      {manual(m, f) && <> · <button className="textbtn" onClick={() => reset(m, f)}>{t("admin.models.resetField")}</button></>}
    </div>
  );
  return (
    <>
      {models.length > 8 && <input className="inp" style={{ marginBottom: 8 }} placeholder={t("common.search")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />}
      <table className="t models-t models-edit">
        <tbody>
          {shown.map((m) => {
            const e = edits[m.id] ?? {};
            const disabled = !usableModel(m) && !m.embeddings && !picked.has(m.id);
            return (
              <Fragment key={m.id}>
                <tr>
                  <td className="mt-tick"><input type="checkbox" checked={picked.has(m.id)} disabled={disabled} onChange={() => onToggle(m.id)} aria-label={m.id} /></td>
                  {/* the name, the id and the capabilities in one cell: the dialog is narrow */}
                  <td className="mt-model"><b>{m.name || m.id}</b><div className="mono small muted mt-id" title={m.id}>{m.id}</div><ModelCaps m={m} /></td>
                  <td className="small muted mt-price">{price(m)}</td>
                  <td className="mt-fold"><button className="textbtn" aria-expanded={open === m.id} aria-label={t(open === m.id ? "admin.models.fold" : "admin.models.unfold", { model: m.name || m.id })}
                    onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? "▴" : "▾"}</button></td>
                </tr>
                {open === m.id && (
                  <tr className="xp">
                    <td />
                    <td colSpan={3}>
                      <div className="caps-grid">
                        {(["image", "tools", "reasoning"] as const).map((f) => {
                          const cur = f === "image" ? m.input?.includes("image") : f === "tools" ? m.tools !== false : m.reasoning;
                          const v = e[f] ?? cur;
                          return (
                            <div key={f}>
                              {/* the caption is the label of the switch: it is not repeated beside it */}
                              <label className="cap-sw"><span className="small muted">{t(`admin.models.cap.${f}`)}</span>
                                <Switch on={!!v} onChange={(x) => onEdit(m.id, { ...e, [f]: x })} /></label>
                              {src(m, f)}
                            </div>
                          );
                        })}
                        {(["contextWindow", "maxTokens"] as const).map((f) => (
                          <div key={f}>
                            <div className="small muted cap-lab">{t(`admin.models.cap.${f}`)}</div>
                            <input className="inp cap-num" type="number" min={0} value={e[f] ?? m[f]} aria-label={t(`admin.models.cap.${f}`)}
                              onChange={(ev) => onEdit(m.id, { ...e, [f]: Number(ev.target.value) })} />
                            {src(m, f)}
                          </div>
                        ))}
                        <div>
                          <div className="small muted cap-lab">{t("admin.models.cap.cost")}</div>
                          <div className="caps-cost">
                            {(["input", "output"] as const).map((k) => (
                              <input key={k} className="inp cap-num" type="number" min={0} step="0.001" aria-label={t(`admin.models.cap.cost_${k}`)}
                                value={(e.cost ?? m.cost)?.[k] ?? 0}
                                onChange={(ev) => onEdit(m.id, { ...e, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ...(e.cost ?? m.cost), [k]: Number(ev.target.value) } })} />
                            ))}
                          </div>
                          {src(m, "cost")}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function refsOf(ids: string[], edits: Record<string, CapsPatch>): ModelRef[] {
  return ids.map((id) => (edits[id] && Object.keys(edits[id]).length ? { id, overrides: edits[id] } : { id }));
}

function AddConnection({ types, onClose }: { types: ModelConnectionList["types"]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [type, setType] = useState<ConnectionType>("deepseek");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [scope, setScope] = useState("GIGACHAT_API_CORP");
  const [endpoint, setEndpoint] = useState("general");
  const [manual, setManual] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, CapsPatch>>({});
  const preset = types.find((x) => x.type === type);
  const options = type === "gigachat" ? { scope } : type === "zai" ? { endpoint } : {};
  const ids = modelIds(picked, manual);
  const body = () => ({ type, name, baseUrl: type === "openai_compatible" ? baseUrl : baseUrl || preset?.baseUrl || "", apiKey, options,
    models: refsOf(ids, edits) });
  const discover = useMutation({
    mutationFn: () => api.post<{ listed: boolean; models: ModelDef[] }>("/admin/api/v1/model-connections/discover", body()),
    onSuccess: (d) => setPicked(new Set(d.models.filter(usableModel).map((m) => m.id))),
  });
  // R7: the presets load their models once the key is typed
  const auto = type !== "openai_compatible" && apiKey.length >= 8;
  const discoverNow = discover.mutate;
  // the key, the type and the options trigger a new discovery
  useEffect(() => {
    if (!auto) return;
    const h = window.setTimeout(() => discoverNow(), 600);
    return () => window.clearTimeout(h);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the key, the type and the options are the triggers
  }, [auto, apiKey, type, scope, endpoint, discoverNow]);
  const draft = useMutation({ mutationFn: () => api.post<CheckResult>("/admin/api/v1/model-connections/check", body()) });
  const create = useMutation({
    mutationFn: () => api.post("/admin/api/v1/model-connections", body()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: adminKeys.connections }); onClose(); },
  });
  const toggle = (id: string) => setPicked((cur) => { const next = new Set(cur); if (!next.delete(id)) next.add(id); return next; });
  // design §3.4: a key the provider refused is a red line under the field
  const keyRefused = (discover.error ?? draft.error) instanceof ApiError && ((discover.error ?? draft.error) as ApiError).code === "invalid_key";
  const choose = (x: ConnectionType) => { setType(x); setPicked(new Set()); setEdits({}); discover.reset(); };
  return (
    <Modal title={t("admin.models.add")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn" disabled={!apiKey || ids.length === 0 || draft.isPending} onClick={() => draft.mutate()}>{t("admin.models.check")}</button>
      <button className="btn primary" disabled={!apiKey || ids.length === 0 || create.isPending} onClick={() => create.mutate()}>{t("common.save")}</button>
    </>}>
      <div className="field"><label>{t("admin.models.type")}</label>
        <div className="type-tiles">
          {TYPES.filter((x) => types.some((y) => y.type === x)).map((x) => (
            <button key={x} type="button" className={`type-tile${type === x ? " on" : ""}`} aria-pressed={type === x} onClick={() => choose(x)}>{t(`admin.models.types.${x}`)}</button>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="c-name">{t("admin.models.name")}</label>
          <input id="c-name" className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={t(`admin.models.types.${type}`)} /></div>
        <div className="field"><label htmlFor="c-key">{t(type === "gigachat" ? "admin.models.authKey" : "admin.models.key")}</label>
          <input id="c-key" type="password" autoComplete="off" className="inp" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            aria-invalid={keyRefused} aria-describedby={keyRefused ? "c-key-err" : undefined} />
          {keyRefused && <div id="c-key-err" className="err-text">{errorText(t, discover.error ?? draft.error)}</div>}</div>
        {type === "gigachat" && (
          <div className="field"><label htmlFor="c-scope">{t("admin.models.scope")}</label>
            <select id="c-scope" className="inp" value={scope} onChange={(e) => setScope(e.target.value)}>
              {(preset?.scopes ?? ["GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"]).map((s) => <option key={s} value={s}>{t(`admin.models.scopes.${s}`)}</option>)}
            </select></div>
        )}
        {type === "zai" && (
          <div className="field"><label htmlFor="c-ep">{t("admin.models.endpoint")}</label>
            <select id="c-ep" className="inp" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
              <option value="general">{t("admin.models.endpoints.general")}</option>
              <option value="coding">{t("admin.models.endpoints.coding")}</option>
            </select></div>
        )}
        {type === "openai_compatible" && (
          <div className="field"><label htmlFor="c-url">{t("admin.models.baseUrl")}</label>
            <input id="c-url" className="inp" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://litellm:4000/v1" /></div>
        )}
      </div>
      <div className="field">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label>{t("admin.models.models")}{discover.data && <span className="muted"> · {t("admin.models.picked", { picked: picked.size, total: discover.data.models.length })}</span>}</label>
          {type === "openai_compatible" && (
            <button className="btn sm" disabled={!apiKey || !baseUrl || discover.isPending} onClick={() => discover.mutate()}><Icon name="download" size={14} />{t("admin.models.load")}</button>
          )}
        </div>
        {discover.isPending && <div className="skeleton-rows" aria-hidden="true"><i /><i /><i /></div>}
        {discover.data && !discover.data.listed && <div className="hintbox small">{t("admin.models.noList")}</div>}
        {discover.data && <ModelTable models={discover.data.models} picked={picked} edits={edits} onToggle={toggle}
          onEdit={(id, p) => setEdits((x) => ({ ...x, [id]: p }))} />}
        <input className="inp" style={{ marginTop: 8 }} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("admin.models.addManually")} aria-label={t("admin.models.addManually")} />
        <div className="hint">{t("admin.models.newHint")}</div>
      </div>
      {draft.data && draft.data.results.map((r) => (
        <div key={r.model} className="small">{r.ok ? <span className="ok-t"><Icon name="check" size={13} /></span> : <span className="err-t"><Icon name="alert" size={13} /></span>} <span className="mono">{r.model}</span> {r.ok ? (r.embeddings ? t("admin.models.embeddingsModel") : "") : llmErrorText(t, r.errorClass ?? "bad_request")}</div>
      ))}
      {!keyRefused && (discover.error || draft.error || create.error) && <div className="err-text">{errorText(t, discover.error ?? draft.error ?? create.error)}</div>}
    </Modal>
  );
}

function ReplaceKey({ conn, onClose }: { conn: ModelConnection; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const save = useMutation({
    mutationFn: () => api.put(`/admin/api/v1/model-connections/${conn.id}/key`, { apiKey: key }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: adminKeys.connections }); onClose(); },
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

/** The models of an existing connection: its models and the new ones of the
 * provider, with the edits of their capabilities. */
function EditModels({ conn, onClose }: { conn: ModelConnection; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [picked, setPicked] = useState(() => new Set(conn.models.map((m) => m.id)));
  const [edits, setEdits] = useState<Record<string, CapsPatch>>({});
  const [manual, setManual] = useState("");
  const all: ModelDef[] = [...conn.models, ...conn.discovered.map((n): ModelDef => ({ id: n.id, name: n.name, contextWindow: 0, maxTokens: 0, reasoning: false }))];
  const ids = modelIds(all.filter((m) => picked.has(m.id)).map((m) => m.id), manual);
  const save = useMutation({
    mutationFn: () => api.patch(`/admin/api/v1/model-connections/${conn.id}`, { models: refsOf(ids, edits) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); onClose(); },
  });
  const toggle = (id: string) => setPicked((cur) => { const next = new Set(cur); if (!next.delete(id)) next.add(id); return next; });
  return (
    <Modal wide title={`${t("admin.models.editModels")} — ${conn.name}`} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!ids.length || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      <ModelTable models={all} picked={picked} edits={edits} onToggle={toggle} onEdit={(id, p) => setEdits((x) => ({ ...x, [id]: p }))} />
      <input className="inp" style={{ marginTop: 8 }} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("admin.models.addManually")} aria-label={t("admin.models.addManually")} />
      <div className="hint">{t("admin.models.editModelsHint")}</div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

/** The default and the selectable models of personal agents (R19): only
 * models an agent can run on (FTR.NAB.CHAT-0001 R8). */
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
  const all: Choice[] = conns.flatMap((c) => c.models.filter(usableModel).map((m) => ({ connectionId: c.id, model: m.id })));
  const label = (c: Choice) => `${conns.find((x) => x.id === c.connectionId)?.name ?? c.connectionId} · ${c.model}`;
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
          <select id="pm-def" className="inp" value={cur.default ? choiceKey(cur.default) : ""}
            onChange={(e) => {
              const pickedModel = all.find((c) => choiceKey(c) === e.target.value);
              save.mutate({ ...cur, default: pickedModel ? { ...pickedModel, thinking: "off" } : null });
            }}>
            <option value="">—</option>
            {all.map((c) => <option key={choiceKey(c)} value={choiceKey(c)}>{label(c)}</option>)}
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
      {/* FTR.NAB.CMN-0007 R2: the models users may choose are granted to groups */}
      <div className="lab small muted" style={{ marginBottom: 6 }}>{t("admin.models.available")}</div>
      <div className="chips">{cur.available.map((c) => <span key={choiceKey(c)} className="chip">{label(c)}</span>)}</div>
      <div className="hint">{t("admin.models.availableByGroups")} <Link to={adminPath("groups")}>{t("admin.channels.configureInGroups")}</Link></div>
    </div>
  );
}
