import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Avatar, Icon, Modal, Switch, useToast } from "@green-on-grey/ui-kit";
import { api } from "../../api/client";
import { adminKeys, useAdminCatalog, useAdminChannels, useAdminGroups, useModelConnections } from "../../api/queries";
import type { AdminCatalogItem, AdminUser, Choice, GroupGrants, GroupMember, List, UserGroup } from "../../api/types";
import { errorText } from "../../lib/errors";
import { sameChoice, usableModel } from "../../lib/models";
import { channelLabel } from "./Channels";
import { groupName } from "./groupName";
import { ModelCaps } from "./ModelCaps";

const TABS = ["members", "models", "channels", "mcp", "skills"] as const;
type Tab = (typeof TABS)[number];

const toggle = <T,>(list: T[], v: T, eq: (a: T, b: T) => boolean) => (list.some((x) => eq(x, v)) ? list.filter((x) => !eq(x, v)) : [...list, v]);
const same = <T,>(a: T, b: T) => a === b;

/** Groups of users and their access (FTR.NAB.CMN-0007 R1–R4, design §3.1–3.2):
 * the order decides the default model; the card of a group has the members
 * and the grants of models, channels, MCP and skills. */
export function GroupsAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const groups = useAdminGroups();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  // design §3.2: leaving a card with unsaved changes asks first
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState<{ to: string | null } | null>(null);
  const go = (to: string | null) => {
    if (to === open) return;
    if (dirty) setLeaving({ to });
    else setOpen(to);
  };
  const order = useMutation({
    mutationFn: (ids: string[]) => api.put("/admin/api/v1/groups/order", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.groups }),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
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
                  <tr key={g.id} className={`clickable${open === g.id ? " sel" : ""}`} onClick={() => go(g.id)}
                    draggable={!g.builtin} onDragStart={() => setDrag(g.id)}
                    onDragOver={(e) => !g.builtin && drag && e.preventDefault()}
                    onDrop={() => { if (drag && drag !== g.id && !g.builtin) move(drag, i); setDrag(null); }}>
                    <td className="grp-order" onClick={(e) => e.stopPropagation()}>
                      {g.builtin ? <Icon name="lock" size={14} className="muted" /> : (
                        <span className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                          <button className="iconbtn sm-ic" aria-label={t("admin.groups.up")} disabled={i === 0 || order.isPending} onClick={() => move(g.id, i - 1)}>▲</button>
                          <button className="iconbtn sm-ic" aria-label={t("admin.groups.down")} disabled={i === ordinary.length - 1 || order.isPending} onClick={() => move(g.id, i + 1)}>▼</button>
                        </span>
                      )}
                    </td>
                    <td><b>{groupName(t, g)}</b>{g.description && <div className="small muted">{g.description}</div>}</td>
                    <td>{g.builtin === "all" ? t("admin.groups.everyone") : g.builtin === "admins" ? t("admin.groups.byRole", { count: g.memberCount }) : g.memberCount}</td>
                    {g.allEnabled ? (
                      <td colSpan={4}><span className="pchip">{t("admin.groups.allEnabled")}</span></td>
                    ) : (
                      <>
                        <td>{g.grants?.models.length ?? 0}{g.grants?.defaultModel && <div className="small muted mono">{g.grants.defaultModel.model}</div>}</td>
                        <td className="small">{g.grants?.channels.map((c) => channelLabel(t, c)).join(", ") || "—"}</td>
                        <ItemCounts ids={g.grants?.catalogItems ?? []} />
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
      {current && <GroupPanel key={current.id} group={current} onClose={() => go(null)} onDirty={setDirty} />}
      {creating && <CreateGroup onClose={(id) => { setCreating(false); if (id) go(id); }} />}
      {leaving && (
        <Modal title={t("admin.groups.unsavedTitle")} onClose={() => setLeaving(null)} footer={<>
          <button className="btn ghost" onClick={() => setLeaving(null)}>{t("admin.groups.stay")}</button>
          <button className="btn danger" onClick={() => { setDirty(false); setOpen(leaving.to); setLeaving(null); }}>{t("admin.groups.discard")}</button>
        </>}>
          <p style={{ marginTop: 0 }}>{t("admin.groups.unsavedText")}</p>
        </Modal>
      )}
    </div>
  );
}

/** The numbers of MCP items and skills of a group: a cell under each header. */
function ItemCounts({ ids }: { ids: string[] }) {
  const catalog = useAdminCatalog();
  const items = (catalog.data?.items ?? []).filter((c) => ids.includes(c.id));
  const mcp = items.filter((c) => c.type === "mcp").length;
  return <><td>{mcp}</td><td>{items.length - mcp}</td></>;
}

function CreateGroup({ onClose }: { onClose: (id?: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [descr, setDescr] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<UserGroup>("/admin/api/v1/groups", { name, description: descr }),
    onSuccess: (g) => { qc.invalidateQueries({ queryKey: adminKeys.groups }); onClose(g.id); },
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

/** The mode of a catalog item as the catalog shows it. */
function ItemMode({ item }: { item: AdminCatalogItem }) {
  const { t } = useTranslation();
  if (item.type !== "mcp") return null;
  return item.mode === "personal" ? <span className="mode p">{t("connections.personal")}</span>
    : <span className="mode">{item.readOnly ? t("connections.platformRead") : t("connections.platform")}</span>;
}

/** The card of a group (design §3.2). */
function GroupPanel({ group, onClose, onDirty }: { group: UserGroup; onClose: () => void; onDirty: (dirty: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("members");
  const [draft, setDraft] = useState<GroupGrants>(() => group.grants ?? { models: [], defaultModel: null, channels: [], catalogItems: [] });
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<{ itemId: string; users: number }[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const conns = useModelConnections();
  const channels = useAdminChannels();
  const catalog = useAdminCatalog();
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const mark = (v: boolean) => { setDirty(v); onDirty(v); };
  // the browser asks too before a page with unsaved changes goes away
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
  const edit = (g: GroupGrants) => { setDraft(g); mark(true); };
  const save = useMutation({
    mutationFn: () => api.put<UserGroup>(`/admin/api/v1/groups/${group.id}/grants`, { ...draft }),
    onSuccess: () => { mark(false); setConfirm(null); qc.invalidateQueries({ queryKey: adminKeys.groups }); toast({ kind: "ok", title: t("common.saved") }); },
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
    onSuccess: () => { mark(false); qc.invalidateQueries({ queryKey: adminKeys.groups }); onClose(); },
    onError: fail,
  });
  // design §3.2: «Administrators» show everything enabled, without ticks
  const readOnly = group.allEnabled;
  const items = (catalog.data?.items ?? []).filter((c) => (tab === "mcp" ? c.type === "mcp" : c.type === "skill") && (!readOnly || c.published));
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
      {tab === "models" && (conns.data?.items ?? []).filter((c) => !readOnly || c.enabled).map((c) => (
        <div key={c.id} className={`grp-sec${c.enabled ? "" : " off"}`} title={c.enabled ? undefined : t("admin.groups.connectionOff")}>
          <div className="lab small muted">{c.name}{!c.enabled && ` · ${t("admin.groups.connectionOff")}`}</div>
          {c.models.filter((m) => !readOnly || usableModel(m)).map((m) => {
            const ch: Choice = { connectionId: c.id, model: m.id };
            const on = draft.models.some((x) => sameChoice(x, ch));
            const ok = usableModel(m);
            return (
              <div key={m.id} className={`grp-row${ok ? "" : " off"}`} title={ok ? undefined : t("errors.model_no_tools")}>
                {!readOnly && <input type="checkbox" checked={on} disabled={!ok && !on} aria-label={m.name || m.id}
                  onChange={() => edit({ ...draft, models: toggle(draft.models, ch, sameChoice), defaultModel: on && sameChoice(draft.defaultModel, ch) ? null : draft.defaultModel })} />}
                <span className="grp-name">{m.name || m.id} <ModelCaps m={m} /></span>
                {on && !readOnly && (
                  <label className="small row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <input type="radio" name="def" checked={sameChoice(draft.defaultModel, ch)} onChange={() => edit({ ...draft, defaultModel: ch })} />{t("admin.groups.defaultModel")}
                  </label>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {tab === "channels" && (channels.data?.items ?? []).filter((c) => c.kind !== "web" && (!readOnly || c.enabled)).map((c) => (
        // the row is the label of its switch: the names on the left, the switches in one column on the right
        <label key={c.kind} className={`grp-row${c.enabled ? "" : " off"}`} title={c.enabled ? undefined : t("admin.groups.channelOff")}>
          <span className="grp-name">{channelLabel(t, c.kind)}{!c.enabled && <span className="small muted"> · {t("admin.groups.channelOff")}</span>}</span>
          {!readOnly && <Switch on={draft.channels.includes(c.kind)} onChange={() => edit({ ...draft, channels: toggle(draft.channels, c.kind, same) })} />}
        </label>
      ))}
      {(tab === "mcp" || tab === "skills") && items.map((c) => (
        <div key={c.id} className={`grp-row${c.published ? "" : " off"}`} title={c.published ? undefined : t("admin.groups.itemUnpublished")}>
          {!readOnly && <input type="checkbox" checked={draft.catalogItems.includes(c.id)} aria-label={c.title}
            onChange={() => edit({ ...draft, catalogItems: toggle(draft.catalogItems, c.id, same) })} />}
          <span className="grp-name">{c.title || c.name}{!c.published && <span className="small muted"> · {t("admin.groups.itemUnpublished")}</span>}</span>
          <ItemMode item={c} />
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

/** The members of a group by pages (tech §2): «All users» is everyone, «Administrators»
 * follow the role; the members of an ordinary group are added several at once. */
function Members({ group }: { group: UserGroup }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [find, setFind] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const everyone = group.builtin === "all";
  const members = useInfiniteQuery({
    queryKey: ["admin", "group-members", group.id, q], enabled: !everyone, initialPageParam: "",
    queryFn: ({ pageParam }) => api.get<List<GroupMember>>(`/admin/api/v1/groups/${group.id}/members?q=${encodeURIComponent(q)}${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const users = useQuery({
    queryKey: ["admin", "users", "find", find], enabled: !group.builtin && find.trim().length >= 2,
    queryFn: () => api.get<{ items: AdminUser[] }>(`/admin/api/v1/users?q=${encodeURIComponent(find)}&limit=10`),
  });
  const done = () => { qc.invalidateQueries({ queryKey: ["admin", "group-members", group.id] }); qc.invalidateQueries({ queryKey: adminKeys.groups }); };
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const add = useMutation({ mutationFn: (ids: string[]) => api.post(`/admin/api/v1/groups/${group.id}/members`, { userIds: ids }), onSuccess: () => { setFind(""); setChosen([]); done(); }, onError: fail });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/api/v1/groups/${group.id}/members/${id}`), onSuccess: done, onError: fail });
  if (everyone) return <div className="hintbox small"><Icon name="users" /><span>{t("admin.groups.everyone")}</span></div>;
  const list = (members.data?.pages ?? []).flatMap((p) => p.items);
  const inGroup = new Set(list.map((m) => m.id));
  const found = (users.data?.items ?? []).filter((u) => !inGroup.has(u.id));
  return (
    <>
      {!group.builtin && (
        <div className="field">
          <input className="inp" placeholder={t("admin.groups.addMember")} aria-label={t("admin.groups.addMember")} value={find} onChange={(e) => setFind(e.target.value)} />
          {found.map((u) => (
            <label key={u.id} className="grp-row">
              <input type="checkbox" checked={chosen.includes(u.id)} onChange={() => setChosen((c) => toggle(c, u.id, same))} />
              <Avatar name={u.name || u.email} small />
              <span className="grp-name">{u.name || u.email} <span className="small muted">{u.email}</span></span>
            </label>
          ))}
          {chosen.length > 0 && (
            <button className="btn sm primary" disabled={add.isPending} onClick={() => add.mutate(chosen)}>
              <Icon name="plus" size={14} />{t("admin.groups.addChosen", { count: chosen.length })}
            </button>
          )}
        </div>
      )}
      <input className="inp grp-search" placeholder={t("common.search")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((m) => (
        <div key={m.id} className="grp-row">
          <Avatar name={m.name || m.email} small />
          <span className="grp-name">{m.name || m.email} <span className="small muted">{m.email}</span></span>
          {!group.builtin && <button className="btn sm ghost" onClick={() => remove.mutate(m.id)}>{t("admin.groups.remove")}</button>}
        </div>
      ))}
      {members.hasNextPage && (
        <button className="btn sm ghost" disabled={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()}>{t("admin.groups.moreMembers")}</button>
      )}
    </>
  );
}
