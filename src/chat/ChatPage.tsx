import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiUrl } from "../api/base";
import { api, ApiError } from "../api/client";
import { keys, useAgent } from "../api/queries";
import type { Confirmation, Conversation, List, Message, ToolStep } from "../api/types";
import { useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { intlLocale } from "../lib/i18n";
import { llmErrorText, transientLLMError } from "../lib/llm";
import { relativeTime } from "../lib/format";
import { useEvent } from "../lib/sse";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { AgentIcon, Modal, useToast } from "../components/ui";
import { AgentMenu } from "./AgentMenu";
import { useRecorder } from "./useRecorder";

/** The chat with the personal agent (R30, design §3.2): the main
 * conversation and topics on the left; the conversation on the right with
 * channel marks, folded tool steps, model errors with Retry, attachments and
 * voice input checked before sending. */
export function ChatPage() {
  const { t } = useTranslation();
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
  const active = useQuery({
    queryKey: keys.conversations(false),
    queryFn: () => api.get<{ items: Conversation[] }>("/api/v1/conversations?archived=false"),
  });
  const archived = useQuery({
    queryKey: keys.conversations(true),
    queryFn: () => api.get<{ items: Conversation[] }>("/api/v1/conversations?archived=true"),
  });
  const main = active.data?.items.find((c) => c.kind === "main");
  const all = [...(active.data?.items ?? []), ...(archived.data?.items ?? [])];
  const current = routeId ? all.find((c) => c.id === routeId) : main;
  const [creating, setCreating] = useState(false);

  useEffect(() => setSideOpen(false), [routeId]);

  return (
    <div className="nb-app">
      <Sidebar open={sideOpen} main={main} topics={(active.data?.items ?? []).filter((c) => c.kind === "topic")}
        archived={archived.data?.items ?? []} currentId={current?.id} onNew={() => setCreating(true)}
        onPick={(c) => navigate(c.kind === "main" ? "/" : `/chat/${c.id}`)} />
      {current ? (
        <Conversation key={current.id} conv={current} onMenu={() => setSideOpen((v) => !v)} />
      ) : (
        <div className="nb-chat"><div className="loading">{t("common.loading")}</div></div>
      )}
      {creating && <NewTopic onClose={() => setCreating(false)} onCreated={(c) => navigate(`/chat/${c.id}`)} />}
    </div>
  );
}

function Sidebar({ open, main, topics, archived, currentId, onNew, onPick }: {
  open: boolean; main?: Conversation; topics: Conversation[]; archived: Conversation[]; currentId?: string;
  onNew: () => void; onPick: (c: Conversation) => void;
}) {
  const { t, i18n } = useTranslation();
  const when = (c: Conversation) => relativeTime(c.lastMessageAt ?? c.createdAt, intlLocale(i18n.language));
  const item = (c: Conversation, cls = "") => (
    <button key={c.id} className={`it${c.id === currentId ? " on" : ""}${cls}`} onClick={() => onPick(c)} aria-current={c.id === currentId}>
      <Icon name={c.source === "email" ? "mail" : "msg2"} size={16} />
      <span className="nm">{c.kind === "main" ? t("chat.main") : c.title}</span>
      {c.unreadCount > 0 && <span className="unread" aria-label={t("chat.unread", { count: c.unreadCount })}>{c.unreadCount}</span>}
      <span className="sub">{when(c)}</span>
    </button>
  );
  return (
    <nav className={`nb-side${open ? " open" : ""}`} aria-label={t("chat.conversations")}>
      <button className="btn sm" style={{ width: "100%", justifyContent: "center" }} onClick={onNew}>
        <Icon name="plus" size={15} />{t("chat.newTopic")}
      </button>
      <div className="h">{t("chat.conversation")}</div>
      {main && item(main)}
      <div className="h">{t("chat.topics")}</div>
      {topics.length === 0 && <div className="small muted" style={{ padding: "0 10px" }}>{t("chat.noTopics")}</div>}
      {topics.map((c) => item(c))}
      {archived.length > 0 && <div className="h">{t("chat.archive")}</div>}
      {archived.map((c) => item(c, " arch"))}
    </nav>
  );
}

function NewTopic({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Conversation) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<Conversation>("/api/v1/conversations", { title: title.trim() }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onClose();
      onCreated(c);
    },
  });
  return (
    <Modal title={t("chat.newTopic")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>{t("common.create")}</button>
    </>}>
      <div className="field">
        <label htmlFor="topic-title">{t("chat.topicTitle")}</label>
        <input id="topic-title" className="inp" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && title.trim() && create.mutate()} />
        <div className="hint">{t("chat.topicHint")}</div>
      </div>
      {create.error && <div className="err-text">{errorText(t, create.error)}</div>}
    </Modal>
  );
}

function Conversation({ conv, onMenu }: { conv: Conversation; onMenu: () => void }) {
  const { t } = useTranslation();
  const { config } = useSession();
  const agent = useAgent();
  const qc = useQueryClient();
  const toast = useToast();
  const [agentMenu, setAgentMenu] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Message>>({});
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ id: string; fileName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRecorder();
  const readOnly = conv.archivedAt !== null;

  // UI-04: opening a mail topic resets its unread counter.
  useEffect(() => {
    if (conv.unreadCount > 0) {
      void api.post(`/api/v1/conversations/${conv.id}/read`).then(() => qc.invalidateQueries({ queryKey: ["conversations"] })).catch(() => undefined);
    }
  }, [conv.id, conv.unreadCount, qc]);

  // R9: calls of tools that change data wait for the user in mail topics.
  const confirmKey = ["confirmations", conv.id];
  const confirmations = useQuery({
    queryKey: confirmKey, enabled: conv.writesRequireConfirmation,
    queryFn: () => api.get<{ items: Confirmation[] }>(`/api/v1/confirmations?conversationId=${conv.id}`),
  });
  const refreshConfirmations = (d: { conversationId: string }) => {
    if (d.conversationId === conv.id) qc.invalidateQueries({ queryKey: confirmKey });
  };
  useEvent("confirmation.created", refreshConfirmations);
  useEvent("confirmation.resolved", refreshConfirmations);
  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) => api.post(`/api/v1/confirmations/${id}:${action}`),
    onSettled: () => qc.invalidateQueries({ queryKey: confirmKey }),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });

  const history = useInfiniteQuery({
    queryKey: keys.messages(conv.id),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api.get<List<Message>>(`/api/v1/conversations/${conv.id}/messages?limit=50${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const messages = useMemo(() => {
    const byId = new Map<string, Message>();
    for (const p of history.data?.pages ?? []) for (const m of p.items) byId.set(m.id, m);
    for (const m of Object.values(overrides)) if (m.conversationId === conv.id) byId.set(m.id, { ...byId.get(m.id), ...m });
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.role === "user" ? -1 : 1));
  }, [history.data, overrides, conv.id]);

  const streaming = messages.some((m) => m.role === "assistant" && (m.status === "streaming" || m.status === "pending"));
  useEffect(() => {
    if (!streaming) setBusy(false);
  }, [streaming]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.text.length, messages[messages.length - 1]?.toolSteps.length]);

  const put = (m: Partial<Message> & { id: string }) =>
    setOverrides((o) => ({ ...o, [m.id]: { ...(o[m.id] ?? ({} as Message)), ...m } as Message }));

  useEvent("message.created", (m: Message) => {
    if (m.conversationId === conv.id) put(m);
  });
  useEvent("message.delta", (d: { messageId: string; conversationId: string; delta: string }) => {
    if (d.conversationId !== conv.id) return;
    setOverrides((o) => {
      const cur = o[d.messageId] ?? messages.find((x) => x.id === d.messageId);
      if (!cur) return o;
      return { ...o, [d.messageId]: { ...cur, text: (cur.text ?? "") + d.delta, status: "streaming" } };
    });
  });
  useEvent("tool.step", (d: { messageId: string; conversationId: string; step: ToolStep }) => {
    if (d.conversationId !== conv.id) return;
    setOverrides((o) => {
      const cur = o[d.messageId] ?? messages.find((x) => x.id === d.messageId);
      if (!cur) return o;
      const steps = (cur.toolSteps ?? []).filter((s) => s.id !== d.step.id);
      const idx = (cur.toolSteps ?? []).findIndex((s) => s.id === d.step.id);
      if (idx >= 0) steps.splice(idx, 0, d.step);
      else steps.push(d.step);
      return { ...o, [d.messageId]: { ...cur, toolSteps: steps } };
    });
  });
  useEvent("message.done", (m: Message) => {
    if (m.conversationId !== conv.id) return;
    put(m);
    qc.invalidateQueries({ queryKey: ["conversations"] });
  });

  const send = async (body: string) => {
    const msg = body.trim();
    if ((!msg && pending.length === 0) || busy || readOnly) return;
    setBusy(true);
    try {
      const res = await api.post<{ messageId: string; message: Message }>(`/api/v1/conversations/${conv.id}/messages`, {
        text: msg, attachmentIds: pending.map((p) => p.id),
      });
      put(res.message);
      setText("");
      setPending([]);
      setTranscript(null);
    } catch (e) {
      setBusy(false);
      toast({ kind: "error", title: errorText(t, e) });
    }
  };

  const retry = async (m: Message) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/messages/${m.id}/retry`);
    } catch (e) {
      setBusy(false);
      toast({ kind: "error", title: errorText(t, e) });
    }
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (f.size > config.uploadMaxBytes) {
        toast({ kind: "error", title: t("errors.too_large"), text: f.name });
        continue;
      }
      const form = new FormData();
      form.append("file", f);
      try {
        const a = await api.upload<{ attachmentId: string }>("/api/v1/attachments", form);
        setPending((p) => [...p, { id: a.attachmentId, fileName: f.name }]);
      } catch (e) {
        toast({ kind: "error", title: errorText(t, e), text: f.name });
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const stopAndTranscribe = async () => {
    const blob = await recorder.stop();
    if (!blob) return;
    const form = new FormData();
    form.append("file", blob, "voice.webm");
    try {
      const r = await api.upload<{ text: string }>("/api/v1/transcribe", form);
      if (!r.text) toast({ kind: "error", title: t("chat.voice.notRecognized") });
      else setTranscript(r.text);
    } catch (e) {
      toast({ kind: "error", title: errorText(t, e) });
    }
  };

  const unarchive = useMutation({
    mutationFn: () => api.patch(`/api/v1/conversations/${conv.id}`, { archived: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const a = agent.data;
  return (
    <section className="nb-chat" aria-label={t("chat.title")}>
      <div className="hd">
        <button className="iconbtn show-m" onClick={onMenu} aria-label={t("chat.conversations")}><Icon name="msg2" /></button>
        {a && (
          <button className="agentbtn" onMouseDown={(e) => agentMenu && e.stopPropagation()} onClick={() => setAgentMenu((v) => !v)}
            aria-label={t("agent.menu")} aria-expanded={agentMenu} title={t(`tones.${a.tone}`)}>
            <AgentIcon tone={a.tone} />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <b>{a?.name ?? "…"}</b>
          <div className="small muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="cpu" size={12} />
            {a?.model ? <span className="mono" title={a.model.connection}>{a.model.name}</span> : <span>{t("chat.noModel")}</span>}
          </div>
        </div>
        <span className="spacer" />
        <span className="small muted hide-m">{conv.kind === "main" ? t("chat.mainHint") : <>{conv.source === "email" && <Icon name="mail" size={13} />} {conv.title}</>}</span>
      </div>
      {agentMenu && a && <AgentMenu agent={a} onClose={() => setAgentMenu(false)} />}

      <div className="msgs" ref={listRef} aria-live="polite">
        {history.hasNextPage && (
          <button className="btn ghost sm" style={{ alignSelf: "center" }} disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
            {t("chat.loadOlder")}
          </button>
        )}
        {messages.length === 0 && !history.isLoading && (
          <div className="empty"><div className="ic"><Icon name="spark" /></div><b>{t("chat.emptyTitle", { name: a?.name ?? "Nabu" })}</b>{t("chat.emptyHint")}</div>
        )}
        {messages.map((m) => <MessageView key={m.id} m={m} busy={busy} onRetry={() => retry(m)} />)}
        {(confirmations.data?.items ?? []).map((c) => (
          <div className="confirm" key={c.id} role="group" aria-label={t("chat.confirm.title")}>
            <div className="h"><Icon name="alert" size={16} />{t("chat.confirm.title")}</div>
            <div>{t("chat.confirm.text", { action: c.summary })}</div>
            <pre>{c.argsPreview}</pre>
            <div className="acts">
              <button className="btn sm primary" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: c.id, action: "approve" })}>{t("chat.confirm.approve")}</button>
              <button className="btn sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: c.id, action: "reject" })}>{t("chat.confirm.reject")}</button>
            </div>
          </div>
        ))}
      </div>

      {readOnly ? (
        <div className="composer" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="small muted">{t("chat.archivedHint")}</span>
          <button className="btn sm" onClick={() => unarchive.mutate()}>{t("chat.unarchive")}</button>
        </div>
      ) : transcript !== null ? (
        <div className="transcript" style={{ margin: 10 }}>
          <div className="small muted" style={{ marginBottom: 4 }}>{t("chat.voice.review")}</div>
          <textarea className="inp" rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} aria-label={t("chat.voice.review")} />
          <div className="row2" style={{ marginTop: 8 }}>
            <button className="btn ghost sm" onClick={() => setTranscript(null)}>{t("common.delete")}</button>
            <button className="btn primary sm" disabled={!transcript.trim() || busy} onClick={() => send(transcript)}>{t("chat.send")}</button>
          </div>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="pending-files">
              {pending.map((p) => (
                <span key={p.id} className="chip">
                  <Icon name="clip" size={12} />{p.fileName}
                  <button className="iconbtn" style={{ width: 18, height: 18 }} aria-label={t("common.remove")}
                    onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))}><Icon name="x" size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="composer">
            <button className="iconbtn" aria-label={t("chat.attach")} disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="clip" /></button>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
            {recorder.recording ? (
              <div className="rec-box">{t("chat.voice.recording", { seconds: recorder.seconds })}</div>
            ) : (
              <textarea rows={1} value={text} placeholder={t("chat.placeholder", { name: a?.name ?? "Nabu" })}
                aria-label={t("chat.placeholder", { name: a?.name ?? "Nabu" })} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(text);
                  }
                }} />
            )}
            {config.voice && (
              <button className={`iconbtn${recorder.recording ? " rec" : ""}`} disabled={!recorder.supported}
                aria-label={recorder.recording ? t("chat.voice.stop") : t("chat.voice.hold")}
                title={recorder.supported ? t("chat.voice.hold") : t("chat.voice.unsupported")}
                onPointerDown={(e) => { e.preventDefault(); if (!recorder.recording) recorder.start(); }}
                onPointerUp={() => recorder.recording && stopAndTranscribe()}
                onPointerLeave={() => recorder.recording && stopAndTranscribe()}>
                <Icon name="mic" />
              </button>
            )}
            <button className="iconbtn fill" aria-label={t("chat.send")} disabled={(!text.trim() && pending.length === 0) || busy} onClick={() => send(text)}>
              <Icon name="send" />
            </button>
          </div>
          {recorder.error && <div className="err-text" style={{ padding: "0 12px 8px" }}>{t("chat.voice.micDenied")}</div>}
        </>
      )}
    </section>
  );
}

/** The channel mark of a message (design §1): icon and "Telegram · 09:12". */
function ChannelMark({ m }: { m: Message }) {
  const { t, i18n } = useTranslation();
  const time = new Intl.DateTimeFormat(intlLocale(i18n.language), { hour: "2-digit", minute: "2-digit" }).format(new Date(m.createdAt));
  const ch = m.channel;
  if (ch === "web") return null;
  let icon: Parameters<typeof Icon>[0]["name"] = "msg";
  let label = ch;
  if (ch === "telegram") [icon, label] = ["tg", "Telegram"];
  else if (ch === "vkteams" || ch === "vkws") [icon, label] = ["msg", "VK Teams"];
  else if (ch === "email") [icon, label] = ["mail", t("channels.email")];
  else if (ch.startsWith("task:")) [icon, label] = ["repeat", t("chat.taskMark")];
  else if (ch.startsWith("client:")) [icon, label] = ["plug", ch.slice(7).replace(/^./, (c) => c.toUpperCase())];
  return <div className="chan"><Icon name={icon} size={12} /> {label} · {time}</div>;
}

function stepText(t: (k: string, o?: Record<string, unknown>) => string, s: ToolStep): string {
  const server = s.server === "nabu" ? t(`chat.tools.${s.tool.split("_")[0]}`, { defaultValue: "Nabu" })
    : s.server === "workspace" ? t("chat.tools.space") : s.server;
  const rest = s.summary.includes(" — ") ? s.summary.slice(s.summary.indexOf(" — ") + 3) : s.tool;
  return server ? `${server}: ${rest}` : rest;
}

function MessageView({ m, busy, onRetry }: { m: Message; busy: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const steps = m.toolSteps ?? [];
  const shown = open || steps.length <= 3 ? steps : steps.slice(-2);
  if (m.role === "user") {
    const mail = m.context?.email;
    if (m.context?.confirmation) {
      // the outcome of a confirmation is a note, not words of the user
      return <div className="sysnote">{t(`chat.confirm.${m.context.confirmation.status}`, { action: m.context.confirmation.summary })}</div>;
    }
    return (
      <div className="m u">
        <ChannelMark m={m} />
        {mail && (
          <div className="mailcard">
            <div className="subj"><Icon name="mail" size={14} />{mail.subject || "—"}</div>
            <dl>
              <dt>{t("chat.mail.from")}</dt><dd>{mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from}</dd>
              <dt>{t("chat.mail.to")}</dt><dd>{mail.to.join(", ") || "—"}</dd>
              {mail.cc.length > 0 && <><dt>{t("chat.mail.cc")}</dt><dd>{mail.cc.join(", ")}</dd></>}
            </dl>
            {mail.mode === "web_only" && <div className="small muted" style={{ marginTop: 6 }}>{t("chat.mail.webOnly")}</div>}
            {mail.quoted && <details><summary>{t("chat.mail.quoted")}</summary><pre>{mail.quoted}</pre></details>}
          </div>
        )}
        {m.text && <div className="bub">{m.text}</div>}
        {m.attachments.length > 0 && (
          <div className="atts">
            {m.attachments.map((a) => (
              <a key={a.id} href={apiUrl(`/api/v1/attachments/${a.id}`)}><Icon name="clip" size={12} /> {a.fileName}</a>
            ))}
          </div>
        )}
      </div>
    );
  }
  const waiting = (m.status === "streaming" || m.status === "pending") && !m.text;
  return (
    <div className="m a">
      <ChannelMark m={m} />
      {steps.length > 3 && (
        <button className="tools-fold" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? t("chat.hideSteps") : t("chat.moreSteps", { count: steps.length - 2 })}
        </button>
      )}
      {shown.map((s) => (
        <div key={s.id} className="tool" title={s.summary}>
          <Icon name={s.status === "done" ? "check" : s.status === "error" ? "alert" : "clock"} size={14}
            className={s.status === "done" ? "ok" : s.status === "error" ? "er" : "run"} />
          <span className="tx">{stepText(t, s)}</span>
        </div>
      ))}
      {waiting && <div className="bub"><span className="typing" aria-label={t("chat.typing")}><i /><i /><i /></span></div>}
      {m.text && <div className="bub"><Markdown text={m.text} /></div>}
      {m.status === "failed" && m.errorClass && (
        <div className={`llmerr${transientLLMError(m.errorClass) ? " amber" : ""}`} role="alert" style={{ marginTop: 6 }}>
          <span>{llmErrorText(t, m.errorClass)}</span>
          <div className="row">
            <button className="btn sm" disabled={busy} onClick={onRetry}><Icon name="refresh" size={14} />{t("llm.retry")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
