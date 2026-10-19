import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AgentMenu as KitAgentMenu, tokens, type AgentModelOption } from "@green-on-grey/ui-kit/chat";
import { TONES, type Agent, type AvailableModel, type Tone } from "../api/types";
import { choiceKey } from "../lib/models";
import { useAgentPatch } from "./adapter";
import { TONE_ICONS } from "./tones";

/** The block «Model» of the menu (FTR.NAB.CHAT-0001 R16, R17, design §3.3): with a choice
 * the first line is «Default (<model>)»; a model whose window the context outgrows warns. */
export function modelOptions(t: TFunction, agent: Agent, lng: string): { options: AgentModelOption[]; value: string } {
  const badges = (m: AvailableModel) => [
    ...(m.caps.image ? [{ icon: "image" as const, text: t("models.cap.image") }] : []),
    ...(m.caps.reasoning ? [{ icon: "brain" as const, text: t("models.cap.reasoning") }] : []),
    ...(m.caps.contextWindow > 0 ? [{ text: tokens(m.caps.contextWindow, lng) }] : []),
  ];
  // R17: a context larger than 80 % of the window will be compacted
  const warn = (m: AvailableModel) =>
    m.caps.contextWindow > 0 && agent.context.tokens > 0.8 * m.caps.contextWindow ? t("agent.modelCompactWarn") : undefined;
  const choice = agent.availableModels.length > 1;
  const models: AgentModelOption[] = agent.availableModels.map((m) => ({ key: choiceKey(m), label: m.name, sub: m.connection, badges: badges(m), warn: choice ? warn(m) : undefined }));
  const options: AgentModelOption[] = choice
    ? [{ key: "", label: t("agent.modelDefault"), sub: agent.defaultModel?.name ?? "—", warn: agent.defaultModel ? warn(agent.defaultModel) : undefined }, ...models]
    : models;
  const value = agent.chosen && agent.model ? choiceKey(agent.model) : choice ? "" : (agent.model ? choiceKey(agent.model) : "");
  return { options, value };
}

/** The agent menu under the agent's icon (R31, design §3.6a): the name and
 * the tone as tiles; the icon in the header changes at once (UI-03). The menu
 * is the one of the kit (FTR.NAB.CMN-0005 R15): the tones are its options.
 * FTR.NAB.CHAT-0001 R16, R17, design §3.3: the model after the tone. */
export function AgentMenu({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const patch = useAgentPatch();
  const { options, value } = modelOptions(t, agent, i18n.language);
  const pick = (key: string) => {
    if (!key) return patch.mutate({ model: null });
    const m = agent.availableModels.find((x) => choiceKey(x) === key);
    if (m) patch.mutate({ model: { connectionId: m.connectionId, model: m.model } });
  };
  return (
    <KitAgentMenu label={t("agent.menu")} name={agent.name} value={agent.tone} optionsLabel={t("agent.tone")} hint={t("agent.everywhere")}
      options={TONES.map((tone) => ({ key: tone, label: t(`tones.${tone}`), icon: TONE_ICONS[tone] }))}
      models={{ label: t("agent.model"), options, value, onPick: pick, empty: t("agent.noModels") }}
      onRename={(name) => patch.mutate({ name })} onPick={(tone) => patch.mutate({ tone: tone as Tone })} onClose={onClose} />
  );
}
