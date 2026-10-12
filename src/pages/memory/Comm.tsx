import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { keys } from "../../api/queries";
import type { CommGraph, CommNote, CommState, CommTag, List } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { Empty, Icon, Modal, useToast } from "@green-on-grey/ui-kit";
import { CommitmentRow } from "./Commitments";
import { Graph, type Picked } from "./Graph";
import { TagChip, noteWhen, sourceIcon, sourceName } from "./tags";

export interface CommFilter {
  q: string;
  person: string;
  topic: string;
  source: string;
  period: "7" | "30" | "90" | "all";
}

const PERIODS = ["7", "30", "90", "all"] as const;

/** The parameters of a query; called in query functions — the period reads the clock. */
function params(f: CommFilter, extra?: Record<string, string>): string {
  const p = new URLSearchParams(extra);
  if (f.q) p.set("q", f.q);
  if (f.person && !p.has("person")) p.set("person", f.person);
  if (f.topic && !p.has("topic")) p.set("topic", f.topic);
  if (f.source) p.set("source", f.source);
  if (f.period !== "all") p.set("from", new Date(Date.now() - Number(f.period) * 86_400_000).toISOString());
  return p.toString();
}

/** The Communications tab (R18, R19, design §3.3–3.5): the table and the
 * graph are two views of one filtered set; a note opens in a side panel. */
export function CommTab({ state, filter, setFilter, view, setView, noteId, setNote, people, topics }: {
  state: CommState; filter: CommFilter; setFilter: (patch: Partial<CommFilter>) => void;
  view: "table" | "graph"; setView: (v: "table" | "graph") => void;
  noteId: string | null; setNote: (id: string | null) => void; people: CommTag[]; topics: CommTag[];
}) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const [picked, setPicked] = useState<Picked>(null);
  const [minLinks, setMinLinks] = useState(0);
  const key = JSON.stringify(filter);
  const notes = useQuery({
    queryKey: keys.commNotes(key), enabled: view === "table",
    queryFn: () => api.get<List<CommNote>>(`/api/v1/comm/notes?limit=100&${params(filter)}`),
  });
  const graph = useQuery({
    queryKey: keys.commGraph(`${key}:${minLinks}`), enabled: view === "graph",
    queryFn: () => api.get<CommGraph>(`/api/v1/comm/graph?minLinks=${minLinks}&${params(filter)}`),
  });
  const pickTag = (tag: CommTag) => setFilter(tag.kind === "person" ? { person: tag.id } : { topic: tag.id });
  const active = [
    filter.person && people.find((p) => p.id === filter.person),
    filter.topic && topics.find((p) => p.id === filter.topic),
  ].filter(Boolean) as CommTag[];
  const filtered = Boolean(filter.q || filter.person || filter.topic || filter.source);
  const reset = () => setFilter({ q: "", person: "", topic: "", source: "" });

  return (
    <>
      <CollectBanner state={state} />
      <div className="cbar">
        <div className="search cm-search">
          <Icon name="search" />
          <input value={filter.q} onChange={(e) => setFilter({ q: e.target.value })} placeholder={t("comm.search")} aria-label={t("comm.search")} />
        </div>
        <select className="sel" value={filter.person} onChange={(e) => setFilter({ person: e.target.value })} aria-label={t("comm.person")}>
          <option value="">{t("comm.person")}</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select className="sel" value={filter.topic} onChange={(e) => setFilter({ topic: e.target.value })} aria-label={t("comm.topic")}>
          <option value="">{t("comm.topic")}</option>
          {topics.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {state.sources.length > 1 && (
          <select className="sel" value={filter.source} onChange={(e) => setFilter({ source: e.target.value })} aria-label={t("comm.sourceFilter")}>
            <option value="">{t("comm.sourceFilter")}</option>
            {state.sources.map((s) => <option key={s.itemId + s.source} value={s.source}>{sourceName(t, s.source)}</option>)}
          </select>
        )}
        <select className="sel" value={filter.period} onChange={(e) => setFilter({ period: e.target.value as CommFilter["period"] })} aria-label={t("comm.period.label")}>
          {PERIODS.map((p) => <option key={p} value={p}>{p === "all" ? t("comm.period.all") : t("comm.period.days", { count: Number(p) })}</option>)}
        </select>
        <div className="mini-seg view-seg" role="group" aria-label={t("comm.view.label")}>
          <button className={view === "table" ? "on" : ""} aria-pressed={view === "table"} onClick={() => setView("table")}><Icon name="table" size={15} /><span>{t("comm.view.table")}</span></button>
          <button className={view === "graph" ? "on" : ""} aria-pressed={view === "graph"} onClick={() => setView("graph")}><Icon name="graph" size={15} /><span>{t("comm.view.graph")}</span></button>
        </div>
      </div>
      <div className="tgs" style={{ marginBottom: 12, alignItems: "center" }}>
        {active.map((tag) => (
          <TagChip key={tag.id} tag={tag} removeLabel={t("comm.removeFilter")} onRemove={() => setFilter(tag.kind === "person" ? { person: "" } : { topic: "" })} />
        ))}
        {view === "table" && notes.data && <span className="small muted">{t("comm.count", { count: notes.data.items.length })}{notes.data.nextCursor ? "+" : ""}</span>}
        {view === "graph" && graph.data && <span className="small muted">{t("comm.graph.shown", { shown: graph.data.nodes.length, total: graph.data.totalNodes })}</span>}
      </div>

      {view === "table" && (
        <div className={noteId ? "split" : undefined}>
          <div>
            {notes.error && <div className="err-text">{errorText(t, notes.error)} <button className="btn sm" onClick={() => notes.refetch()}>{t("comm.retry")}</button></div>}
            {notes.isLoading && <div className="skeleton-rows" aria-hidden="true"><i /><i /><i /><i /></div>}
            {notes.data?.items.length === 0 && (
              <Empty icon="brain" title={filtered ? t("comm.notFound") : t("comm.empty")}>
                {filtered ? <div style={{ marginTop: 10 }}><button className="btn sm" onClick={reset}>{t("comm.resetFilters")}</button></div> : t("comm.emptyHint")}
              </Empty>
            )}
            {(notes.data?.items.length ?? 0) > 0 && (
              <table className="t comm-t">
                <thead><tr>
                  <th>{t("comm.cols.when")}</th><th>{t("comm.cols.source")}</th><th>{t("comm.people")}</th><th>{t("comm.topics")}</th>
                  <th>{t("comm.cols.summary")}</th><th title={t("comm.cols.openTitle")}>{t("comm.cols.open")}</th>
                </tr></thead>
                <tbody>
                  {notes.data!.items.map((n) => (
                    <tr key={n.id} className={noteId === n.id ? "sel-row" : ""} onClick={() => setNote(n.id)}>
                      <td className="small nowrap" data-l={t("comm.cols.when")}>{noteWhen(n.lastAt, n.timePrecision, lng)}</td>
                      <td className="small nowrap" data-l={t("comm.cols.source")}><Icon name={sourceIcon(n.source)} size={14} /> {sourceName(t, n.source)}</td>
                      <td><div className="tgs">{n.people.map((p) => <TagChip key={p.id} tag={p} onClick={() => pickTag(p)} />)}</div></td>
                      <td><div className="tgs">{n.topics.map((p) => <TagChip key={p.id} tag={p} onClick={() => pickTag(p)} />)}</div></td>
                      <td><button type="button" className="note-open" onClick={() => setNote(n.id)}><b>{n.title}</b></button><div className="ex">{n.excerpt}</div></td>
                      <td>{n.openCommitments > 0 && <span className="due" title={t("comm.cols.openTitle")}>{n.openCommitments}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {noteId && <NotePanel id={noteId} onClose={() => setNote(null)} onTag={pickTag} />}
        </div>
      )}

      {view === "graph" && (
        <div className={picked ? "split" : undefined}>
          <div>
            {graph.error && <div className="err-text">{errorText(t, graph.error)}</div>}
            {graph.isLoading && <div className="gwrap loading">{t("common.loading")}</div>}
            {graph.data && graph.data.nodes.length < 2 && (
              <Empty icon="graph" title={t("comm.graph.few")}><div style={{ marginTop: 10 }}><button className="btn sm" onClick={() => setView("table")}>{t("comm.view.table")}</button></div></Empty>
            )}
            {graph.data && graph.data.nodes.length >= 2 && <Graph graph={graph.data} picked={picked} onPick={setPicked} />}
            <label className="gctl">
              {t("comm.graph.minLinks", { count: minLinks })}
              <input type="range" min={0} max={10} value={minLinks} onChange={(e) => setMinLinks(Number(e.target.value))} />
            </label>
          </div>
          {picked && graph.data && (
            <PickedPanel picked={picked} graph={graph.data} filter={filter} onClose={() => setPicked(null)}
              onNote={(id) => { setView("table"); setNote(id); }}
              onAll={(tags) => { setFilter(Object.assign({}, ...tags.map((x) => (x.kind === "person" ? { person: x.id } : { topic: x.id })))); setView("table"); }} />
          )}
        </div>
      )}
    </>
  );
}

/** What the collection is doing, above the data (design §3.7). */
function CollectBanner({ state }: { state: CommState }) {
  const { t } = useTranslation();
  const c = state.collect;
  if (c.backfill) {
    const pct = c.backfill.total ? Math.round((c.backfill.done / c.backfill.total) * 100) : 0;
    return (
      <div className="nbar info" role="status"><Icon name="repeat" />
        <span className="grow">{t("comm.banner.backfill", { done: c.backfill.done, total: c.backfill.total })}</span>
        <div className="meter"><i style={{ width: `${pct}%` }} /></div>
      </div>
    );
  }
  if (c.status === "paused" && c.pauseKind === "source_access") {
    return <div className="nbar amber" role="status"><Icon name="alert" /><span className="grow"><b>{t("comm.banner.paused")}</b> {t("comm.banner.access")}</span><Link className="btn sm" to="/connections">{t("nav.connections")}</Link></div>;
  }
  if (c.status === "paused" && c.pauseKind === "budget") {
    return <div className="nbar amber" role="status"><Icon name="alert" /><span className="grow"><b>{t("comm.banner.paused")}</b> {t("comm.banner.budget")}</span></div>;
  }
  if (c.status === "paused") {
    return <div className="nbar amber" role="status"><Icon name="pause" /><span className="grow"><b>{t("comm.banner.paused")}</b> {t("comm.banner.byUser")}</span></div>;
  }
  if (c.status === "off" && state.counts.notes > 0) {
    return <div className="nbar amber" role="status"><Icon name="alert" /><span className="grow">{t("comm.banner.off", { days: state.retentionDays })}</span></div>;
  }
  return null;
}

/** The notes of a node or of an edge of the graph (design §3.5). */
function PickedPanel({ picked, graph, filter, onClose, onNote, onAll }: {
  picked: NonNullable<Picked>; graph: CommGraph; filter: CommFilter; onClose: () => void;
  onNote: (id: string) => void; onAll: (tags: CommTag[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const ids = picked.kind === "node" ? [picked.id] : [picked.a, picked.b];
  const tags = ids.map((id) => graph.nodes.find((n) => n.id === id)).filter(Boolean) as CommGraph["nodes"];
  const extra: Record<string, string> = {};
  for (const n of tags) extra[n.kind] = n.id;
  const twoOfAKind = tags.length === 2 && tags[0].kind === tags[1].kind;
  const notes = useQuery({
    queryKey: keys.commNotes(JSON.stringify({ filter, ids })),
    queryFn: async () => {
      const r = await api.get<List<CommNote>>(`/api/v1/comm/notes?limit=100&${params(filter, extra)}`);
      // two people or two topics: the API filters by one of each kind, the other is matched here
      if (!twoOfAKind) return r.items;
      const other = tags[0].id;
      return r.items.filter((n) => [...n.people, ...n.topics].some((x) => x.id === other));
    },
  });
  const linked = picked.kind === "node"
    ? graph.edges.filter((e) => e.a === picked.id || e.b === picked.id).map((e) => graph.nodes.find((n) => n.id === (e.a === picked.id ? e.b : e.a))!).filter(Boolean)
    : [];
  return (
    <aside className="panel gpanel" aria-label={t("comm.graph.panel")}>
      <div className="panel-h">
        <div className="tgs grow">{tags.map((n) => <TagChip key={n.id} tag={n} />)}</div>
        <button className="iconbtn" onClick={onClose} aria-label={t("common.close")}><Icon name="x" size={16} /></button>
      </div>
      {linked.length > 0 && <><div className="lab">{t("comm.graph.linked")}</div><div className="tgs">{linked.map((n) => <TagChip key={n.id} tag={n} />)}</div></>}
      <div className="lab">{t("comm.notes")}{notes.data ? ` · ${notes.data.length}` : ""}</div>
      {notes.data?.slice(0, 8).map((n) => (
        <button type="button" className="mrow" key={n.id} onClick={() => onNote(n.id)}>
          <span className="small muted">{noteWhen(n.lastAt, n.timePrecision, lng)} · {sourceName(t, n.source)}</span>
          <b>{n.title}</b>
          <span className="small t2">{n.excerpt}</span>
        </button>
      ))}
      {!twoOfAKind && (notes.data?.length ?? 0) > 0 && <button type="button" className="linkish" style={{ marginTop: 10 }} onClick={() => onAll(tags)}>{t("comm.graph.showAll", { count: notes.data!.length })}</button>}
    </aside>
  );
}

/** A note in the side panel (design §3.4): the summary, people and topics,
 * commitments and the links to the source messages; editing and deleting. */
function NotePanel({ id, onClose, onTag }: { id: string; onClose: () => void; onTag: (tag: CommTag) => void }) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const qc = useQueryClient();
  const toast = useToast();
  const note = useQuery({ queryKey: keys.commNote(id), queryFn: () => api.get<CommNote>(`/api/v1/comm/notes/${id}`), retry: false });
  const [edit, setEdit] = useState<{ title: string; summary: string } | null>(null);
  const [topic, setTopic] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [allSources, setAllSources] = useState(false);
  const inv = () => qc.invalidateQueries({ queryKey: ["comm"] });
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch<CommNote>(`/api/v1/comm/notes/${id}`, body), onSuccess: () => { inv(); setEdit(null); setTopic(""); }, onError: fail });
  const del = useMutation({ mutationFn: () => api.del(`/api/v1/comm/notes/${id}`), onSuccess: () => { inv(); onClose(); }, onError: fail });
  const n = note.data;
  return (
    <aside className="panel note-panel" aria-label={t("comm.note.aria")}>
      {note.error && <><div className="err-text">{errorText(t, note.error)}</div><button className="btn sm" onClick={onClose}>{t("common.close")}</button></>}
      {n && (
        <>
          <div className="panel-h">
            <div className="grow">
              {edit ? <input className="inp" value={edit.title} maxLength={200} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label={t("comm.note.title")} />
                : <h4>{n.title}</h4>}
              <div className="small muted"><Icon name={sourceIcon(n.source)} size={13} /> {sourceName(t, n.source)} · {noteWhen(n.lastAt, n.timePrecision, lng)} · {t("comm.note.messages", { count: n.messageCount })}</div>
            </div>
            {!edit && <button className="iconbtn" onClick={() => setEdit({ title: n.title, summary: n.summary ?? "" })} aria-label={t("common.edit")}><Icon name="edit" size={16} /></button>}
            <button className="iconbtn" onClick={() => setDeleting(true)} aria-label={t("common.delete")}><Icon name="trash" size={16} /></button>
            <button className="iconbtn" onClick={onClose} aria-label={t("common.close")}><Icon name="x" size={16} /></button>
          </div>

          <div className="lab">{t("comm.note.tags")}</div>
          <div className="tgs">
            {[...n.people, ...n.topics].map((tag) => (
              <TagChip key={tag.id} tag={tag} onClick={() => onTag(tag)} removeLabel={t("comm.note.removeTag")}
                onRemove={edit ? () => patch.mutate({ removeTags: [{ kind: tag.kind, id: tag.id }] }) : undefined} />
            ))}
          </div>
          {edit && (
            <form className="row" style={{ marginTop: 8, gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (topic.trim()) patch.mutate({ addTags: [{ kind: "topic", name: topic.trim() }] }); }}>
              <input className="inp" style={{ flex: 1 }} value={topic} maxLength={80} onChange={(e) => setTopic(e.target.value)} placeholder={t("comm.note.addTopic")} aria-label={t("comm.note.addTopic")} />
              <button className="btn sm" disabled={!topic.trim() || patch.isPending}><Icon name="plus" size={14} /></button>
            </form>
          )}

          <div className="lab">{t("comm.cols.summary")}</div>
          {edit ? (
            <>
              <textarea className="inp" rows={8} maxLength={4000} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} aria-label={t("comm.cols.summary")} />
              <div className="small muted" style={{ margin: "4px 0 8px" }}>{t("comm.note.editHint")}</div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary sm" disabled={!edit.title.trim() || !edit.summary.trim() || patch.isPending}
                  onClick={() => patch.mutate({ ...(edit.title !== n.title ? { title: edit.title } : {}), ...(edit.summary !== n.summary ? { summary: edit.summary } : {}) })}>{t("common.save")}</button>
                <button className="btn ghost sm" onClick={() => setEdit(null)}>{t("common.cancel")}</button>
              </div>
            </>
          ) : <div className="note-text">{n.summary}</div>}
          {n.appended?.map((a) => (
            <div className="added" key={a.at}><div className="small muted">{t("comm.note.appended")} · {noteWhen(a.at, "minute", lng)}</div>{a.text}</div>
          ))}

          {(n.commitments?.length ?? 0) > 0 && <><div className="lab">{t("comm.tabs.commitments")}</div>{n.commitments!.map((c) => <CommitmentRow key={c.id} c={c} layout="compact" />)}</>}

          <div className="lab">{t("comm.note.sources")}</div>
          {(allSources ? n.messages! : n.messages!.slice(0, 3)).map((m) => (
            <div className="srcl" key={m.id}>
              <Icon name={sourceIcon(n.source)} size={14} />
              <span>{m.author || "—"}{m.sentAt ? ` · ${noteWhen(m.sentAt, n.timePrecision, lng)}` : ""}</span>
              {m.url && <a href={m.url} target="_blank" rel="noreferrer">{t("comm.note.open")} <Icon name="ext" size={12} /></a>}
            </div>
          ))}
          {!allSources && n.messages!.length > 3 && <button type="button" className="linkish" onClick={() => setAllSources(true)}>{t("comm.note.more", { count: n.messages!.length - 3 })}</button>}
        </>
      )}
      {deleting && (
        <Modal title={t("comm.note.deleteTitle")} onClose={() => setDeleting(false)} footer={<>
          <button className="btn ghost" onClick={() => setDeleting(false)}>{t("common.cancel")}</button>
          <button className="btn danger" disabled={del.isPending} onClick={() => del.mutate()}>{t("common.delete")}</button>
        </>}>
          <p style={{ marginTop: 0 }}>{t("comm.note.deleteText")}</p>
        </Modal>
      )}
    </aside>
  );
}
