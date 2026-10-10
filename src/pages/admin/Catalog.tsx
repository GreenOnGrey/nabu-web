import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, request } from "../../api/client";
import type { AdminCatalogItem } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Icon } from "../../components/Icon";
import { Modal, Switch, useToast } from "../../components/ui";

/** The catalog of skills and MCP (R11–R14, design §3.11): source (URL, upload,
 * git), access mode, publication, check of MCP servers; items in development are marked. */
export function CatalogAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminCatalogItem | "mcp" | "skill" | null>(null);
  const list = useQuery({ queryKey: ["admin", "catalog"], queryFn: () => api.get<{ items: AdminCatalogItem[] }>("/admin/api/v1/catalog") });
  const inv = () => qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "check" | "sync" }) => api.post(`/admin/api/v1/catalog/${id}/${action}`),
    onSuccess: inv,
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const publish = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) => api.patch(`/admin/api/v1/catalog/${id}`, { published }),
    onSuccess: inv,
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("admin.catalog.title")}</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => setEditing("skill")}><Icon name="plus" size={15} />{t("admin.catalog.addSkill")}</button>
          <button className="btn primary sm" onClick={() => setEditing("mcp")}><Icon name="plus" size={15} />{t("admin.catalog.addMcp")}</button>
        </div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table className="t">
          <thead><tr><th>{t("admin.catalog.item")}</th><th>{t("admin.catalog.source")}</th><th>{t("admin.catalog.mode")}</th><th>{t("admin.catalog.state")}</th><th>{t("admin.catalog.published")}</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((it) => (
              <tr key={it.id}>
                <td><b>{it.title || it.name}</b> <span className="mono small muted">{it.name}</span>
                  {it.inDevelopment && <> <span className="mode dev">{t("connections.inDevelopment")}</span></>}
                  <div className="small muted">{it.type === "skill" ? t("admin.catalog.skills", { count: it.skills.length }) : t("admin.catalog.tools", { count: it.tools.length })}</div></td>
                <td className="small">{it.source.kind === "url" ? <span className="mono">{it.source.url}</span>
                  : it.source.kind === "git" ? <span className="mono">{it.source.repo}/{it.source.path}@{it.source.ref || "main"}</span>
                  : t("admin.catalog.upload")}</td>
                <td>{it.type === "mcp" ? (it.mode === "personal" ? <span className="mode p">{t("connections.personal")}</span>
                  : <span className="mode">{it.readOnly ? t("connections.platformRead") : t("connections.platform")}</span>) : <span className="mode">{t("connections.skill")}</span>}</td>
                <td><span className={`st ${it.status === "ok" ? "ok" : it.status === "error" ? "review" : "draft"}`} title={it.statusReason ?? ""}>{t(`admin.catalog.states.${it.status ?? "unchecked"}`, { defaultValue: it.status ?? "" })}</span></td>
                <td><Switch on={it.published} onChange={(v) => publish.mutate({ id: it.id, published: v })} /></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {it.type === "mcp" && <button className="btn sm" onClick={() => act.mutate({ id: it.id, action: "check" })}>{t("admin.catalog.check")}</button>}
                  {it.type === "skill" && it.source.kind === "git" && <button className="btn sm" onClick={() => act.mutate({ id: it.id, action: "sync" })}>{t("admin.catalog.sync")}</button>}{" "}
                  <button className="btn ghost sm" onClick={() => setEditing(it)}>{t("common.edit")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <EditItem item={typeof editing === "string" ? null : editing} type={typeof editing === "string" ? editing : editing.type} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditItem({ item, type, onClose }: { item: AdminCatalogItem | null; type: "mcp" | "skill"; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [srcKind, setSrcKind] = useState(item?.source.kind ?? (type === "mcp" ? "url" : "git"));
  const [url, setUrl] = useState(item?.source.url ?? "");
  const [repo, setRepo] = useState(item?.source.repo ?? "");
  const [path, setPath] = useState(item?.source.path ?? "agent/skills");
  const [ref, setRef] = useState(item?.source.ref ?? "main");
  const [mode, setMode] = useState<"personal" | "platform">(item?.mode ?? "personal");
  const [authKind, setAuthKind] = useState(item?.personalAuth?.kind ?? "oauth");
  const [authorizeUrl, setAuthorizeUrl] = useState(item?.personalAuth?.authorizeUrl ?? "");
  const [tokenUrl, setTokenUrl] = useState(item?.personalAuth?.tokenUrl ?? "");
  const [clientId, setClientId] = useState(item?.personalAuth?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState(item?.personalAuth?.scopes?.join(" ") ?? "");
  const [audience, setAudience] = useState(item?.personalAuth?.audience ?? "");
  const [headers, setHeaders] = useState<{ k: string; v: string }[]>(Object.keys(item?.platformAuth ?? {}).map((k) => ({ k, v: "" })));
  const [readOnly, setReadOnly] = useState(item?.readOnly ?? true);
  const [exposure, setExposure] = useState(item?.exposure ?? "deferred");
  const [inDev, setInDev] = useState(item?.inDevelopment ?? false);
  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { type, name, title, description, inDevelopment: inDev,
        source: srcKind === "url" ? { kind: "url", url } : srcKind === "git" ? { kind: "git", repo, path, ref } : { kind: "upload" } };
      if (type === "mcp") {
        Object.assign(body, { mode, readOnly, exposure });
        if (mode === "personal") body.personalAuth = { kind: authKind, authorizeUrl, tokenUrl, clientId, clientSecret, scopes: scopes.split(/\s+/).filter(Boolean), audience };
        else body.platformAuth = Object.fromEntries(headers.filter((h) => h.k.trim()).map((h) => [h.k.trim(), h.v]));
      }
      const saved = item ? await api.patch<AdminCatalogItem>(`/admin/api/v1/catalog/${item.id}`, body)
        : await api.post<AdminCatalogItem>("/admin/api/v1/catalog", body);
      const f = fileRef.current?.files?.[0];
      if (f && srcKind === "upload") await request("POST", `/admin/api/v1/catalog/${saved.id}/upload`, f);
      return saved;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "catalog"] }); onClose(); },
  });
  return (
    <Modal wide title={item ? item.title || item.name : type === "mcp" ? t("admin.catalog.addMcp") : t("admin.catalog.addSkill")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!name || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      <div className="form-grid">
        <div className="field"><label htmlFor="ci-name">{t("admin.catalog.name")}</label><input id="ci-name" className="inp mono" disabled={!!item} value={name} onChange={(e) => setName(e.target.value)} placeholder="jira" /></div>
        <div className="field"><label htmlFor="ci-title">{t("admin.catalog.titleField")}</label><input id="ci-title" className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Jira" /></div>
      </div>
      <div className="field"><label htmlFor="ci-desc">{t("admin.catalog.description")}</label><textarea id="ci-desc" className="inp" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      {type === "mcp" ? (
        <div className="field"><label htmlFor="ci-url">URL</label><input id="ci-url" className="inp mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.company.ru/jira" /></div>
      ) : (
        <>
          <div className="field"><label>{t("admin.catalog.source")}</label>
            <div className="mini-seg" style={{ display: "inline-flex" }}>
              {["git", "upload"].map((k) => <button key={k} className={srcKind === k ? "on" : ""} onClick={() => setSrcKind(k)}>{t(`admin.catalog.sources.${k}`)}</button>)}
            </div>
          </div>
          {srcKind === "git" ? (
            <div className="form-grid">
              <div className="field"><label htmlFor="ci-repo">{t("admin.catalog.repo")}</label><input id="ci-repo" className="inp mono" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="company/agent-skills" /></div>
              <div className="field"><label htmlFor="ci-path">{t("admin.catalog.path")}</label><input id="ci-path" className="inp mono" value={path} onChange={(e) => setPath(e.target.value)} /></div>
              <div className="field"><label htmlFor="ci-ref">{t("admin.catalog.ref")}</label><input id="ci-ref" className="inp mono" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
            </div>
          ) : (
            <div className="field"><label htmlFor="ci-file">{t("admin.catalog.bundle")}</label><input id="ci-file" ref={fileRef} type="file" accept=".tar.gz,.tgz,application/gzip" /></div>
          )}
          {item?.hookUrl && <div className="webhook">{t("admin.catalog.hook")}: {item.hookUrl}{"\n"}secret: {item.hookSecret}</div>}
        </>
      )}
      {type === "mcp" && (
        <>
          <div className="field"><label>{t("admin.catalog.mode")}</label>
            <div className="mini-seg" style={{ display: "inline-flex" }}>
              {(["personal", "platform"] as const).map((m) => <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{t(`connections.${m}`)}</button>)}
            </div>
            <div className="hint">{t(`admin.catalog.modeHint.${mode}`)}</div>
          </div>
          {mode === "personal" ? (
            <>
              <div className="field"><label>{t("admin.catalog.authKind")}</label>
                <div className="mini-seg" style={{ display: "inline-flex" }}>
                  {["oauth", "token", "delegation"].map((k) => <button key={k} className={authKind === k ? "on" : ""} onClick={() => { setAuthKind(k); if (!item && k === "delegation") setReadOnly(false); }}>{t(`admin.catalog.auth.${k}`)}</button>)}
                </div>
              </div>
              {authKind === "oauth" && (
                <div className="form-grid">
                  <div className="field"><label htmlFor="o-a">Authorize URL</label><input id="o-a" className="inp mono" value={authorizeUrl} onChange={(e) => setAuthorizeUrl(e.target.value)} /></div>
                  <div className="field"><label htmlFor="o-t">Token URL</label><input id="o-t" className="inp mono" value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} /></div>
                  <div className="field"><label htmlFor="o-c">Client ID</label><input id="o-c" className="inp mono" value={clientId} onChange={(e) => setClientId(e.target.value)} /></div>
                  <div className="field"><label htmlFor="o-s">Client secret</label><input id="o-s" type="password" autoComplete="off" className="inp" value={clientSecret} placeholder={item?.personalAuth?.hasSecret ? "••••••" : ""} onChange={(e) => setClientSecret(e.target.value)} /></div>
                  <div className="field"><label htmlFor="o-sc">Scopes</label><input id="o-sc" className="inp mono" value={scopes} onChange={(e) => setScopes(e.target.value)} /></div>
                </div>
              )}
              {authKind === "delegation" && (
                <div className="field"><label htmlFor="o-aud">{t("admin.catalog.audience")}</label><input id="o-aud" className="inp mono" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="product" />
                  <div className="hint">{t("admin.catalog.delegationHint")}</div></div>
              )}
              {item?.callbackUrl && <div className="webhook">{t("admin.catalog.callback")}: {item.callbackUrl}</div>}
            </>
          ) : (
            <div className="field"><label>{t("admin.catalog.headers")}</label>
              {headers.map((h, i) => (
                <div key={i} className="form-grid" style={{ marginBottom: 6 }}>
                  <input className="inp mono" value={h.k} placeholder="Authorization" onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
                  <input className="inp" type="password" autoComplete="off" value={h.v} placeholder={item?.platformAuth[h.k] ?? ""} onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
                </div>
              ))}
              <button className="btn ghost sm" onClick={() => setHeaders([...headers, { k: "", v: "" }])}><Icon name="plus" size={14} />{t("admin.catalog.addHeader")}</button>
              <div style={{ marginTop: 10 }}><Switch on={readOnly} onChange={setReadOnly} label={t("admin.catalog.readOnly")} /></div>
            </div>
          )}
          <div className="field"><label>{t("admin.catalog.exposure")}</label>
            <div className="mini-seg" style={{ display: "inline-flex" }}>
              {["deferred", "direct"].map((k) => <button key={k} className={exposure === k ? "on" : ""} onClick={() => setExposure(k)}>{t(`admin.catalog.exposures.${k}`)}</button>)}
            </div>
          </div>
        </>
      )}
      <Switch on={inDev} onChange={setInDev} label={t("connections.inDevelopment")} />
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}
