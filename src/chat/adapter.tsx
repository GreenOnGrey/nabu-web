import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icon, useToast, type IconName } from "@green-on-grey/ui-kit";
import { tokens, type ChatAttachment, type ChatCommand, type ChatConfirmation, type ChatConversation, type ChatMark, type ChatMessage, type ChatProps,
  type ChatUpload } from "@green-on-grey/ui-kit/chat";
import { apiUrl } from "../api/base";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { Agent, AgentWait, Confirmation, ContextFill, Conversation, List, Message, Skill, Tone, ToolStep } from "../api/types";
import { useSession } from "../app/session";
import { loadOfficePreview } from "./preview";
import { errorText } from "../lib/errors";
import { relativeTime } from "../lib/format";
import { intlLocale } from "../lib/i18n";
import { llmErrorText, transientLLMError } from "../lib/llm";
import { useEvent } from "../lib/sse";
import { DigestCardView } from "./DigestCard";

// The adapter of the chat of Nabu (FTR.NAB.CMN-0005 R12, tech §4): the requests,
// the events and the turning of the answers of the API into the view types of
// the kit. The component of the kit never talks to the server.

/** The channel mark of a message (design §1): icon and "Telegram"; the kit adds the time.
 * A message written on the site has no mark. */
export function channelMark(t: TFunction, m: Pick<Message, "channel">): ChatMark | undefined {
  const ch = m.channel;
  if (ch === "web") return undefined;
  if (ch === "telegram") return { icon: "tg", text: "Telegram" };
  if (ch === "vkteams" || ch === "vkws") return { icon: "msg", text: "VK Teams" };
  if (ch === "email") return { icon: "mail", text: t("channels.email") };
  if (ch.startsWith("task:")) return { icon: "repeat", text: t("chat.taskMark") };
  if (ch.startsWith("client:")) return { icon: "plug", text: ch.slice(7).replace(/^./, (c) => c.toUpperCase()) };
  return { icon: "msg", text: ch };
}

/** The line of a tool step: "server: the first line of the result". */
export function stepText(t: TFunction, s: ToolStep): string {
  const server = s.server === "nabu" ? t(`chat.tools.${s.tool.split("_")[0]}`, { defaultValue: "Nabu" })
    : s.server === "workspace" ? t("chat.tools.space") : s.server;
  const rest = s.summary.includes(" — ") ? s.summary.slice(s.summary.indexOf(" — ") + 3) : s.tool;
  return server ? `${server}: ${rest}` : rest;
}

/** The text of an event of the conversation (FTR.NAB.CHAT-0001 design §3.2). */
export function eventText(t: TFunction, m: Message, lng: string): ChatMessage["event"] {
  const ev = m.event;
  if (!ev) return undefined;
  switch (ev.kind) {
    case "reset":
      return { icon: "undo", text: t("chat.event.reset") };
    case "compact": {
      const text = t("chat.event.compacted", { before: tokens(ev.tokensBefore, lng), after: tokens(ev.tokensAfter, lng) });
      return { icon: "compress", text: ev.auto ? `${text} · ${t("chat.event.auto")}` : text, details: ev.summary || undefined };
    }
    case "model":
      return { icon: "cpu", text: t("chat.event.model", { name: ev.name || ev.model }) };
  }
  return undefined;
}

/** The mark of a message of the user: the skill it called, the voice, the channel. */
function userMark(t: TFunction, m: Message): ChatMark | undefined {
  const ch = channelMark(t, m);
  if (m.skill) return { icon: "spark", text: ch ? `${m.skill} · ${ch.text}` : m.skill };
  if (m.voice) return { icon: "mic", text: ch ? `${ch.text} · ${t("chat.voiceMark")}` : t("chat.voiceMark") };
  return ch;
}

/** A message of the API as the kit draws it. */
export function toChatMessage(t: TFunction, m: Message, wait: AgentWait | null, lng = "en"): ChatMessage {
  const base = { id: m.id, createdAt: m.createdAt, status: m.status };
  if (m.role === "event") return { ...base, role: "event", text: "", event: eventText(t, m, lng) };
  if (m.role === "user") {
    // the outcome of a confirmation is a note, not words of the user
    const done = m.context?.confirmation;
    if (done) return { ...base, role: "note", text: t(`chat.confirm.${done.status}`, { action: done.summary }) };
    const mail = m.context?.email;
    return {
      ...base, role: "user", text: m.text, mark: userMark(t, m),
      attachments: chatAttachments(m),
      wait: wait?.messageId === m.id ? (wait.state === "queued" ? { state: "queued", position: wait.position ?? 0 } : { state: "starting" }) : undefined,
      content: mail && (
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
      ),
    };
  }
  if (m.role === "notice") {
    // FTR.NAB.CHAT-0002 design §3.1: a notice of a product, not words of the agent
    const name = m.clientName ?? m.channel.replace(/^client:/, "");
    return { ...base, role: "assistant", variant: "notice", text: m.text, mark: { icon: "plug", text: name.replace(/^./, (c) => c.toUpperCase()) } };
  }
  const digest = m.card?.type === "digest";
  return {
    ...base, role: "assistant", text: digest ? "" : m.text, mark: channelMark(t, m), hint: m.model ?? undefined,
    steps: (m.toolSteps ?? []).map((s) => ({ id: s.id, text: stepText(t, s), title: s.summary, status: s.status })),
    // FTR.NAB.CMN-0003 tech §3.5: the digest of commitments is drawn instead of the text
    content: digest && m.card ? <DigestCardView card={m.card} /> : undefined,
    // FTR.NAB.CHAT-0001 R33: the files the agent sent
    attachments: chatAttachments(m),
    error: m.status === "failed" && m.errorClass ? { text: llmErrorText(t, m.errorClass), transient: transientLLMError(m.errorClass) } : undefined,
  };
}

/** The files of a message with their type and size: the kit chooses the preview by them (R34). */
function chatAttachments(m: Message): ChatAttachment[] {
  return (m.attachments ?? []).map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, href: apiUrl(attachmentPath(a.id)) }));
}

const attachmentPath = (id: string) => `/api/v1/attachments/${id}`;

/** Loads a file of a message for the preview with the session of the user (FTR.NAB.CHAT-0001 R34). */
export const loadAttachment = (a: ChatAttachment) => api.blob(attachmentPath(a.id));

/** The preview of a document or a spreadsheet of a message (FTR.NAB.CHAT-0003 R13). */
export const loadAttachmentPreview = (a: ChatAttachment) => loadOfficePreview({ attachment: a.id }, a.fileName);

/** A conversation of the API as a row of the list of the kit. */
export function toChatConversation(t: TFunction, c: Conversation, locale: string): ChatConversation {
  const icon: IconName = c.source === "email" ? "mail" : "msg2";
  return {
    id: c.id, icon, group: c.archivedAt !== null ? "archive" : c.kind === "main" ? "main" : "topic",
    title: c.kind === "main" ? t("chat.main") : (c.title ?? ""),
    when: relativeTime(c.lastMessageAt ?? c.createdAt, locale),
    unread: c.unreadCount,
  };
}

/** The active and the archived conversations of the user. */
export function useConversations() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const active = useQuery({
    queryKey: keys.conversations(false),
    queryFn: () => api.get<{ items: Conversation[] }>("/api/v1/conversations?archived=false"),
  });
  const archived = useQuery({
    queryKey: keys.conversations(true),
    queryFn: () => api.get<{ items: Conversation[] }>("/api/v1/conversations?archived=true"),
  });
  const all = useMemo(() => [...(active.data?.items ?? []), ...(archived.data?.items ?? [])], [active.data, archived.data]);
  const locale = intlLocale(i18n.language);
  const rows = useMemo(() => all.map((c) => toChatConversation(t, c, locale)), [all, t, locale]);
  /** Rejects with the text the dialog of a new topic shows. */
  const create = async (title: string): Promise<Conversation> => {
    try {
      const c = await api.post<Conversation>("/api/v1/conversations", { title });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      return c;
    } catch (e) {
      throw new Error(errorText(t, e), { cause: e });
    }
  };
  return { all, rows, main: active.data?.items.find((c) => c.kind === "main"), create };
}

/** The changes of the agent of the user (R31; FTR.NAB.CHAT-0001 R16): the name and the
 * tone at once, the model as the server answers; a refusal is told and undone. */
export function useAgentPatch() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (p: { name?: string; tone?: Tone; model?: { connectionId: string; model: string } | null }) => api.patch<Agent>("/api/v1/agent", p),
    onMutate: (p) => qc.setQueryData<Agent>(keys.agent, (old) => (old && (p.name || p.tone) ? { ...old, ...(p.name ? { name: p.name } : {}), ...(p.tone ? { tone: p.tone } : {}) } : old)),
    onSuccess: (a) => qc.setQueryData(keys.agent, a),
    onError: (e) => {
      toast({ kind: "error", title: errorText(t, e) });
      qc.invalidateQueries({ queryKey: keys.agent });
    },
  });
}

/** The fill the meter shows (R3): without a session (new or just reset) — 0 of the
 * window of the model; nothing when no window is known. */
export function contextOf(fill: ContextFill | undefined, modelWindow: number): ContextFill | undefined {
  const window = fill?.window || modelWindow;
  return fill && window > 0 ? { tokens: fill.tokens, window } : undefined;
}

/** R11: images are attached and the model of the agent does not see them — the warning
 * and a model that does, if the user may choose one. */
export function unseenImages(agent: Agent | undefined, pendingImages: boolean): { seeing?: Agent["availableModels"][number] } | null {
  if (!pendingImages || !agent?.model || agent.model.caps.image) return null;
  return { seeing: agent.availableModels.find((m) => m.caps.image) };
}

/** FTR.NAB.CHAT-0001 R3: the fill of the context of the conversation. */
function useContextFill(conv: Conversation, modelWindow: number): ContextFill | undefined {
  const qc = useQueryClient();
  const key = ["conversation-context", conv.id];
  const fill = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ context: ContextFill }>(`/api/v1/conversations/${conv.id}`)).context,
  });
  useEvent("conversation.context", (d: ContextFill & { conversationId: string }) => {
    if (d.conversationId === conv.id) qc.setQueryData(key, { tokens: d.tokens, window: d.window });
  });
  return contextOf(fill.data, modelWindow);
}

/** R4: the commands of the conversation and the skills of the user. A failed command is
 * told by a toast; a failure in the agent comes as chat.error. */
function useCommands(conv: Conversation) {
  const { t } = useTranslation();
  const toast = useToast();
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => api.get<{ items: Skill[] }>("/api/v1/skills"), staleTime: 60_000 });
  const commands: ChatCommand[] = useMemo(() => [
    { kind: "command", name: "new", description: t("chat.cmd.new") },
    { kind: "command", name: "compact", description: t("chat.cmd.compact"), takesText: true },
    ...(skills.data?.items ?? []).map((s): ChatCommand => ({ kind: "skill", name: s.name, description: s.description, source: s.itemTitle })),
  ], [skills.data, t]);
  const run = async (name: string, text: string) => {
    try {
      if (name === "new") await api.post(`/api/v1/conversations/${conv.id}/context:reset`);
      else if (name === "compact") await api.post(`/api/v1/conversations/${conv.id}/context:compact`, { instructions: text });
    } catch (e) {
      toast({ kind: "error", title: errorText(t, e) });
      throw e;
    }
  };
  useEvent("chat.error", (d: { conversationId: string; command?: string; errorClass: string }) => {
    if (d.conversationId !== conv.id || !d.command) return;
    toast({ kind: "error", title: t(d.command === "reset" ? "chat.resetFailed" : "chat.compactFailed"), text: llmErrorText(t, d.errorClass) });
  });
  /** A command of a button: its failure is already told. */
  const press = (name: string) => () => void run(name, "").catch(() => undefined);
  return { commands, onCommand: run, onCompact: press("compact"), onReset: press("new") };
}

/** One conversation: its history, the events of the turn and the actions of the user —
 * what the `Chat` of the kit needs, apart from the look. `modelWindow` is the context
 * window of the model of the agent: the size of an empty context. */
export function useConversation(conv: Conversation, modelWindow = 0): Pick<ChatProps,
  "messages" | "loading" | "hasOlder" | "loadingOlder" | "busy" | "confirmations" | "upload"
  | "onSend" | "onLoadOlder" | "onRetry" | "onConfirm" | "onUpload" | "onTranscribe" | "loadAttachment" | "loadPreview"
  | "commands" | "onCommand" | "context" | "onCompact" | "onReset" | "voiceMaxSeconds" | "onPendingChange"> & {
  unarchive: () => void;
  /** Images are attached to the message being written (R11). */
  pendingImages: boolean;
} {
  const { t, i18n } = useTranslation();
  const { config } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [overrides, setOverrides] = useState<Record<string, Message>>({});
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown, text?: string) => toast({ kind: "error", title: errorText(t, e), text });

  // UI-04: opening a mail topic resets its unread counter.
  useEffect(() => {
    if (conv.unreadCount > 0) {
      void api.post(`/api/v1/conversations/${conv.id}/read`).then(() => qc.invalidateQueries({ queryKey: ["conversations"] })).catch(() => undefined);
    }
  }, [conv.id, conv.unreadCount, qc]);

  // R9: calls of tools that change data wait for the user in mail topics.
  const confirmKey = ["confirmations", conv.id];
  const pending = useQuery({
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
    onError: (e) => fail(e),
  });

  const history = useInfiniteQuery({
    queryKey: keys.messages(conv.id),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api.get<List<Message>>(`/api/v1/conversations/${conv.id}/messages?limit=50${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const raw = useMemo(() => {
    const byId = new Map<string, Message>();
    for (const p of history.data?.pages ?? []) for (const m of p.items) byId.set(m.id, m);
    for (const m of Object.values(overrides)) if (m.conversationId === conv.id) byId.set(m.id, { ...byId.get(m.id), ...m });
    return [...byId.values()].toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.role === "user" ? -1 : 1));
  }, [history.data, overrides, conv.id]);

  const streaming = raw.some((m) => m.role === "assistant" && (m.status === "streaming" || m.status === "pending"));
  const [wasStreaming, setWasStreaming] = useState(streaming);
  if (wasStreaming !== streaming) {
    setWasStreaming(streaming);
    if (!streaming) setBusy(false);
  }

  const put = (m: Partial<Message> & { id: string }) =>
    setOverrides((o) => ({ ...o, [m.id]: { ...(o[m.id] ?? ({} as Message)), ...m } as Message }));

  // FTR.NAB.CMN-0004 R7, R12: the pod of the agent starts, or the turn waits
  // for a place; the line goes with the first event of the answer.
  const [wait, setWait] = useState<AgentWait | null>(null);
  useEvent("agent.state", (d: AgentWait) => {
    if (d.conversationId === conv.id) setWait(d);
  });
  useEvent("message.created", (m: Message) => {
    if (m.conversationId !== conv.id) return;
    put(m);
    if (m.role === "assistant") setWait(null);
  });
  useEvent("message.delta", (d: { messageId: string; conversationId: string; delta: string }) => {
    if (d.conversationId !== conv.id) return;
    setOverrides((o) => {
      const cur = o[d.messageId] ?? raw.find((x) => x.id === d.messageId);
      if (!cur) return o;
      return { ...o, [d.messageId]: { ...cur, text: (cur.text ?? "") + d.delta, status: "streaming" } };
    });
  });
  useEvent("tool.step", (d: { messageId: string; conversationId: string; step: ToolStep }) => {
    if (d.conversationId !== conv.id) return;
    setOverrides((o) => {
      const cur = o[d.messageId] ?? raw.find((x) => x.id === d.messageId);
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
    setWait(null);
    qc.invalidateQueries({ queryKey: ["conversations"] });
  });

  const lng = i18n.language;
  const messages = useMemo(() => raw.map((m) => toChatMessage(t, m, wait, lng)), [raw, wait, t, lng]);

  const context = useContextFill(conv, modelWindow);
  const commands = useCommands(conv);
  // R11: which of the attached files are images
  const [imageIds, setImageIds] = useState<Set<string>>(new Set());
  const [pendingImages, setPendingImages] = useState(false);
  const onPendingChange = useCallback((ups: ChatUpload[]) => setPendingImages(ups.some((u) => imageIds.has(u.id))), [imageIds]);
  const confirmations: ChatConfirmation[] = (pending.data?.items ?? []).map((c) => ({ id: c.id, summary: c.summary, preview: c.argsPreview }));

  const unarchive = useMutation({
    mutationFn: () => api.patch(`/api/v1/conversations/${conv.id}`, { archived: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  return {
    messages, confirmations, busy,
    ...commands, pendingImages, onPendingChange, context,
    voiceMaxSeconds: config.voiceMaxSeconds || 300,
    loading: history.isLoading,
    hasOlder: history.hasNextPage,
    loadingOlder: history.isFetchingNextPage,
    upload: { maxBytes: config.uploadMaxBytes },
    onLoadOlder: () => void history.fetchNextPage(),
    onConfirm: (id, approve) => !resolve.isPending && resolve.mutate({ id, action: approve ? "approve" : "reject" }),
    unarchive: () => unarchive.mutate(),
    async onSend(text, attachmentIds, _voice, skill) {
      setBusy(true);
      try {
        const res = await api.post<{ messageId: string; message: Message }>(`/api/v1/conversations/${conv.id}/messages`, { text, attachmentIds, skill });
        put(res.message);
      } catch (e) {
        setBusy(false);
        fail(e);
        throw e;
      }
    },
    async onRetry(messageId) {
      if (busy) return;
      setBusy(true);
      try {
        await api.post(`/api/v1/messages/${messageId}/retry`);
      } catch (e) {
        setBusy(false);
        fail(e);
      }
    },
    async onUpload(file) {
      const form = new FormData();
      form.append("file", file);
      try {
        const a = await api.upload<{ attachmentId: string }>("/api/v1/attachments", form);
        if (file.type.startsWith("image/")) setImageIds((s) => new Set(s).add(a.attachmentId));
        return { id: a.attachmentId, fileName: file.name };
      } catch (e) {
        fail(e, file.name);
        return null;
      }
    },
    loadAttachment,
    loadPreview: config.previewOffice ? loadAttachmentPreview : undefined,
    // the voice input exists where the deployment has a recognizer; a failure is a toast of the kit
    // with «Retry» on the same recording (design §3.1)
    onTranscribe: config.voice ? async (recording) => {
      const form = new FormData();
      form.append("file", recording, "voice.webm");
      try {
        return (await api.upload<{ text: string }>("/api/v1/transcribe", form)).text ?? "";
      } catch (e) {
        throw new Error(errorText(t, e), { cause: e });
      }
    } : undefined,
  };
}
