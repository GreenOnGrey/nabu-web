import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { AdminUser } from "../../api/types";
import { useSession } from "../../app/session";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { relativeTime } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { Avatar, Modal, Switch, useToast } from "../../components/ui";
import { adminPath } from "./paths";

/** Users (R34, design §3.7): search, invite by email, the admin role, block. */
export function UsersAdmin() {
  const { t, i18n } = useTranslation();
  const { me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [inviting, setInviting] = useState(false);
  const users = useQuery({ queryKey: ["admin", "users", q], queryFn: () => api.get<{ items: AdminUser[] }>(`/admin/api/v1/users?q=${encodeURIComponent(q)}`) });
  const patch = useMutation({
    mutationFn: ({ id, ...p }: { id: string; isAdmin?: boolean; blocked?: boolean }) => api.patch(`/admin/api/v1/users/${id}`, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("admin.users.title")}</h2>
        <button className="btn primary sm" onClick={() => setInviting(true)}><Icon name="plus" size={15} />{t("admin.users.invite")}</button>
      </div>
      <div className="search" style={{ maxWidth: 420, margin: "14px 0" }}>
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.users.search")} aria-label={t("admin.users.search")} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr><th>{t("admin.users.user")}</th><th>{t("admin.users.channels")}</th><th>{t("admin.users.role")}</th><th>{t("admin.users.lastSeen")}</th><th>{t("admin.users.status")}</th><th /></tr></thead>
          <tbody>
            {users.data?.items.map((u) => (
              <tr key={u.id}>
                <td><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Avatar small name={u.name || u.email} /><div><b>{u.name || u.email}</b><div className="small muted">{u.email}</div></div></div></td>
                <td>{u.channels.map((c) => t(`channels.${c}`)).join(", ") || <span className="muted">—</span>}</td>
                <td><Switch on={u.isAdmin} disabled={u.id === me.id} label={t("admin.users.admin")} onChange={(v) => patch.mutate({ id: u.id, isAdmin: v })} /></td>
                <td>{u.lastSeenAt ? relativeTime(u.lastSeenAt, intlLocale(i18n.language)) : <span className="muted">—</span>}</td>
                <td><span className={`st ${u.status === "active" ? "ok" : u.status === "invited" ? "review" : "draft"}`}>{t(`admin.users.statuses.${u.status}`)}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {u.id !== me.id && (
                    <button className={`btn sm${u.status === "blocked" ? "" : " danger"}`} onClick={() => patch.mutate({ id: u.id, blocked: u.status !== "blocked" })}>
                      {u.status === "blocked" ? t("admin.users.unblock") : t("admin.users.block")}
                    </button>
                  )}{" "}
                  <Link className="btn ghost sm" to={`${adminPath("audit")}?user=${u.id}`}>{t("admin.users.audit")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inviting && <Invite onClose={() => setInviting(false)} />}
    </>
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
