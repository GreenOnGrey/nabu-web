import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@green-on-grey/ui-kit";
import { AgentMenu as KitAgentMenu, tokens, type AgentModelOption } from "@green-on-grey/ui-kit/chat";
import { api } from "../api/client";
import { keys } from "../api/queries";
import { TONES, type Agent, type AvailableModel, type Tone } from "../api/types";
import { errorText } from "../lib/errors";
import { TONE_ICONS } from "./tones";

type ModelChoice = { connectionId: string; model: string } | null;

const keyOf = (m: Pick<AvailableModel, "connectionId" | "model">) => `${m.connectionId}/${m.model}`;

/** The agent menu under the agent's icon (R31, design §3.6a): the name and
 * the tone as tiles; the icon in the header changes at once (UI-03). The menu
 * is the one of the kit (FTR.NAB.CMN-0005 R15): the tones are its options.
 * FTR.NAB.CHAT-0001 R16, R17, design §3.3: the model after the tone. */
export function AgentMenu({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const patch = useMutation({
    mutationFn: (p: { name?: string; tone?: Tone; model?: ModelChoice }) => api.patch<Agent>("/api/v1/agent", p),
    onMutate: (p) => qc.setQueryData<Agent>(keys.agent, (old) => (old && (p.name || p.tone) ? { ...old, ...(p.name ? { name: p.name } : {}), ...(p.tone ? { tone: p.tone } : {}) } : old)),
    onSuccess: (a) => qc.setQueryData(keys.agent, a),
    onError: (e) => {
      toast({ kind: "error", title: errorText(t, e) });
      qc.invalidateQueries({ queryKey: keys.agent });
    },
  });
  const lng = i18n.language;
  const badges = (m: AvailableModel) => [
    ...(m.caps.image ? [{ icon: "image" as const, text: t("models.cap.image") }] : []),
    ...(m.caps.reasoning ? [{ icon: "brain" as const, text: t("models.cap.reasoning") }] : []),
    ...(m.caps.contextWindow > 0 ? [{ text: tokens(m.caps.contextWindow, lng) }] : []),
  ];
  // R17: a context larger than 80 % of the window will be compacted
  const warn = (m: AvailableModel) =>
    m.caps.contextWindow > 0 && agent.context.tokens > 0.8 * m.caps.contextWindow ? t("agent.modelCompactWarn") : undefined;
  const options: AgentModelOption[] = agent.availableModels.length > 1 && agent.defaultModel ? [
    { key: "", label: t("agent.modelDefault"), sub: agent.defaultModel.name, warn: warn(agent.defaultModel) },
    ...agent.availableModels.map((m) => ({ key: keyOf(m), label: m.name, sub: m.connection, badges: badges(m), warn: warn(m) })),
  ] : agent.availableModels.map((m) => ({ key: keyOf(m), label: m.name, sub: m.connection, badges: badges(m) }));
  const value = agent.chosen && agent.model ? keyOf(agent.model) : agent.availableModels.length > 1 ? "" : (agent.model ? keyOf(agent.model) : "");
  const pick = (key: string) => {
    if (!key) return patch.mutate({ model: null });
    const m = agent.availableModels.find((x) => keyOf(x) === key);
    if (m) patch.mutate({ model: { connectionId: m.connectionId, model: m.model } });
  };
  return (
    <KitAgentMenu label={t("agent.menu")} name={agent.name} value={agent.tone} optionsLabel={t("agent.tone")} hint={t("agent.everywhere")}
      options={TONES.map((tone) => ({ key: tone, label: t(`tones.${tone}`), icon: TONE_ICONS[tone] }))}
      models={{ label: t("agent.model"), options, value, onPick: pick, empty: t("agent.noModels") }}
      onRename={(name) => patch.mutate({ name })} onPick={(tone) => patch.mutate({ tone: tone as Tone })} onClose={onClose} />
  );
}
