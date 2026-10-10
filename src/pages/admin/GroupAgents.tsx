import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { AdminUser, GroupAgent } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { dateTime } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { Empty, Modal, useToast } from "../../components/ui";

/** Group agents (FTR.NAB.CMN-0002 R16–R17, R24, design §3.5): the chat, the
 * owner, the model, the cost of the month, the state; transfer and disable. */
export function GroupAgentsAdmin() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [transfer, setTransfer] = useState<GroupAgent | null>(null);
  const locale = intlLocale(i18n.language);
  const list = useQuery({ queryKey: ["admin", "group-agents"], queryFn: () => api.get<{ items: GroupAgent[] }>("/admin/api/v1/group-agents") });
  const patch = useMutation({
    mutationFn: ({ id, ...p }: { id: string; status?: string; ownerId?: string }) => api.patch(`/admin/api/v1/group-agents/${id}`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "group-agents"] }); setTransfer(null); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const items = list.data?.items ?? [];
  return (
    <>
      <h2 style={{ margin: 0 }}>{t("admin.group-agents.title")}</h2>
      <p className="lead">{t("admin.group-agents.lead")}</p>
      {items.length === 0 && !list.isLoading && <Empty icon="users" title={t("admin.group-agents.empty")} />}
      {items.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="t">
            <thead><tr><th>{t("admin.group-agents.group")}</th><th>{t("admin.group-agents.members")}</th><th>{t("admin.group-agents.owner")}</th>
              <th>{t("admin.group-agents.model")}</th><th>{t("admin.group-agents.cost")}</th><th>{t("admin.group-agents.state")}</th><th /></tr></thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id}>
                  <td><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Icon name={g.channel === "telegram" ? "tg" : "msg"} />
                    <div><b>{g.chatTitle || g.chatId}</b><div className="small muted">{t(`channels.${g.channel}`)} · {g.name}</div></div></div></td>
                  <td>{g.status === "removed" ? <span className="muted">{t("admin.group-agents.removed")}</span> : g.membersCount ?? "—"}</td>
                  <td>{g.owner ? <>{g.owner.name || g.owner.email}<div className="small muted">{g.owner.email}</div></> : <span className="muted">—</span>}</td>
                  <td className="mono small">{g.model ?? t("admin.group-agents.defaultModel")}</td>
                  <td>${g.costMonth.toFixed(2)}</td>
                  <td><span className={`st ${g.status === "active" ? "ok" : "draft"}`}>{t(`admin.group-agents.statuses.${g.status}`)}</span>
                    {g.dataUntil && <div className="small muted">{t("admin.group-agents.dataUntil", { when: dateTime(g.dataUntil, locale) })}</div>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {g.status !== "removed" && <button className="btn sm" onClick={() => setTransfer(g)}>{t("admin.group-agents.transfer")}</button>}{" "}
                    {g.status === "active" && <button className="btn sm danger" onClick={() => patch.mutate({ id: g.id, status: "disabled" })}>{t("admin.group-agents.disable")}</button>}
                    {g.status === "disabled" && <button className="btn sm" onClick={() => patch.mutate({ id: g.id, status: "active" })}>{t("admin.group-agents.enable")}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {transfer && <Transfer agent={transfer} pending={patch.isPending} onClose={() => setTransfer(null)} onPick={(ownerId) => patch.mutate({ id: transfer.id, ownerId })} />}
    </>
  );
}

function Transfer({ agent, pending, onClose, onPick }: { agent: GroupAgent; pending: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["admin", "users", q, "pick"], queryFn: () => api.get<{ items: AdminUser[] }>(`/admin/api/v1/users?status=active&limit=20&q=${encodeURIComponent(q)}`) });
  return (
    <Modal title={t("admin.group-agents.transferTitle", { group: agent.chatTitle || agent.chatId })} onClose={onClose}
      footer={<button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>}>
      <div className="search"><Icon name="search" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.users.search")} aria-label={t("admin.users.search")} /></div>
      <div className="hint">{t("admin.group-agents.transferHint")}</div>
      <table className="t"><tbody>
        {(users.data?.items ?? []).filter((u) => u.id !== agent.owner?.id).map((u) => (
          <tr key={u.id}><td><b>{u.name || u.email}</b><div className="small muted">{u.email}</div></td>
            <td style={{ textAlign: "right" }}><button className="btn sm" disabled={pending} onClick={() => onPick(u.id)}>{t("admin.group-agents.transfer")}</button></td></tr>
        ))}
      </tbody></table>
    </Modal>
  );
}
