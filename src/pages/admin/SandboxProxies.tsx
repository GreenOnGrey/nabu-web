import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, Modal, useToast } from "@green-on-grey/ui-kit";
import { api, ApiError } from "../../api/client";
import { adminKeys, useProxies } from "../../api/queries";
import type { ProxyEnv, ProxyHost, ProxyRegistry, ProxyTemplates, SandboxProxy } from "../../api/types";
import { errorText } from "../../lib/errors";
import { adminPath } from "./paths";

// FTR.HMR.CMN-0007 R16, R19–R23, design §3.1–3.3: the proxies of sandboxes —
// what a sandbox may reach outside and the variables it gets.

const ECOSYSTEMS = ["go", "npm", "pypi"] as const;
const ecoName = (e: string) => ({ go: "Go", npm: "npm", pypi: "PyPI" })[e] ?? e;

/** "host:port"; the port only when it is not 443. */
export const hostLabel = (h: ProxyHost) => (h.port && h.port !== 443 ? `${h.host}:${h.port}` : h.host);

export function ProxiesTab() {
  const { t } = useTranslation();
  const q = useProxies();
  const [edit, setEdit] = useState<SandboxProxy | "new" | null>(null);
  const [inUse, setInUse] = useState<SandboxProxy | null>(null);
  if (q.isLoading) return <p className="muted">{t("common.loading")}</p>;
  if (q.isError || !q.data) return <div className="llmerr" role="alert"><span>{errorText(t, q.error)}</span><button className="btn sm" onClick={() => q.refetch()}>{t("llm.retry")}</button></div>;
  const items = q.data.items;
  return (
    <>
      <div className="nb-px-head">
        <span className="small t2">{t("admin.sandbox-images.proxies.lead")}</span>
        <button className="btn primary sm" onClick={() => setEdit("new")}><Icon name="plus" />{t("admin.sandbox-images.proxies.new")}</button>
      </div>
      {items.length === 0 && <p className="muted">{t("admin.sandbox-images.proxies.empty")}</p>}
      {items.map((p) => <ProxyCard key={p.name} p={p} onEdit={() => setEdit(p)} onInUse={() => setInUse(p)} />)}
      {edit && <ProxyModal proxy={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {inUse && (
        <Modal title={t("admin.sandbox-images.proxies.assignedTitle")} onClose={() => setInUse(null)}
          footer={<button className="btn primary" onClick={() => setInUse(null)}>{t("common.done")}</button>}>
          <ul>
            {inUse.assigned?.personal && <li>{t("admin.sandbox-images.assign.personal")}</li>}
            {inUse.assigned?.group && <li>{t("admin.sandbox-images.assign.group")}</li>}
            {inUse.assigned?.services.map((s) => <li key={s}><a href={adminPath("service-agents")}>{s}</a></li>)}
          </ul>
        </Modal>
      )}
    </>
  );
}

function ProxyCard({ p, onEdit, onInUse }: { p: SandboxProxy; onEdit: () => void; onInUse: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const path = `/admin/api/v1/proxies/${encodeURIComponent(p.name)}`;
  const done = () => qc.invalidateQueries({ queryKey: adminKeys.proxies });
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const check = useMutation({ mutationFn: () => api.post(`${path}/check`), onSuccess: done, onError: fail });
  const del = useMutation({
    mutationFn: () => api.del(path), onSuccess: done,
    onError: (e) => (e instanceof ApiError && e.code === "proxy_assigned" ? onInUse() : fail(e)),
  });
  const a = p.assigned;
  const given = [a?.personal && t("admin.sandbox-images.assign.personal"), a?.group && t("admin.sandbox-images.assign.group")].filter(Boolean) as string[];
  const remove = () => {
    if (a && (a.personal || a.group || a.services.length > 0)) return onInUse();
    if (window.confirm(t("admin.sandbox-images.proxies.deleteConfirm", { title: p.title }))) del.mutate();
  };
  return (
    <section className="nb-sbx-card">
      <div className="nb-sbx-card-h">
        <h3 className="nb-sbx-name">{p.title}</h3>
        <span className="mono small muted">{p.name}</span>
        <span className={`nb-sbx-kind${p.kind === "packages" ? " custom" : ""}`}>{t(`admin.sandbox-images.proxies.kind.${p.kind}`)}</span>
        <span className={`nb-sbx-pst nb-px-${p.state}`} title={p.checkedAt ?? undefined}>
          {p.state === "checking" && <span className="spin" aria-hidden="true" />}{t(`admin.sandbox-images.proxies.state.${p.state}`)}</span>
      </div>
      {p.state === "unreachable" && (
        <div className="llmerr" role="alert"><span>{p.checkError ?? ""}</span>
          <button className="btn sm" disabled={check.isPending} onClick={() => check.mutate()}>{t("admin.sandbox-images.proxies.recheck")}</button></div>
      )}
      {p.description && <>
        <div className="small t2">{t("admin.sandbox-images.proxies.description")}</div>
        <div className="small nb-px-desc">{p.description}</div>
      </>}
      <div className="small t2">{t("admin.sandbox-images.proxies.hosts")}</div>
      <div className="nb-sbx-assigned">
        {p.allow.map((h) => <span key={`${h.host}:${h.port}`} className="chip mono" title={h.internal ? t("admin.sandbox-images.proxies.internal") : undefined}>
          {h.internal && <Icon name="server" size={12} />}{hostLabel(h)}</span>)}
      </div>
      <div className="small t2">{t("admin.sandbox-images.proxies.env")}</div>
      <div className="nb-sbx-assigned">
        {p.env.map((e) => <span key={e.name} className="chip mono">{e.secret && <Icon name="lock" size={12} />}{e.name}</span>)}
        {p.env.length === 0 && <span className="small muted">{t("admin.sandbox-images.proxies.noEnv")}</span>}
      </div>
      <div className="small t2">{t("admin.sandbox-images.proxies.assigned")}</div>
      <div className="nb-sbx-assigned">
        {given.map((g) => <span key={g} className="chip">{g}</span>)}
        {a?.services.map((s) => <a key={s} className="chip" href={adminPath("service-agents")}>{s}</a>)}
        {given.length === 0 && !a?.services.length && <span className="small muted">{t("admin.sandbox-images.proxies.notAssigned")}</span>}
      </div>
      <div className="nb-sbx-card-actions">
        <button className="btn sm" onClick={onEdit}>{t("common.edit")}</button>
        <button className="btn ghost sm nb-sbx-del" disabled={del.isPending} onClick={remove}>{t("common.delete")}</button>
      </div>
    </section>
  );
}

/** Latin letters, digits and dashes from a title: the default name of a new proxy. */
export function slug(title: string): string {
  const tr: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  const s = [...title.toLowerCase()].map((c) => tr[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (/^[a-z]/.test(s) ? s : `p-${s}`).slice(0, 40).replace(/-+$/, "");
}

type Form = { name: string; title: string; description: string; kind: "packages" | "hosts"; ecosystems: string[];
  registries: ProxyRegistry[]; allow: ProxyHost[]; env: ProxyEnv[] };
type Rows = "registries" | "allow" | "env";

/** The body of POST or PUT …/proxies: rows without a host or a name are dropped. */
export function proxyBody(f: Form) {
  return {
    name: f.name, title: f.title.trim(), description: f.description.trim(), kind: f.kind,
    ...(f.kind === "packages"
      ? { ecosystems: f.ecosystems, registries: f.registries.filter((r) => r.url.trim()).map((r) => ({ ...r, url: r.url.trim(), token: r.token || undefined })) }
      : { allow: f.allow.filter((h) => h.host.trim()).map((h) => ({ ...h, host: h.host.trim(), port: h.port || 443 })),
          env: f.env.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), value: e.value || undefined, secret: e.secret })) }),
  };
}

function ProxyModal({ proxy, onClose }: { proxy: SandboxProxy | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: adminKeys.proxyTemplates, queryFn: () => api.get<ProxyTemplates>("/admin/api/v1/proxies/templates") });
  const [touched, setTouched] = useState(!!proxy);
  const [f, setF] = useState<Form>(() => proxy
    ? { name: proxy.name, title: proxy.title, description: proxy.description, kind: proxy.kind, ecosystems: proxy.ecosystems ?? [],
        registries: (proxy.registries ?? []).map((r) => ({ ...r, token: "" })), allow: proxy.allow, env: proxy.env.map((e) => ({ ...e, value: e.secret ? "" : e.value })) }
    : { name: "", title: "", description: "", kind: "packages", ecosystems: [...ECOSYSTEMS], registries: [], allow: [], env: [] });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  // a row of the registries, the addresses or the variables
  const patch = <K extends Rows>(k: K, i: number, p: Partial<Form[K][number]>) => set(k, f[k].map((x, j) => (j === i ? { ...x, ...p } : x)) as Form[K]);
  const drop = <K extends Rows>(k: K, i: number) => set(k, f[k].filter((_, j) => j !== i) as Form[K]);
  const save = useMutation({
    mutationFn: () => (proxy ? api.put(`/admin/api/v1/proxies/${encodeURIComponent(proxy.name)}`, proxyBody(f)) : api.post("/admin/api/v1/proxies", proxyBody(f))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: adminKeys.proxies }); onClose(); },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const errField = err?.details.field as string | undefined;
  const fieldErr = (field: string) => err && errField === field && <div className="err-text">{t(`admin.sandbox-images.proxies.err.${err.code}`, { defaultValue: errorText(t, err) })}</div>;
  const tpl = templates.data?.packages ?? {};
  const resultHosts = f.kind === "packages" ? [...f.ecosystems.flatMap((e) => tpl[e]?.hosts ?? []), ...f.registries.map((r) => hostOf(r.url)).filter(Boolean)] : [];
  const resultEnv = f.kind === "packages" ? [...f.ecosystems.flatMap((e) => tpl[e]?.env ?? []), ...f.registries.filter((r) => r.url).map((r) => registryEnv(r))] : [];
  return (
    <Modal wide title={proxy ? t("admin.sandbox-images.proxies.editTitle", { title: proxy.title }) : t("admin.sandbox-images.proxies.new")} onClose={onClose} footer={<>
      {proxy && <span className="small muted" style={{ marginRight: "auto" }}>{t("admin.sandbox-images.proxies.nextRun")}</span>}
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!f.title.trim() || !f.name || save.isPending} onClick={() => save.mutate()}>{t(proxy ? "common.save" : "common.create")}</button>
    </>}>
      <div className="form-grid">
        <div className="field"><label htmlFor="px-title">{t("admin.sandbox-images.proxies.title")}</label>
          <input id="px-title" className="inp" maxLength={60} value={f.title}
            onChange={(e) => setF((x) => ({ ...x, title: e.target.value, name: touched ? x.name : slug(e.target.value) }))} />{fieldErr("title")}</div>
        <div className="field"><label htmlFor="px-name">{t("admin.sandbox-images.proxies.name")}</label>
          <input id="px-name" className="inp mono" maxLength={40} value={f.name} readOnly={!!proxy}
            onChange={(e) => { setTouched(true); set("name", e.target.value.toLowerCase()); }} />
          {proxy && <div className="hint">{t("admin.sandbox-images.proxies.nameFixed")}</div>}{fieldErr("name")}</div>
      </div>
      <div className="field"><label htmlFor="px-desc">{t("admin.sandbox-images.proxies.description")}</label>
        <textarea id="px-desc" className="inp" rows={2} maxLength={500} value={f.description} onChange={(e) => set("description", e.target.value)} />
        <div className="hint">{t("admin.sandbox-images.proxies.descriptionHint")}</div></div>
      <div className="field"><label>{t("admin.sandbox-images.proxies.kindLabel")}</label>
        <div className="mini-seg" style={{ display: "inline-flex" }}>
          {(["packages", "hosts"] as const).map((k) => <button key={k} type="button" className={f.kind === k ? "on" : ""} disabled={!!proxy}
            onClick={() => set("kind", k)}>{t(`admin.sandbox-images.proxies.kind.${k}`)}</button>)}
        </div></div>
      {f.kind === "packages" ? (
        <>
          <div className="field"><label>{t("admin.sandbox-images.proxies.ecosystems")}</label>
            <div className="nb-px-eco">
              {ECOSYSTEMS.map((e) => (
                <label key={e}><input type="checkbox" checked={f.ecosystems.includes(e)}
                  onChange={(ev) => set("ecosystems", ev.target.checked ? [...f.ecosystems, e] : f.ecosystems.filter((x) => x !== e))} />
                  {" "}{ecoName(e)} <span className="mono small muted">{(tpl[e]?.hosts ?? []).join(", ")}</span></label>
              ))}
            </div></div>
          <div className="field"><label>{t("admin.sandbox-images.proxies.private")}</label>
            {f.registries.map((r, i) => (
              <div key={i}>
                <div className="nb-px-row nb-px-row4">
                  <select className="inp" aria-label={t("admin.sandbox-images.proxies.ecosystem")} value={r.ecosystem}
                    onChange={(e) => patch("registries", i, { ecosystem: e.target.value })}>
                    {ECOSYSTEMS.map((e) => <option key={e} value={e}>{ecoName(e)}</option>)}</select>
                  <input className="inp mono" placeholder="https://npm.company.local" aria-label={t("admin.sandbox-images.proxies.hosts")} value={r.url}
                    onChange={(e) => patch("registries", i, { url: e.target.value })} />
                  <label className="small"><input type="checkbox" checked={r.internal}
                    onChange={(e) => patch("registries", i, { internal: e.target.checked })} /> {t("admin.sandbox-images.proxies.internal")}</label>
                  <input className="inp mono" type="password" autoComplete="new-password" aria-label={t("admin.sandbox-images.proxies.token")}
                    placeholder={r.tokenSet ? `••••• ${t("admin.sandbox-images.proxies.tokenSet")}` : t("admin.sandbox-images.proxies.token")} value={r.token ?? ""}
                    disabled={r.ecosystem === "go"} onChange={(e) => patch("registries", i, { token: e.target.value })} />
                  <button type="button" className="btn ghost sm" aria-label={t("common.delete")} onClick={() => drop("registries", i)}><Icon name="x" /></button>
                </div>
                {fieldErr(`registries[${i}].url`)}{fieldErr(`registries[${i}].token`)}
              </div>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => set("registries", [...f.registries, { ecosystem: "npm", url: "", internal: true }])}>
              <Icon name="plus" />{t("admin.sandbox-images.proxies.addRegistry")}</button>
            {f.registries.some((r) => r.token || r.tokenSet) && <div className="hint nb-sbx-warn">{t("admin.sandbox-images.proxies.secretWarn")}</div>}
          </div>
          <div className="nb-sbx-req"><b>{t("admin.sandbox-images.proxies.result")}</b>
            <div className="mono small">{resultHosts.join(" ")}</div>
            <div className="mono small">{resultEnv.join(" ")}</div></div>
        </>
      ) : (
        <>
          <div className="field"><label>{t("admin.sandbox-images.proxies.hosts")}</label>
            {f.allow.map((h, i) => (
              <div key={i}>
                <div className="nb-px-row nb-px-row3">
                  <input className="inp mono" placeholder="docs.company.local" aria-label={t("admin.sandbox-images.proxies.hosts")} value={h.host}
                    onChange={(e) => patch("allow", i, { host: e.target.value })} />
                  <input className="inp mono" inputMode="numeric" placeholder="443" aria-label={t("admin.sandbox-images.proxies.port")} value={h.port || ""}
                    onChange={(e) => patch("allow", i, { port: Number(e.target.value) || 0 })} />
                  <label className="small"><input type="checkbox" checked={h.internal}
                    onChange={(e) => patch("allow", i, { internal: e.target.checked })} /> {t("admin.sandbox-images.proxies.internal")}</label>
                  <button type="button" className="btn ghost sm" aria-label={t("common.delete")} onClick={() => drop("allow", i)}><Icon name="x" /></button>
                </div>
                {fieldErr(`allow[${i}].host`)}{fieldErr(`allow[${i}].port`)}
              </div>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => set("allow", [...f.allow, { host: "", port: 443, internal: false }])}>
              <Icon name="plus" />{t("admin.sandbox-images.proxies.addHost")}</button>
            <div className="hint">{t("admin.sandbox-images.proxies.internalHint")}</div></div>
          <div className="field"><label>{t("admin.sandbox-images.proxies.env")}</label>
            {f.env.map((v, i) => (
              <div key={i}>
                <div className="nb-px-row nb-px-row3">
                  <input className="inp mono" placeholder="NAME" aria-label={t("admin.sandbox-images.proxies.envName")} value={v.name}
                    onChange={(e) => patch("env", i, { name: e.target.value.toUpperCase() })} />
                  <input className="inp mono" type={v.secret ? "password" : "text"} autoComplete="new-password" aria-label={t("admin.sandbox-images.proxies.envValue")}
                    placeholder={v.set ? `••••• ${t("admin.sandbox-images.proxies.tokenSet")}` : ""} value={v.value ?? ""}
                    onChange={(e) => patch("env", i, { value: e.target.value })} />
                  <label className="small"><input type="checkbox" checked={v.secret}
                    onChange={(e) => patch("env", i, { secret: e.target.checked })} /> {t("admin.sandbox-images.proxies.secret")}</label>
                  <button type="button" className="btn ghost sm" aria-label={t("common.delete")} onClick={() => drop("env", i)}><Icon name="x" /></button>
                </div>
                {fieldErr(`env[${i}].name`)}
              </div>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => set("env", [...f.env, { name: "", value: "", secret: false }])}>
              <Icon name="plus" />{t("admin.sandbox-images.proxies.addEnv")}</button>
            {f.env.some((v) => v.secret) && <div className="hint nb-sbx-warn">{t("admin.sandbox-images.proxies.secretWarn")}</div>}
          </div>
        </>
      )}
      {err && !errField && <div className="err-text">{t(`admin.sandbox-images.proxies.err.${err.code}`, { defaultValue: errorText(t, err) })}</div>}
    </Modal>
  );
}

function hostOf(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
}

/** The variable a private registry sets, as the api builds it (tech §3.2). */
function registryEnv(r: ProxyRegistry): string {
  switch (r.ecosystem) {
    case "go": return `GOPROXY=${r.url.replace(/\/$/, "")},https://proxy.golang.org`;
    case "npm": return `NPM_CONFIG_REGISTRY=${r.url.replace(/\/$/, "")}/${r.token || r.tokenSet ? " NPM_TOKEN=•••••" : ""}`;
    default: return `PIP_EXTRA_INDEX_URL=${r.token || r.tokenSet ? "•••••" : r.url}`;
  }
}

/** Chips of the proxies to give: the agent form and the assignment (R17, R24). */
export function ProxyChips({ selected, onChange, disabled }: { selected: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const q = useProxies();
  const items = q.data?.items ?? [];
  return (
    <div className="chips nb-px-chips">
      {items.map((p) => {
        const on = selected.includes(p.name);
        return (
          <button key={p.name} type="button" disabled={disabled} className={`chip${on ? " on" : ""}`} aria-pressed={on}
            title={p.state === "unreachable" ? t("admin.sandbox-images.proxies.state.unreachable") : p.description}
            onClick={() => onChange(on ? selected.filter((y) => y !== p.name) : [...selected, p.name])}>
            {p.state === "unreachable" && <span className="nb-px-down" aria-hidden="true" />}{p.title}
          </button>
        );
      })}
      {items.length === 0 && <span className="small muted">{t("admin.sandbox-images.noProxies")}</span>}
    </div>
  );
}
