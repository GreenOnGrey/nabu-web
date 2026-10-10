import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ServiceAgent, ServiceClient } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { dateTime } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { Modal, Switch, useToast } from "../../components/ui";

const inFuture = (iso: string) => new Date(iso).getTime() > Date.now();

/** Service clients (R17, R1a, design §3.9): the client and its address,
 * allowed service agents, delegation and import, credentials with reissue. */
export function ClientsAdmin() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<ServiceClient | null>(null);
  const list = useQuery({ queryKey: ["admin", "clients"], queryFn: () => api.get<{ items: ServiceClient[] }>("/admin/api/v1/clients") });
  const agents = useQuery({ queryKey: ["admin", "service-agents"], queryFn: () => api.get<{ items: ServiceAgent[] }>("/admin/api/v1/service-agents") });
  const inv = () => qc.invalidateQueries({ queryKey: ["admin", "clients"] });
  const patch = useMutation({
    mutationFn: ({ id, ...p }: Partial<ServiceClient> & { id: string }) => api.patch(`/admin/api/v1/clients/${id}`, p),
    onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ["admin", "service-agents"] }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const reissue = useMutation({
    mutationFn: (id: string) => api.post<ServiceClient>(`/admin/api/v1/clients/${id}/secret`),
    onSuccess: (c) => { setSecret(c); inv(); },
  });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("admin.clients.title")}</h2>
        <button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" size={15} />{t("admin.clients.add")}</button>
      </div>
      <div className="hintbox" style={{ marginTop: 14 }}><Icon name="shield" /><span>{t("admin.clients.auditHint")}</span></div>
      {list.data?.items.map((c) => (
        <div className="svc" key={c.id}>
          <div className="h">
            <Icon name="server" /><b>{c.name}</b>{c.url && <span className="small muted mono">{c.url}</span>}
            <span className="spacer" />
            <Switch on={c.enabled} onChange={(v) => patch.mutate({ id: c.id, enabled: v })} label={t("admin.clients.enabled")} />
          </div>
          <dl className="kv">
            <dt>client_id</dt><dd className="mono">{c.clientId}</dd>
            <dt>{t("admin.clients.agents")}</dt>
            <dd>
              <div className="chips">
                {(agents.data?.items ?? []).map((a) => {
                  const on = c.agents.includes(a.name);
                  return <button key={a.name} className={`chip mono${on ? " on" : ""}`} aria-pressed={on}
                    onClick={() => patch.mutate({ id: c.id, agents: on ? c.agents.filter((x) => x !== a.name) : [...c.agents, a.name] })}>{a.name}</button>;
                })}
              </div>
            </dd>
            <dt>{t("admin.clients.rights")}</dt>
            <dd className="row" style={{ gap: 16 }}>
              <Switch on={c.canDelegate} onChange={(v) => patch.mutate({ id: c.id, canDelegate: v })} label={t("admin.clients.delegate")} />
              <Switch on={c.canImport} onChange={(v) => patch.mutate({ id: c.id, canImport: v })} label={t("admin.clients.import")} />
              <Switch on={c.canArchive} onChange={(v) => patch.mutate({ id: c.id, canArchive: v })} label={<span className="mono">users:archive</span>} />
              <Switch on={c.canRestore} onChange={(v) => patch.mutate({ id: c.id, canRestore: v })} label={<span className="mono">users:restore</span>} />
            </dd>
            <dt>{t("admin.clients.secret")}</dt>
            <dd className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => reissue.mutate(c.id)}>{t("admin.clients.reissue")}</button>
              {c.prevSecretExpiresAt && inFuture(c.prevSecretExpiresAt) &&
                <span className="small warn-t">{t("admin.clients.oldValid", { until: dateTime(c.prevSecretExpiresAt, intlLocale(i18n.language)) })}</span>}
            </dd>
          </dl>
        </div>
      ))}
      {creating && <CreateClient onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); setSecret(c); }} />}
      {secret?.secret && (
        <Modal title={t("admin.clients.secretTitle", { name: secret.name })} onClose={() => setSecret(null)} footer={<button className="btn primary" onClick={() => setSecret(null)}>{t("common.done")}</button>}>
          <p style={{ marginTop: 0 }}>{t("admin.clients.secretOnce")}</p>
          <dl className="kv"><dt>client_id</dt><dd className="mono">{secret.clientId}</dd></dl>
          <div className="secret-once" style={{ marginTop: 8 }}>{secret.secret}</div>
        </Modal>
      )}
    </>
  );
}

function CreateClient({ onClose, onCreated }: { onClose: () => void; onCreated: (c: ServiceClient) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [canDelegate, setCanDelegate] = useState(false);
  const create = useMutation({
    mutationFn: () => api.post<ServiceClient>("/admin/api/v1/clients", { name, url, canDelegate }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["admin", "clients"] }); onCreated(c); },
  });
  return (
    <Modal title={t("admin.clients.add")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!name || create.isPending} onClick={() => create.mutate()}>{t("common.create")}</button>
    </>}>
      <div className="field"><label htmlFor="cl-n">{t("admin.clients.name")}</label><input id="cl-n" className="inp mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-product" /></div>
      <div className="field"><label htmlFor="cl-u">{t("admin.clients.url")}</label><input id="cl-u" className="inp mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.org" /></div>
      <Switch on={canDelegate} onChange={setCanDelegate} label={t("admin.clients.delegate")} />
      {create.error && <div className="err-text">{errorText(t, create.error)}</div>}
    </Modal>
  );
}
