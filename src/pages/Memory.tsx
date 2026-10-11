import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { CommState, CommTag, List, Memory } from "../api/types";
import { errorText } from "../lib/errors";
import { intlLocale } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Modal, useToast } from "../components/ui";
import { CommTab, type CommFilter } from "./memory/Comm";
import { CommitmentsTab } from "./memory/Commitments";
import { MemoryTasksTab } from "./memory/MemoryTasks";

const TABS = ["facts", "comm", "commitments", "tasks"] as const;
type Tab = (typeof TABS)[number];

/** Memory (FTR.NAB.CMN-0001 R6; FTR.NAB.CMN-0003 R18, design §2): the facts
 * the agent keeps and — when the administrator allowed it — the collected
 * communications, the commitments and the prepared memory tasks. The tab, the
 * view and the filters live in the address, so a tag or a link from a digest
 * opens the right set. */
export function MemoryPage() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const state = useQuery({ queryKey: keys.commState, queryFn: () => api.get<CommState>("/api/v1/comm/state") });
  const allowed = state.data?.allowed ?? false;
  // R24: after the administrator switched the function off, what is collected stays visible
  const available = state.data?.available ?? false;
  const on = available && Boolean(state.data?.consentAt);
  const people = useQuery({ queryKey: keys.commTags("person"), enabled: on, queryFn: () => api.get<{ items: CommTag[] }>("/api/v1/comm/people") });
  const topics = useQuery({ queryKey: keys.commTags("topic"), enabled: on, queryFn: () => api.get<{ items: CommTag[] }>("/api/v1/comm/topics") });
  const raw = sp.get("tab") as Tab | null;
  const tabs = TABS.filter((x) => x !== "tasks" || allowed); // nothing can be switched on while it is off
  const tab: Tab = available && raw && tabs.includes(raw) ? raw : "facts";
  const patch = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSp(next, { replace: true });
  };
  const filter: CommFilter = {
    q: sp.get("q") ?? "", person: sp.get("person") ?? "", topic: sp.get("topic") ?? "", source: sp.get("source") ?? "",
    period: (["7", "30", "90", "all"].includes(sp.get("period") ?? "") ? sp.get("period") : "30") as CommFilter["period"],
  };
  const openTag = (tag: CommTag) => patch({ tab: "comm", view: "table", note: null, [tag.kind === "person" ? "person" : "topic"]: tag.id });
  if (!available) return <div className="page"><h1>{t("memory.title")}</h1><p className="lead">{t("memory.lead")}</p><FactsTab /></div>;
  const s = state.data!;
  const invite = (
    <Empty icon="brain" title={t("comm.invite.title")}>{t("comm.invite.text")}
      <div style={{ marginTop: 14 }}><button className="btn primary" onClick={() => patch({ tab: "tasks" })}>{t("comm.invite.action")}</button></div>
    </Empty>
  );
  return (
    <div className="page wide">
      <h1>{t("memory.title")}</h1>
      <p className="lead">{t("comm.lead")}</p>
      <div className="mtabs" role="tablist">
        {tabs.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={`${tab === x ? "on" : ""}${x === "tasks" ? " end" : ""}`} onClick={() => patch({ tab: x === "facts" ? null : x })}>
            {t(`comm.tabs.${x}`)}
            {x === "comm" && s.counts.notes > 0 && <span className="n">{s.counts.notes}</span>}
            {x === "commitments" && s.counts.openCommitments > 0 && <span className="n">{s.counts.openCommitments}</span>}
          </button>
        ))}
      </div>
      {tab === "facts" && <FactsTab />}
      {tab === "comm" && (s.consentAt
        ? <CommTab state={s} filter={filter} setFilter={(p) => patch(p as Record<string, string>)} people={people.data?.items ?? []} topics={topics.data?.items ?? []}
            view={sp.get("view") === "graph" ? "graph" : "table"} setView={(v) => patch({ view: v === "graph" ? "graph" : null })}
            noteId={sp.get("note")} setNote={(id) => patch({ note: id })} />
        : invite)}
      {tab === "commitments" && (s.consentAt ? <CommitmentsTab people={people.data?.items ?? []} topics={topics.data?.items ?? []} onTag={openTag} /> : invite)}
      {tab === "tasks" && <MemoryTasksTab state={s} />}
    </div>
  );
}

/** The facts of the memory (R6, design §3.3): records with source and date,
 * edit, delete, add, search and clear all with confirmation. */
function FactsTab() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Memory | "new" | null>(null);
  const [clearing, setClearing] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: keys.memories(q), queryFn: () => api.get<List<Memory>>(`/api/v1/memories?limit=200&q=${encodeURIComponent(q)}`) });
  const inv = () => qc.invalidateQueries({ queryKey: ["memories"] });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/api/v1/memories/${id}`), onSuccess: inv, onError: (e) => toast({ kind: "error", title: errorText(t, e) }) });
  const clear = useMutation({ mutationFn: () => api.del("/api/v1/memories", { confirm: "all" }), onSuccess: () => { inv(); setClearing(false); } });
  const lng = intlLocale(i18n.language);
  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", alignItems: "flex-start", marginBottom: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn danger sm" onClick={() => setClearing(true)} disabled={!list.data?.items.length && !q}>{t("memory.clear")}</button>
          <button className="btn primary sm" onClick={() => setEditing("new")}><Icon name="plus" size={15} />{t("memory.add")}</button>
        </div>
      </div>
      <div className="search" style={{ maxWidth: 420, marginBottom: 12 }}>
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("memory.search")} aria-label={t("memory.search")} />
      </div>
      {list.data?.items.length === 0 && <Empty icon="brain" title={q ? t("memory.notFound") : t("memory.empty")}>{!q && t("memory.emptyHint")}</Empty>}
      {list.data?.items.map((m) => (
        <div className="memrow" key={m.id}>
          <div>
            {m.pinned && <Icon name="pin" size={14} className="muted" />} {m.text}
            <div className="small muted">{m.source === "agent" ? t("memory.fromChat") : t("memory.manual")}</div>
          </div>
          <span className="small muted when">{dateTime(m.updatedAt, lng)}</span>
          <span className="row" style={{ gap: 4 }}>
            <button className="iconbtn" aria-label={t("common.edit")} onClick={() => setEditing(m)}><Icon name="edit" size={16} /></button>
            <button className="iconbtn" aria-label={t("common.delete")} onClick={() => del.mutate(m.id)}><Icon name="trash" size={16} /></button>
          </span>
        </div>
      ))}
      {editing && <EditMemory record={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {clearing && (
        <Modal title={t("memory.clearTitle")} onClose={() => setClearing(false)} footer={<>
          <button className="btn ghost" onClick={() => setClearing(false)}>{t("common.cancel")}</button>
          <button className="btn danger" disabled={clear.isPending} onClick={() => clear.mutate()}>{t("memory.clearConfirm")}</button>
        </>}>
          <p style={{ marginTop: 0 }}>{t("memory.clearText")}</p>
        </Modal>
      )}
    </>
  );
}

function EditMemory({ record, onClose }: { record: Memory | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [text, setText] = useState(record?.text ?? "");
  const [pinned, setPinned] = useState(record?.pinned ?? false);
  const save = useMutation({
    mutationFn: () => (record ? api.patch(`/api/v1/memories/${record.id}`, { text, pinned }) : api.post("/api/v1/memories", { text, pinned })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memories"] }); onClose(); },
  });
  return (
    <Modal title={record ? t("memory.editTitle") : t("memory.add")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!text.trim() || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      <textarea className="inp" rows={4} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} aria-label={t("memory.text")} />
      <label className="switch" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> {t("memory.pinned")}
      </label>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}
