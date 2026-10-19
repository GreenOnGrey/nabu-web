import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, qs } from "../../api/client";
import { adminKeys, useAdminGroups } from "../../api/queries";
import type { AdminUser, ArchiveResult, EffectiveAccess, RestoreRequest, UserCard } from "../../api/types";
import { useSession } from "../../app/session";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { dateTime, relativeTime } from "../../lib/format";
import { useEvent } from "../../lib/sse";
import { Avatar, Icon, Modal, Switch, useToast } from "@green-on-grey/ui-kit";
import { adminPath } from "./paths";
import { channelLabel } from "./Channels";
import { groupName } from "./groupName";
import { sameChoice } from "../../lib/models";

const FILTERS = ["active", "archived", "purge"] as const;
type Filter = (typeof FILTERS)[number];
const DAY = 24 * 3600 * 1000;

/** Whole days until the purge, counted in a handler or a query — never during render. */
const daysLeft = (iso: string | undefined, now: number) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY)) : null);

/** Users (R34; FTR.NAB.CMN-0002 R24, design §3.3–3.4): search, invitation,
 * the admin role, blocking, the channels of a user, the archive with restore
 * requests. */
export function UsersAdmin() {
  const { t, i18n } = useTranslation();
  const { me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [inviting, setInviting] = useState(false);
  const [archiving, setArchiving] = useState<string[] | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const locale = intlLocale(i18n.language);
  const params = filter === "active" ? { q } : filter === "archived" ? { q, status: "archived" } : { q, status: "archived", purgeWithinDays: 7 };
  const users = useQuery({
    queryKey: ["admin", "users", q, filter],
    queryFn: async () => ({ ...(await api.get<{ items: AdminUser[] }>(`/admin/api/v1/users${qs(params)}`)), now: Date.now() }),
  });
  const soon = useQuery({
    queryKey: ["admin", "users", "purge-count"],
    queryFn: () => api.get<{ items: AdminUser[] }>("/admin/api/v1/users?status=archived&purgeWithinDays=7"),
  });
  const requests = useQuery({ queryKey: ["admin", "restore-requests"], queryFn: () => api.get<{ items: RestoreRequest[] }>("/admin/api/v1/restore-requests") });
  const inv = () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); qc.invalidateQueries({ queryKey: ["admin", "restore-requests"] }); };
  useEvent("restore.requested", inv);
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const patch = useMutation({
    mutationFn: ({ id, ...p }: { id: string; isAdmin?: boolean; blocked?: boolean }) => api.patch(`/admin/api/v1/users/${id}`, p),
    onSuccess: inv, onError: fail,
  });
  const restore = useMutation({
    mutationFn: ({ id, linkIdentity }: { id: string; linkIdentity?: string }) => api.post(`/admin/api/v1/users/${id}:restore`, linkIdentity ? { linkIdentity } : {}),
    onSuccess: () => { inv(); toast({ kind: "ok", title: t("admin.users.restored") }); }, onError: fail,
  });
  const reject = useMutation({ mutationFn: (id: string) => api.post(`/admin/api/v1/restore-requests/${id}:reject`), onSuccess: inv, onError: fail });
  const now = users.data?.now ?? 0;
  const list = (users.data?.items ?? []).filter((u) => filter !== "active" || u.status !== "archived");
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("admin.users.title")}</h2>
        <span className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => setArchiving([])}><Icon name="archive" size={15} />{t("admin.users.archiveList")}</button>
          <button className="btn primary sm" onClick={() => setInviting(true)}><Icon name="plus" size={15} />{t("admin.users.invite")}</button>
        </span>
      </div>
      <div className="row" style={{ gap: 12, margin: "14px 0" }}>
        <div className="search" style={{ maxWidth: 420, flex: 1 }}>
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.users.search")} aria-label={t("admin.users.search")} />
        </div>
        <div className="mini-seg" style={{ display: "inline-flex" }}>
          {FILTERS.map((f) => (
            <button key={f} className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`admin.users.filters.${f}`)}{f === "purge" && (soon.data?.items.length ?? 0) > 0 && <> <span className="unread">{soon.data!.items.length}</span></>}
            </button>
          ))}
        </div>
      </div>
      {(requests.data?.items ?? []).map((r) => (
        <div className="reqbox" key={r.id}>
          <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
            <div>
              <b>{t("admin.users.requestTitle", { name: r.name || r.email })}</b>
              <div className="small muted">
                {r.email} · {t("admin.users.requestAt", { when: dateTime(r.requestedAt, locale) })}
                {r.archivedAt && <> · {t("admin.users.archivedSince", { when: dateTime(r.archivedAt, locale) })}</>}
              </div>
              <div className="small" style={{ marginTop: 4 }}>
                {r.newIdentity ? <span className="warn-t"><Icon name="alert" size={14} /> {t("admin.users.newIdentity", { subject: r.newIdentity.subject })}</span> : t("admin.users.sameIdentity")}
              </div>
            </div>
            <span className="row" style={{ gap: 8 }}>
              <button className="btn sm primary" disabled={restore.isPending} onClick={() => restore.mutate({ id: r.userId, linkIdentity: r.id })}>
                {r.newIdentity ? t("admin.users.restoreAndLink") : t("admin.users.restore")}
              </button>
              <button className="btn sm" onClick={() => reject.mutate(r.id)}>{t("admin.users.reject")}</button>
            </span>
          </div>
        </div>
      ))}
      <div style={{ overflowX: "auto" }}>
        {filter === "active" ? (
          <table className="t">
            <thead><tr><th>{t("admin.users.user")}</th><th>{t("admin.users.channels")}</th><th>{t("admin.users.role")}</th><th>{t("admin.users.lastSeen")}</th><th>{t("admin.users.status")}</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td><button className="linklike" onClick={() => setCard(u.id)}>
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Avatar small name={u.name || u.email} /><div style={{ textAlign: "left" }}><b>{u.name || u.email}</b><div className="small muted">{u.email}</div></div></div>
                  </button></td>
                  <td>{u.channels.map((c) => t(`channels.${c}`)).join(", ") || <span className="muted">—</span>}</td>
                  <td><Switch on={u.isAdmin} disabled={u.id === me.id} label={t("admin.users.admin")} onChange={(v) => patch.mutate({ id: u.id, isAdmin: v })} /></td>
                  <td>{u.lastSeenAt ? relativeTime(u.lastSeenAt, locale) : <span className="muted">—</span>}</td>
                  <td><span className={`st ${u.status === "active" ? "ok" : u.status === "invited" ? "review" : "draft"}`}>{t(`admin.users.statuses.${u.status}`)}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {u.id !== me.id && (
                      <button className={`btn sm${u.status === "blocked" ? "" : " danger"}`} onClick={() => patch.mutate({ id: u.id, blocked: u.status !== "blocked" })}>
                        {u.status === "blocked" ? t("admin.users.unblock") : t("admin.users.block")}
                      </button>
                    )}{" "}
                    <button className="btn ghost sm" onClick={() => setCard(u.id)}>{t("admin.users.card")}</button>{" "}
                    <Link className="btn ghost sm" to={`${adminPath("audit")}?user=${u.id}`}>{t("admin.users.audit")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="t">
            <thead><tr><th>{t("admin.users.user")}</th><th>{t("admin.users.archivedAt")}</th><th>{t("admin.users.purgeAfter")}</th><th>{t("admin.users.archivedBy")}</th><th /></tr></thead>
            <tbody>
              {list.map((u) => {
                const left = daysLeft(u.purgeAfter, now);
                return (
                  <tr key={u.id}>
                    <td><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Avatar small name={u.name || u.email} /><div><b>{u.name || u.email}</b><div className="small muted">{u.email}</div></div></div></td>
                    <td>{u.archivedAt ? dateTime(u.archivedAt, locale) : "—"}</td>
                    <td>{left === null ? "—" : <span className={left <= 7 ? "warn-t" : ""}>{t("admin.users.purgeIn", { count: left })}</span>}</td>
                    <td>{u.archivedBy?.startsWith("api:") ? <span className="mono">{t("admin.users.byApi", { client: u.archivedBy.slice(4) })}</span> : u.archivedBy || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn sm" disabled={restore.isPending} onClick={() => restore.mutate({ id: u.id })}>{t("admin.users.restore")}</button>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && !users.isLoading && <tr><td colSpan={5} className="muted">{t("admin.users.archiveEmpty")}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {inviting && <Invite onClose={() => setInviting(false)} />}
      {archiving && <ArchiveDialog emails={archiving} onClose={() => { setArchiving(null); inv(); }} />}
      {card && <UserCardModal id={card} self={card === me.id} onClose={() => setCard(null)} onArchive={(email) => { setCard(null); setArchiving([email]); }} />}
    </>
  );
}

function ArchiveDialog({ emails, onClose }: { emails: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(emails.join("\n"));
  const [groups, setGroups] = useState<"transfer" | "disable">("transfer");
  const [results, setResults] = useState<ArchiveResult[] | null>(null);
  const list = text.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
  const archive = useMutation({
    mutationFn: () => api.post<{ results: ArchiveResult[] }>("/admin/api/v1/users:archive", { emails: list, groupAgents: groups }),
    onSuccess: (r) => setResults(r.results),
  });
  return (
    <Modal title={t("admin.users.archiveTitle")} onClose={onClose} footer={results ? <button className="btn primary" onClick={onClose}>{t("common.done")}</button> : <>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn danger" disabled={list.length === 0 || archive.isPending} onClick={() => archive.mutate()}>{t("admin.users.archiveDo", { count: list.length })}</button>
    </>}>
      {results ? (
        <table className="t"><tbody>
          {results.map((r) => <tr key={r.email}><td className="mono">{r.email}</td><td>{t(`admin.users.results.${r.result}`)}</td></tr>)}
        </tbody></table>
      ) : (
        <>
          <div className="field"><label htmlFor="ar-emails">{t("admin.users.archiveEmails")}</label>
            <textarea id="ar-emails" className="inp mono" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"ivanov@company.ru\npetrov@company.ru"} /></div>
          <div className="field"><label>{t("admin.users.groupAgents")}</label>
            <div className="mini-seg" style={{ display: "inline-flex" }}>
              {(["transfer", "disable"] as const).map((g) => <button key={g} className={groups === g ? "on" : ""} aria-pressed={groups === g} onClick={() => setGroups(g)}>{t(`admin.users.groups.${g}`)}</button>)}
            </div>
          </div>
          <div className="hintbox warn"><Icon name="alert" /><span>{t("admin.users.archiveHint")}</span></div>
          {archive.error && <div className="err-text">{errorText(t, archive.error)}</div>}
        </>
      )}
    </Modal>
  );
}

function UserCardModal({ id, self, onClose, onArchive }: { id: string; self: boolean; onClose: () => void; onArchive: (email: string) => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const locale = intlLocale(i18n.language);
  const key = ["admin", "user", id];
  const card = useQuery({ queryKey: key, queryFn: () => api.get<UserCard>(`/admin/api/v1/users/${id}`) });
  const done = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["admin", "users"] }); qc.invalidateQueries({ queryKey: ["admin", "channels"] }); };
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const unbind = useMutation({ mutationFn: () => api.del(`/admin/api/v1/users/${id}/channels/telegram/binding`), onSuccess: done, onError: fail });
  const u = card.data?.user;
  return (
    <Modal wide title={u ? u.name || u.email : "…"} onClose={onClose} footer={<>
      {u && !self && u.status !== "archived" && <button className="btn danger" onClick={() => onArchive(u.email)}><Icon name="archive" size={15} />{t("admin.users.archive")}</button>}
      <span className="spacer" />
      <button className="btn primary" onClick={onClose}>{t("common.close")}</button>
    </>}>
      {u && <div className="small muted" style={{ marginBottom: 12 }}>{u.email} · {t(`admin.users.statuses.${u.status}`)}</div>}
      <h3 className="sec" style={{ marginTop: 0 }}>{t("admin.users.channels")}</h3>
      {/* FTR.NAB.CMN-0007 R5: channels come from groups; the card only shows them */}
      <table className="t"><tbody>
        {(card.data?.channels ?? []).map((c) => (
          <tr key={c.kind}>
            <td><b>{channelLabel(t, c.kind)}</b>
              {c.binding && <div className="small muted">{t("connections.linkedAs", { account: c.binding.account, when: dateTime(c.binding.boundAt, locale) })}{" "}
                <button className="linklike small" onClick={() => unbind.mutate()}>{t("connections.unlink")}</button></div>}</td>
            <td className="small">{c.available ? <span className="ok-t">{t("admin.users.available")}</span> : <span className="muted">{t("admin.users.notAvailable")}</span>}</td>
            <td className="small muted">{t(`admin.users.reasons.${c.reason}`, { defaultValue: c.reason })}</td>
          </tr>
        ))}
      </tbody></table>
      {u && u.status !== "archived" && <UserAccess id={id} />}
      {(card.data?.groupAgents.length ?? 0) > 0 && (
        <>
          <h3 className="sec">{t("admin.group-agents.title")}</h3>
          <table className="t"><tbody>
            {card.data!.groupAgents.map((g) => (
              <tr key={g.id}><td><b>{g.chatTitle || g.chatId}</b><div className="small muted">{t(`channels.${g.channel}`)}</div></td>
                <td>{g.name}</td><td><span className={`st ${g.status === "active" ? "ok" : "draft"}`}>{t(`admin.group-agents.statuses.${g.status}`)}</span></td></tr>
            ))}
          </tbody></table>
        </>
      )}
    </Modal>
  );
}

function Invite({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  const invite = useMutation({
    mutationFn: () => api.post("/admin/api/v1/users", { email: email.trim(), isAdmin: admin }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); onClose(); },
  });
  return (
    <Modal title={t("admin.users.invite")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!email.includes("@") || invite.isPending} onClick={() => invite.mutate()}>{t("admin.users.add")}</button>
    </>}>
      <div className="field"><label htmlFor="inv-email">Email</label><input id="inv-email" type="email" className="inp" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <Switch on={admin} onChange={setAdmin} label={t("admin.users.makeAdmin")} />
      <div className="hint">{t("admin.users.inviteHint")}</div>
      {invite.error && <div className="err-text">{errorText(t, invite.error)}</div>}
    </Modal>
  );
}

/** The access of a user (FTR.NAB.CMN-0007 R7, design §3.3): the groups and
 * what they grant, each line with its source. */
function UserAccess({ id }: { id: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["admin", "user-access", id];
  const acc = useQuery({ queryKey: key, queryFn: () => api.get<EffectiveAccess>(`/admin/api/v1/users/${id}/access`) });
  const groups = useAdminGroups();
  const set = useMutation({
    mutationFn: (ids: string[]) => api.put<EffectiveAccess>(`/admin/api/v1/users/${id}/groups`, { groupIds: ids }),
    onSuccess: (a) => { qc.setQueryData(key, a); qc.invalidateQueries({ queryKey: adminKeys.groups }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const a = acc.data;
  if (!a) return null;
  const all = groups.data?.items ?? [];
  const groupOf = (gid: string) => all.find((x) => x.id === gid) ?? a.groups.find((x) => x.id === gid);
  const nameOf = (gid: string) => {
    const g = groupOf(gid);
    return g ? groupName(t, g) : t("admin.access.deletedGroup");
  };
  // design §3.3: what the role of administrator gives reads «administrator»
  const via = (ids: string[]) => {
    const granting = ids.filter((g) => groupOf(g)?.builtin !== "admins");
    const parts = [...(granting.length ? [t("admin.access.via", { groups: granting.map(nameOf).join(", ") })] : []), ...(granting.length < ids.length ? [t("admin.access.admin")] : [])];
    return parts.join(", ");
  };
  const ownGroupIds = a.groups.filter((g) => !g.builtin).map((g) => g.id);
  const otherGroups = all.filter((g) => !g.builtin && !ownGroupIds.includes(g.id));
  const def = a.defaultModel;
  const defaultFrom = def ? t(`admin.access.defaultFrom.${def.source}`, { group: def.groupId ? nameOf(def.groupId) : "" }) : "";
  return (
    <>
      <h3 className="sec">{t("admin.access.title")}</h3>
      <div className="chips" style={{ alignItems: "center", marginBottom: 10 }}>
        {a.groups.map((g) => g.builtin ? (
          <span key={g.id} className="chip"><Icon name="lock" size={12} />{groupName(t, g)}</span>
        ) : (
          <span key={g.id} className="chip on">{g.name}
            <button className="iconbtn" style={{ width: 18, height: 18 }} aria-label={t("common.remove")} onClick={() => set.mutate(ownGroupIds.filter((x) => x !== g.id))}><Icon name="x" size={12} /></button>
          </span>
        ))}
        {otherGroups.length > 0 && (
          <select className="inp" style={{ width: "auto" }} value="" aria-label={t("admin.access.addToGroup")}
            onChange={(e) => { if (e.target.value) set.mutate([...ownGroupIds, e.target.value]); }}>
            <option value="">{t("admin.access.addToGroup")}</option>
            {otherGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>
      <div className="access-grid">
        <div className="svc">
          <div className="h"><b>{t("admin.groups.models")}</b></div>
          {a.models.length === 0 && <div className="small err-t">{t("admin.access.noModels")}</div>}
          {a.models.map((m) => (
            <div key={m.connectionId + m.model} className="acc-row">
              <span>{m.name} {sameChoice(def, m) && <span className="pchip" title={defaultFrom}>{t("admin.access.default")}</span>}</span>
              <span className="small muted">{via(m.via)}</span>
            </div>
          ))}
        </div>
        <div className="svc">
          <div className="h"><b>{t("admin.groups.channels")}</b></div>
          {a.channels.length === 0 && <div className="small muted">{t("admin.access.onlyWeb")}</div>}
          {a.channels.map((c) => <div key={c.kind} className="acc-row"><span>{channelLabel(t, c.kind)}</span><span className="small muted">{via(c.via)}</span></div>)}
        </div>
        {(["mcp", "skill"] as const).map((type) => (
          <div key={type} className="svc">
            <div className="h"><b>{t(type === "mcp" ? "admin.groups.mcp" : "admin.groups.skills")}</b></div>
            {a.catalogItems.filter((i) => i.type === type).map((i) => (
              <div key={i.id} className="acc-row"><span>{i.title}</span><span className="small muted">{via(i.via)}</span></div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
