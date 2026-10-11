import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { keys } from "../../api/queries";
import type { CommTag, Commitment } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { Icon } from "../../components/Icon";
import { Empty, useToast } from "../../components/ui";
import { TagChip, dueText } from "./tags";

type Bucket = "overdue" | "today" | "week" | "later" | "undated" | "closed";
const BUCKETS: Bucket[] = ["overdue", "today", "week", "later", "undated", "closed"];

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Groups of the list (design §3.6); called in a query function — it reads the clock. */
function bucketOf(c: Commitment, now: Date): Bucket {
  if (c.state !== "open") return "closed";
  if (!c.due) return "undated";
  const today = day(now);
  if (c.due < today) return "overdue";
  if (c.due === today) return "today";
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + ((7 - now.getDay()) % 7));
  return c.due <= day(sunday) ? "week" : "later";
}

type Grouped = { c: Commitment; bucket: Bucket };

/** The commitments of a filter, each with its group of the list. */
export function useCommitments(query: string, enabled = true) {
  return useQuery({
    queryKey: keys.commitments(query),
    enabled,
    queryFn: async (): Promise<Grouped[]> => {
      const r = await api.get<{ items: Commitment[] }>(`/api/v1/commitments?${query}`);
      const now = new Date();
      return r.items.map((c) => ({ c, bucket: bucketOf(c, now) }));
    },
  });
}

/** The list by due day (design §3.6): a heading with the count over each
 * group that is not empty; the closed ones go without a heading. */
export function CommitmentGroups({ items, row }: { items: Grouped[]; row: (c: Commitment) => ReactNode }) {
  const { t } = useTranslation();
  return BUCKETS.map((b) => {
    const rows = items.filter((x) => x.bucket === b);
    if (rows.length === 0) return null;
    return (
      <section key={b}>
        {b !== "closed" && <div className={`cmgroup${b === "overdue" ? " late" : ""}`}>{t(`comm.cm.group.${b}`)} · {rows.length}</div>}
        {rows.map(({ c }) => row(c))}
      </section>
    );
  });
}

export function useCommitmentActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; state?: Commitment["state"]; due?: string | null }) => api.patch<Commitment>(`/api/v1/commitments/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commitments"] });
      qc.invalidateQueries({ queryKey: ["comm"] });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
}

/** One commitment (R11, R12): the checkbox closes and returns it; a closed
 * one says who closed it. */
export function CommitmentRow({ c, onTag, layout = "full" }: { c: Commitment; onTag?: (tag: CommTag) => void; layout?: "full" | "compact" | "narrow" }) {
  // full: links and tags beside the text; compact: the text only; narrow: the tags under the text
  const compact = layout !== "full", tagsBelow = layout === "narrow";
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const act = useCommitmentActions();
  const [editing, setEditing] = useState(false);
  const done = c.state !== "open";
  return (
    <div className={`cm${done ? " done" : ""}`}>
      <button type="button" className="cm-box" role="checkbox" aria-checked={done} aria-label={done ? t("comm.cm.reopen") : t("comm.cm.close")}
        disabled={act.isPending} onClick={() => act.mutate({ id: c.id, state: done ? "open" : "done" })}>
        {done && <Icon name="check" size={12} />}
      </button>
      <span className="cm-b">
        <span className="dir">{t(`comm.cm.${c.direction}`)}</span>
        <span className="what">{c.text}</span>
        {c.state === "cancelled" && <span className="auto">{t("comm.cm.cancelled")}</span>}
        {c.state === "done" && c.closedBy === "collector" && (
          <span className="auto">{t("comm.cm.auto")}
            {c.closeBasisUrl && <> · <a href={c.closeBasisUrl} target="_blank" rel="noreferrer">{t("comm.source")}</a></>}
          </span>
        )}
        {c.state === "done" && c.closedBy === "agent" && <span className="auto">{t("comm.cm.byAgent")}</span>}
        {tagsBelow && (c.person || c.topics.length > 0) && (
          <span className="tgs who">
            {c.person && <TagChip tag={c.person} onClick={onTag && (() => onTag(c.person!))} />}
            {c.topics.map((x) => <TagChip key={x.id} tag={x} onClick={onTag && (() => onTag(x))} />)}
          </span>
        )}
        {!compact && (
          <span className="links">
            <Link to={`/memory?tab=comm&note=${c.noteId}`}>{c.noteTitle}</Link>
            {c.basisUrl && <a href={c.basisUrl} target="_blank" rel="noreferrer">{t("comm.source")} <Icon name="ext" size={11} /></a>}
            {c.state === "open" && <button type="button" className="linkish" onClick={() => act.mutate({ id: c.id, state: "cancelled" })}>{t("comm.cm.cancel")}</button>}
          </span>
        )}
      </span>
      {!compact && (
        <span className="tgs">
          {c.person && <TagChip tag={c.person} onClick={onTag && (() => onTag(c.person!))} />}
          {c.topics.map((x) => <TagChip key={x.id} tag={x} onClick={onTag && (() => onTag(x))} />)}
        </span>
      )}
      {editing ? (
        <input type="date" className="inp due-inp" defaultValue={c.due ?? ""} autoFocus aria-label={t("comm.cm.due")}
          onBlur={(e) => { setEditing(false); if ((e.target.value || null) !== c.due) act.mutate({ id: c.id, due: e.target.value || null }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }} />
      ) : (
        <button type="button" className={`when${c.overdue ? " late" : ""}`} onClick={() => setEditing(true)} title={t("comm.cm.changeDue")}>
          {c.due ? dueText(c.due, lng) : t("comm.cm.noDue")}
        </button>
      )}
    </div>
  );
}

/** The Commitments tab (design §3.6): by due day, with the direction and the
 * state as segments. */
export function CommitmentsTab({ people, topics, onTag }: { people: CommTag[]; topics: CommTag[]; onTag: (tag: CommTag) => void }) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<"" | "mine" | "theirs">("");
  const [state, setState] = useState<"open" | "closed">("open");
  const [person, setPerson] = useState("");
  const [topic, setTopic] = useState("");
  const query = new URLSearchParams({ state });
  if (direction) query.set("direction", direction);
  if (person) query.set("person", person);
  if (topic) query.set("topic", topic);
  const list = useCommitments(query.toString());
  const items = list.data ?? [];
  return (
    <>
      <div className="cbar">
        <div className="mini-seg">
          {(["", "mine", "theirs"] as const).map((d) => (
            <button key={d || "all"} className={direction === d ? "on" : ""} aria-pressed={direction === d} onClick={() => setDirection(d)}>{t(`comm.cm.filter.${d || "all"}`)}</button>
          ))}
        </div>
        <div className="mini-seg">
          {(["open", "closed"] as const).map((s) => (
            <button key={s} className={state === s ? "on" : ""} aria-pressed={state === s} onClick={() => setState(s)}>{t(`comm.cm.filter.${s}`)}</button>
          ))}
        </div>
        <select className="sel" value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t("comm.person")}>
          <option value="">{t("comm.person")}</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select className="sel" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={t("comm.topic")}>
          <option value="">{t("comm.topic")}</option>
          {topics.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {list.error && <div className="err-text">{errorText(t, list.error)}</div>}
      {list.data && items.length === 0 && <Empty icon="check" title={t(state === "open" ? "comm.cm.empty" : "comm.cm.emptyClosed")} />}
      <CommitmentGroups items={items} row={(c) => <CommitmentRow key={c.id} c={c} onTag={onTag} />} />
    </>
  );
}
