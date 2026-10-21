import { useTranslation } from "react-i18next";
import { AgentSettingsMenu } from "@green-on-grey/ui-kit/chat";
import { TONES, type Agent, type Tone } from "../api/types";
import { useAgentPatch } from "./adapter";
import { TONE_ICONS } from "./tones";

/** The agent menu under the agent's icon (R31, design §3.6a): the name and the
 * tone as tiles, then the model (FTR.NAB.CHAT-0001 R16, R17, design §3.3). The
 * menu is the kit's, the same in every product (FTR.HMR.SPEC-0001): Nabu gives
 * the tones with their icons and the models of the agent. */
export function AgentMenu({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { t } = useTranslation();
  const patch = useAgentPatch();
  return (
    <AgentSettingsMenu name={agent.name} value={agent.tone}
      options={TONES.map((tone) => ({ key: tone, label: t(`tones.${tone}`), icon: TONE_ICONS[tone] }))}
      models={{ available: agent.availableModels, model: agent.model, defaultModel: agent.defaultModel, chosen: agent.chosen, contextTokens: agent.context.tokens }}
      onRename={(name) => patch.mutate({ name })} onPick={(tone) => patch.mutate({ tone: tone as Tone })}
      onModel={(model) => patch.mutate({ model })} onClose={onClose} />
  );
}
