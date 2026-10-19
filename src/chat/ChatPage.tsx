import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, Loading, Menu, useToast } from "@green-on-grey/ui-kit";
import { AgentButton, Chat, ChatLayout, ConversationList } from "@green-on-grey/ui-kit/chat";
import { ApiError } from "../api/client";
import { api } from "../api/client";
import { keys, useAgent } from "../api/queries";
import type { Agent } from "../api/types";
import { errorText } from "../lib/errors";
import { useQueryClient } from "@tanstack/react-query";
import type { Conversation } from "../api/types";
import { useConversation, useConversations } from "./adapter";
import { AgentMenu } from "./AgentMenu";
import { CommitmentsPanel } from "./CommitmentsPanel";
import { TONE_ICONS } from "./tones";

/** The chat with the personal agent (R30, design §3.2): the main
 * conversation and topics on the left; the conversation on the right with
 * channel marks, folded tool steps, model errors with Retry, attachments and
 * voice input checked before sending. The list and the conversation are the
 * components of the kit (FTR.NAB.CMN-0005 R11); the data comes from ./adapter. */
export function ChatPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
  const { all, rows, main, create } = useConversations();
  const current = routeId ? all.find((c) => c.id === routeId) : main;
  const open = (c: Conversation) => navigate(c.kind === "main" ? "/" : `/chat/${c.id}`);

  // The sidebar closes when another conversation opens.
  const [prevRouteId, setPrevRouteId] = useState(routeId);
  if (prevRouteId !== routeId) {
    setPrevRouteId(routeId);
    setSideOpen(false);
  }

  return (
    <ChatLayout>
      <ConversationList conversations={rows} currentId={current?.id} open={sideOpen} onClose={() => setSideOpen(false)}
        onPick={(id) => { setSideOpen(false); const c = all.find((x) => x.id === id); if (c) open(c); }}
        onCreate={async (title) => navigate(`/chat/${(await create(title)).id}`)} />
      {current ? (
        <ConversationView key={current.id} conv={current} onMenu={() => setSideOpen((v) => !v)} />
      ) : (
        <div className="nb-chat"><Loading /></div>
      )}
      <CommitmentsPanel />
    </ChatLayout>
  );
}

function ConversationView({ conv, onMenu }: { conv: Conversation; onMenu: () => void }) {
  const { t } = useTranslation();
  const agent = useAgent();
  const qc = useQueryClient();
  const toast = useToast();
  const [agentMenu, setAgentMenu] = useState(false);
  const [convMenu, setConvMenu] = useState(false);
  const closeAgentMenu = useCallback(() => setAgentMenu(false), []);
  const closeConvMenu = useCallback(() => setConvMenu(false), []);
  const { unarchive, pendingImages, command, busyTurn, ...chat } = useConversation(conv);
  const a = agent.data;
  // FTR.NAB.CHAT-0001 R11: the model does not see images — say so and offer one that does
  const blind = pendingImages && a?.model && !a.model.caps.image;
  const seeing = blind ? a?.availableModels.find((m) => m.caps.image) : undefined;
  const switchTo = async (m: Agent["availableModels"][number]) => {
    try {
      qc.setQueryData(keys.agent, await api.patch<Agent>("/api/v1/agent", { model: { connectionId: m.connectionId, model: m.model } }));
    } catch (e) {
      toast({ kind: "error", title: errorText(t, e) });
    }
  };
  const run = (name: string) => {
    setConvMenu(false);
    void command(name, "").catch(() => undefined);
  };
  return (
    <Chat {...chat} agentName={a?.name ?? "Nabu"} emptyHint={t("chat.emptyHint")}
      aboveComposer={blind ? (
        <div className="img-warn" role="status">
          <Icon name="image" size={14} />
          <span>{t("chat.imageNotSeen", { model: a?.model?.name })}</span>
          {seeing && <button className="btn ghost sm push" onClick={() => void switchTo(seeing)}>{t("chat.switchTo", { model: seeing.name })}</button>}
        </div>
      ) : undefined}
      readOnly={conv.archivedAt !== null && (
        <>
          <span className="small muted">{t("chat.archivedHint")}</span>
          <button className="btn sm" onClick={unarchive}>{t("chat.unarchive")}</button>
        </>
      )}
      header={(
        <>
          <div className="hd">
            <button className="iconbtn show-m" onClick={onMenu} aria-label={t("chat.conversations")}><Icon name="msg2" /></button>
            {a && (
              <AgentButton icon={TONE_ICONS[a.tone] ?? "tBusiness"} label={t("agent.menu")} title={t(`tones.${a.tone}`)}
                expanded={agentMenu} onClick={() => setAgentMenu((v) => !v)} />
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
            {conv.archivedAt === null && (
              <span style={{ position: "relative" }}>
                <button className="iconbtn" aria-label={t("chat.convMenu")} aria-expanded={convMenu} onClick={() => setConvMenu((v) => !v)}><Icon name="dots" /></button>
                {convMenu && (
                  <Menu onClose={closeConvMenu} label={t("chat.convMenu")} className="conv-menu">
                    <button className="action" disabled={busyTurn} title={busyTurn ? t("chat.waitTurn") : undefined} onClick={() => run("new")}>
                      <Icon name="undo" size={14} />{t("chat.cmd.new")}
                    </button>
                    <button className="action" disabled={busyTurn} title={busyTurn ? t("chat.waitTurn") : undefined} onClick={() => run("compact")}>
                      <Icon name="compress" size={14} />{t("chat.cmd.compact")}
                    </button>
                  </Menu>
                )}
              </span>
            )}
          </div>
          {agentMenu && a && <AgentMenu agent={a} onClose={closeAgentMenu} />}
        </>
      )} />
  );
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
