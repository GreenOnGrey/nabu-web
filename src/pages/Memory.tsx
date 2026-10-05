import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { List, Memory } from "../api/types";
import { errorText } from "../lib/errors";
import { intlLocale } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Modal, useToast } from "../components/ui";

/** Memory (R6, design §3.3): records with source and date, edit, delete,
 * add, search and clear all with confirmation. */
export function MemoryPage() {
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
    <div className="page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{t("memory.title")}</h1>
          <p className="lead">{t("memory.lead")}</p>
        </div>
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
    </div>
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
