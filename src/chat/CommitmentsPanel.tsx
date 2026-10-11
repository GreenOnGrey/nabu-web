import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { CommState } from "../api/types";
import { Icon } from "../components/Icon";
import { errorText } from "../lib/errors";
import { CommitmentGroups, CommitmentRow, useCommitments } from "../pages/memory/Commitments";

const STORAGE_KEY = "nabu-chat-commitments";
/** What the user owes and has not done: the server filters, the panel does not. */
const MINE_OPEN = new URLSearchParams({ state: "open", direction: "mine" }).toString();
/** The server returns at most this many; the counter says "200+" then. */
const LIST_CAP = 200;

/** Whether the panel starts open: what the user chose last, else by the width
 * of the window — the chat keeps its room on a narrow one. */
function startOpen(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) return v === "open";
  } catch { /* storage is blocked: fall through to the width */ }
  return window.innerWidth >= 1280;
}

/** The open commitments of the user beside the chat (FTR.NAB.CMN-0003 R31,
 * design §3.12): what they owe, to whom and on what topic, by due day; folds into a rail with a count.
 * Shown while the administrator allows the memory of communications and the
 * user has consented. */
export function CommitmentsPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(startOpen);
  const state = useQuery({ queryKey: keys.commState, queryFn: () => api.get<CommState>("/api/v1/comm/state") });
  const shown = Boolean(state.data?.allowed && state.data.consentAt);
  const navigate = useNavigate();
  const list = useCommitments(MINE_OPEN, shown);
  if (!shown) return null;
  const items = list.data ?? [];
  const count = items.length >= LIST_CAP ? `${LIST_CAP}+` : String(items.length);
  // the server's sign, in the time zone of the user — the same the red date of a row uses
  const hasOverdue = items.some((x) => x.c.overdue);
  const badge = items.length > 0 && <span className={`n${hasOverdue ? " late" : ""}`} aria-label={t("chat.commitments.count", { count: items.length })}>{count}</span>;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(STORAGE_KEY, next ? "open" : "closed"); } catch { /* not remembered */ }
  };
  if (!open) {
    return (
      <aside className="cmside rail" aria-label={t("comm.tabs.commitments")}>
        <button type="button" className="iconbtn" onClick={toggle} aria-expanded={false} title={t("chat.commitments.show")} aria-label={t("chat.commitments.show")}>
          <Icon name="check" />
        </button>
        {badge}
      </aside>
    );
  }
  return (
    <aside className="cmside" aria-label={t("comm.tabs.commitments")}>
      <div className="hd">
        <b>{t("comm.tabs.commitments")}</b>
        {badge}
        <span className="spacer" />
        <button type="button" className="iconbtn" onClick={toggle} aria-expanded title={t("chat.commitments.hide")} aria-label={t("chat.commitments.hide")}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="bd">
        {list.error && <div className="err-text">{errorText(t, list.error)}</div>}
        {list.isLoading && <div className="small muted">{t("common.loading")}</div>}
        {list.data && items.length === 0 && <div className="small muted">{t("chat.commitments.empty")}</div>}
        <CommitmentGroups items={items} row={(c) => (
          <CommitmentRow key={c.id} c={c} layout="narrow" onTag={(tag) => navigate(`/memory?tab=comm&${tag.kind}=${tag.id}`)} />
        )} />
      </div>
      <Link className="all" to="/memory?tab=commitments">{t("chat.commitments.all")}</Link>
    </aside>
  );
}
