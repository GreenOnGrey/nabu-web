import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, Loading } from "@green-on-grey/ui-kit";
import { AgentButton, Chat, ChatLayout, ConversationList } from "@green-on-grey/ui-kit/chat";
import { ApiError } from "../api/client";
import { useAgent } from "../api/queries";
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
  const [agentMenu, setAgentMenu] = useState(false);
  const closeAgentMenu = useCallback(() => setAgentMenu(false), []);
  const { unarchive, ...chat } = useConversation(conv);
  const a = agent.data;
  return (
    <Chat {...chat} agentName={a?.name ?? "Nabu"} emptyHint={t("chat.emptyHint")}
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
          </div>
          {agentMenu && a && <AgentMenu agent={a} onClose={closeAgentMenu} />}
        </>
      )} />
  );
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
