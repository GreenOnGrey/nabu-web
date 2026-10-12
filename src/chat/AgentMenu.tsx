import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@green-on-grey/ui-kit";
import { AgentMenu as KitAgentMenu } from "@green-on-grey/ui-kit/chat";
import { api } from "../api/client";
import { keys } from "../api/queries";
import { TONES, type Agent, type Tone } from "../api/types";
import { errorText } from "../lib/errors";
import { TONE_ICONS } from "./tones";

/** The agent menu under the agent's icon (R31, design §3.6a): the name and
 * the tone as tiles; the icon in the header changes at once (UI-03). The menu
 * is the one of the kit (FTR.NAB.CMN-0005 R15): the tones are its options. */
export function AgentMenu({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const patch = useMutation({
    mutationFn: (p: { name?: string; tone?: Tone }) => api.patch<Agent>("/api/v1/agent", p),
    onMutate: (p) => qc.setQueryData<Agent>(keys.agent, (old) => (old ? { ...old, ...p } : old)),
    onSuccess: (a) => qc.setQueryData(keys.agent, a),
    onError: (e) => {
      toast({ kind: "error", title: errorText(t, e) });
      qc.invalidateQueries({ queryKey: keys.agent });
    },
  });
  return (
    <KitAgentMenu label={t("agent.menu")} name={agent.name} value={agent.tone} optionsLabel={t("agent.tone")} hint={t("agent.everywhere")}
      options={TONES.map((tone) => ({ key: tone, label: t(`tones.${tone}`), icon: TONE_ICONS[tone] }))}
      onRename={(name) => patch.mutate({ name })} onPick={(tone) => patch.mutate({ tone: tone as Tone })} onClose={onClose} />
  );
}
