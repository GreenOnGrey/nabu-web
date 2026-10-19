import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, Modal, Switch, useToast } from "@green-on-grey/ui-kit";
import { api } from "../../api/client";
import type { AdminCatalogItem, AdminChannel, AdminUser, Choice, GroupGrants, GroupMember, ModelConnection, UserGroup } from "../../api/types";
import { errorText } from "../../lib/errors";
import { channelLabel } from "./Channels";
import { groupName } from "./groupName";


const KEY = ["admin", "groups"];
const TABS = ["members", "models", "channels", "mcp", "skills"] as const;
type Tab = (typeof TABS)[number];

const toggle = <T,>(list: T[], v: T, eq: (a: T, b: T) => boolean) => (list.some((x) => eq(x, v)) ? list.filter((x) => !eq(x, v)) : [...list, v]);
const usable = (m: ModelConnection["models"][number]) => m.tools !== false && !m.embeddings && !m.gone;
const same = (a: Choice | null | undefined, b: Choice) => !!a && a.connectionId === b.connectionId && a.model === b.model;

/** Groups of users and their access (FTR.NAB.CMN-0007 R1–R4, design §3.1–3.2):
 * the order decides the default model; the card of a group has the members
 * and the grants of models, channels, MCP and skills. */
export function GroupsAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const groups = useQuery({ queryKey: KEY, queryFn: () => api.get<{ items: UserGroup[] }>("/admin/api/v1/groups") });
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const order = useMutation({
    mutationFn: (ids: string[]) => api.put("/admin/api/v1/groups/order", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: fail,
  });
  const items = groups.data?.items ?? [];
  const ordinary = items.filter((g) => !g.builtin);
  const move = (id: string, to: number) => {
    const ids = ordinary.map((g) => g.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
    order.mutate(ids);
  };
  const current = items.find((g) => g.id === open);
  return (
    <div className="groups-page">
      <div className="groups-list">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{t("admin.groups.title")}</h2>
          <button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" size={15} />{t("admin.groups.create")}</button>
        </div>
        <p className="t2">{t("admin.groups.priority")}</p>
        <div style={{ overflowX: "auto" }}>
          <table className="t">
            <thead><tr>
              <th /><th>{t("admin.groups.group")}</th><th>{t("admin.groups.members")}</th><th>{t("admin.groups.models")}</th>
              <th>{t("admin.groups.channels")}</th><th>{t("admin.groups.mcp")}</th><th>{t("admin.groups.skills")}</th>
            </tr></thead>
            <tbody>
              {items.map((g) => {
                const i = ordinary.findIndex((x) => x.id === g.id);
                return (
                  <tr key={g.id} className={`clickable${open === g.id ? " sel" : ""}`} onClick={() => setOpen(g.id)}
                    draggable={!g.builtin} onDragStart={() => setDrag(g.id)}
                    onDragOver={(e) => !g.builtin && drag && e.preventDefault()}
                    onDrop={() => { if (drag && drag !== g.id && !g.builtin) move(drag, i); setDrag(null); }}>
                    <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      {g.builtin ? <Icon name="lock" size={14} className="muted" /> : (
                        <span className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                          <button className="iconbtn sm-ic" aria-label={t("admin.groups.up")} disabled={i === 0 || order.isPending} onClick={() => move(g.id, i - 1)}>▲</button>
                          <button className="iconbtn sm-ic" aria-label={t("admin.groups.down")} disabled={i === ordinary.length - 1 || order.isPending} onClick={() => move(g.id, i + 1)}>▼</button>
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "normal" }}><b>{groupName(t, g)}</b>{g.description && <div className="small muted">{g.description}</div>}</td>
                    <td>{g.builtin === "all" ? t("admin.groups.everyone") : g.builtin === "admins" ? t("admin.groups.byRole", { count: g.memberCount }) : g.memberCount}</td>
                    {g.allEnabled ? (
                      <td colSpan={4}><span className="pchip">{t("admin.groups.allEnabled")}</span></td>
                    ) : (
                      <>
                        <td>{g.grants?.models.length ?? 0}{g.grants?.defaultModel && <div className="small muted mono">{g.grants.defaultModel.model}</div>}</td>
                        <td className="small">{g.grants?.channels.map((c) => channelLabel(t, c)).join(", ") || "—"}</td>
                        <td colSpan={2}><ItemCounts ids={g.grants?.catalogItems ?? []} /></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {items.length > 0 && ordinary.length === 0 && <div className="hintbox"><Icon name="users" /><span>{t("admin.groups.onlyBuiltin")}</span></div>}
      </div>
      {current && <GroupPanel key={current.id} group={current} onClose={() => setOpen(null)} />}
      {creating && <CreateGroup onClose={(id) => { setCreating(false); if (id) setOpen(id); }} />}
    </div>
  );
}

/** The numbers of MCP items and skills of a group. */
function ItemCounts({ ids }: { ids: string[] }) {
  const catalog = useCatalog();
  const items = (catalog.data?.items ?? []).filter((c) => ids.includes(c.id));
  const mcp = items.filter((c) => c.type === "mcp").length;
  return <span className="row" style={{ gap: 18, flexWrap: "nowrap" }}><span>{mcp}</span><span>{items.length - mcp}</span></span>;
}

const useCatalog = () => useQuery({ queryKey: ["admin", "catalog"], queryFn: () => api.get<{ items: AdminCatalogItem[] }>("/admin/api/v1/catalog") });

function CreateGroup({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [descr, setDescr] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<UserGroup>("/admin/api/v1/groups", { name, description: descr }),
    onSuccess: (g) => { qc.invalidateQueries({ queryKey: KEY }); onClose(g.id); },
  });
  return (
    <Modal title={t("admin.groups.create")} onClose={() => onClose()} footer={<>
      <button className="btn ghost" onClick={() => onClose()}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>{t("admin.groups.create")}</button>
    </>}>
      <div className="field"><label htmlFor="g-name">{t("admin.groups.name")}</label><input id="g-name" className="inp" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="g-descr">{t("admin.groups.description")}</label><input id="g-descr" className="inp" value={descr} onChange={(e) => setDescr(e.target.value)} /></div>
      {create.error && <div className="err-text">{errorText(t, create.error)}</div>}
    </Modal>
  );
}

/** The card of a group (design §3.2). */
function GroupPanel({ group, onClose }: { group: UserGroup; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("members");
  const [draft, setDraft] = useState<GroupGrants>(() => group.grants ?? { models: [], defaultModel: null, channels: [], catalogItems: [] });
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<{ itemId: string; users: number }[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const conns = useQuery({ queryKey: ["admin", "connections"], queryFn: () => api.get<{ items: ModelConnection[] }>("/admin/api/v1/model-connections") });
  const channels = useQuery({ queryKey: ["admin", "channels"], queryFn: () => api.get<{ items: AdminChannel[] }>("/admin/api/v1/channels") });
  const catalog = useCatalog();
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const edit = (g: GroupGrants) => { setDraft(g); setDirty(true); };
  const save = useMutation({
    mutationFn: () => api.put<UserGroup>(`/admin/api/v1/groups/${group.id}/grants`, { ...draft }),
    onSuccess: () => { setDirty(false); setConfirm(null); qc.invalidateQueries({ queryKey: KEY }); toast({ kind: "ok", title: t("common.saved") }); },
    onError: fail,
  });
  // R10: taking MCP with connected members asks first
  const trySave = async () => {
    try {
      const r = await api.post<{ revokedConnections: { itemId: string; users: number }[] }>(`/admin/api/v1/groups/${group.id}/grants:impact`, { ...draft });
      if (r.revokedConnections.length > 0) setConfirm(r.revokedConnections);
      else save.mutate();
    } catch (e) {
      fail(e);
    }
  };
  const del = useMutation({
    mutationFn: () => api.del(`/admin/api/v1/groups/${group.id}?confirm=${group.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); onClose(); },
    onError: fail,
  });
  const readOnly = group.allEnabled;
  const items = (catalog.data?.items ?? []).filter((c) => (tab === "mcp" ? c.type === "mcp" : c.type === "skill"));
  const title = (id: string) => catalog.data?.items.find((c) => c.id === id)?.title ?? id;
  return (
    <aside className="group-panel" aria-label={groupName(t, group)}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>{group.builtin && <Icon name="lock" size={14} />} {groupName(t, group)}</h3>
          <div className="small muted">{group.builtin === "admins" ? t("admin.groups.adminsHint") : group.builtin === "all" ? t("admin.groups.everyone")
            : t("admin.groups.memberCount", { count: group.memberCount })}</div>
        </div>
        <button className="iconbtn" aria-label={t("common.close")} onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="mini-seg" style={{ display: "inline-flex", margin: "12px 0" }}>
        {TABS.map((x) => <button key={x} className={tab === x ? "on" : ""} aria-pressed={tab === x} onClick={() => setTab(x)}>{t(`admin.groups.${x}`)}</button>)}
      </div>
      {readOnly && tab !== "members" && <div className="hintbox small"><Icon name="lock" /><span>{t("admin.groups.adminsAll")}</span></div>}
      {tab === "members" && <Members group={group} />}
      {tab === "models" && !readOnly && (conns.data?.items ?? []).map((c) => (
        <div key={c.id} className="grp-sec">
          <div className="lab small muted">{c.name}{!c.enabled && ` · ${t("admin.models.status.disabled")}`}</div>
          {c.models.map((m) => {
            const ch: Choice = { connectionId: c.id, model: m.id };
            const on = draft.models.some((x) => same(x, ch));
            const ok = usable(m);
            return (
              <div key={m.id} className={`grp-row${ok ? "" : " off"}`} title={ok ? undefined : t("errors.model_no_tools")}>
                <input type="checkbox" checked={on} disabled={!ok && !on} aria-label={m.name || m.id}
                  onChange={() => edit({ ...draft, models: toggle(draft.models, ch, same), defaultModel: on && same(draft.defaultModel, ch) ? null : draft.defaultModel })} />
                <span className="grp-name">{m.name || m.id} {!ok && <span className="mcap err">{t("models.cap.noTools")}</span>}</span>
                {on && (
                  <label className="small row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <input type="radio" name="def" checked={same(draft.defaultModel, ch)} onChange={() => edit({ ...draft, defaultModel: ch })} />{t("admin.groups.defaultModel")}
                  </label>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {tab === "channels" && !readOnly && (channels.data?.items ?? []).filter((c) => c.kind !== "web").map((c) => (
        <div key={c.kind} className={`grp-row${c.enabled ? "" : " off"}`} title={c.enabled ? undefined : t("admin.groups.channelOff")}>
          <span className="grp-name">{channelLabel(t, c.kind)}{!c.enabled && <span className="small muted"> · {t("admin.groups.channelOff")}</span>}</span>
          <Switch on={draft.channels.includes(c.kind)} onChange={() => edit({ ...draft, channels: toggle(draft.channels, c.kind, (a, b) => a === b) })} label={channelLabel(t, c.kind)} />
        </div>
      ))}
      {(tab === "mcp" || tab === "skills") && !readOnly && items.map((c) => (
        <div key={c.id} className={`grp-row${c.published ? "" : " off"}`} title={c.published ? undefined : t("admin.groups.itemUnpublished")}>
          <input type="checkbox" checked={draft.catalogItems.includes(c.id)} aria-label={c.title}
            onChange={() => edit({ ...draft, catalogItems: toggle(draft.catalogItems, c.id, (a, b) => a === b) })} />
          <span className="grp-name">{c.title || c.name}{!c.published && <span className="small muted"> · {t("admin.groups.itemUnpublished")}</span>}</span>
          {c.mode && <span className={`mode${c.mode === "personal" ? " p" : ""}`}>{t(`admin.catalog.modes.${c.mode}`, { defaultValue: c.mode })}</span>}
        </div>
      ))}
      <div className="group-foot">
        {!group.builtin && <button className="btn ghost danger" onClick={() => setDeleting(true)}>{t("admin.groups.delete")}</button>}
        <span className="spacer" />
        {!readOnly && tab !== "members" && (
          <button className="btn primary" disabled={!dirty || save.isPending} onClick={() => void trySave()}>{t("common.save")}</button>
        )}
      </div>
      {confirm && (
        <Modal title={t("admin.groups.mcpRevokeTitle")} onClose={() => setConfirm(null)} footer={<>
          <button className="btn ghost" onClick={() => setConfirm(null)}>{t("common.cancel")}</button>
          <button className="btn danger" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
        </>}>
          {confirm.map((c) => <p key={c.itemId} style={{ marginTop: 0 }}>{t("admin.groups.mcpRevoke", { count: c.users, item: title(c.itemId) })}</p>)}
        </Modal>
      )}
      {deleting && (
        <Modal title={t("admin.groups.delete")} onClose={() => setDeleting(false)} footer={<>
          <button className="btn ghost" onClick={() => setDeleting(false)}>{t("common.cancel")}</button>
          <button className="btn danger" disabled={del.isPending} onClick={() => del.mutate()}>{t("common.delete")}</button>
        </>}>
          <p style={{ marginTop: 0 }}>{t("admin.groups.deleteText", { name: group.name, count: group.memberCount })}</p>
        </Modal>
      )}
    </aside>
  );
}

/** The members of a group: built-in groups are read-only (R2, R3). */
function Members({ group }: { group: UserGroup }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [find, setFind] = useState("");
  const key = ["admin", "group-members", group.id, q];
  const members = useQuery({ queryKey: key, queryFn: () => api.get<{ items: GroupMember[] }>(`/admin/api/v1/groups/${group.id}/members?limit=200&q=${encodeURIComponent(q)}`) });
  const users = useQuery({
    queryKey: ["admin", "users", "find", find], enabled: !group.builtin && find.trim().length >= 2,
    queryFn: () => api.get<{ items: AdminUser[] }>(`/admin/api/v1/users?q=${encodeURIComponent(find)}&limit=10`),
  });
  const done = () => { qc.invalidateQueries({ queryKey: ["admin", "group-members", group.id] }); qc.invalidateQueries({ queryKey: KEY }); };
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const add = useMutation({ mutationFn: (ids: string[]) => api.post(`/admin/api/v1/groups/${group.id}/members`, { userIds: ids }), onSuccess: () => { setFind(""); done(); }, onError: fail });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/api/v1/groups/${group.id}/members/${id}`), onSuccess: done, onError: fail });
  const inGroup = new Set((members.data?.items ?? []).map((m) => m.id));
  return (
    <>
      {!group.builtin && (
        <div className="field">
          <input className="inp" placeholder={t("admin.groups.addMember")} aria-label={t("admin.groups.addMember")} value={find} onChange={(e) => setFind(e.target.value)} />
          {(users.data?.items ?? []).filter((u) => !inGroup.has(u.id)).map((u) => (
            <div key={u.id} className="grp-row">
              <span className="grp-name">{u.name || u.email} <span className="small muted">{u.email}</span></span>
              <button className="btn sm" onClick={() => add.mutate([u.id])}><Icon name="plus" size={14} />{t("admin.groups.add")}</button>
            </div>
          ))}
        </div>
      )}
      <input className="inp" style={{ marginBottom: 8 }} placeholder={t("common.search")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {(members.data?.items ?? []).map((m) => (
        <div key={m.id} className="grp-row">
          <span className="grp-name">{m.name || m.email} <span className="small muted">{m.email}</span></span>
          {!group.builtin && <button className="btn sm ghost" onClick={() => remove.mutate(m.id)}>{t("admin.groups.remove")}</button>}
        </div>
      ))}
    </>
  );
}
