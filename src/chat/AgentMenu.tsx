import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import { TONES, type Agent, type Tone } from "../api/types";
import { errorText } from "../lib/errors";
import { AgentIcon, useOutside, useToast } from "../components/ui";

/** The agent menu under the agent's icon (R31, design §3.6a): the name and
 * the tone as tiles; the icon in the header changes at once (UI-03). */
export function AgentMenu({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(agent.name);
  const ref = useOutside<HTMLDivElement>(true, onClose);
  const patch = useMutation({
    mutationFn: (p: { name?: string; tone?: Tone }) => api.patch<Agent>("/api/v1/agent", p),
    onMutate: (p) => qc.setQueryData<Agent>(keys.agent, (old) => (old ? { ...old, ...p } : old)),
    onSuccess: (a) => qc.setQueryData(keys.agent, a),
    onError: (e) => {
      toast({ kind: "error", title: errorText(t, e) });
      qc.invalidateQueries({ queryKey: keys.agent });
    },
  });
  const saveName = () => {
    const n = name.trim();
    if (n && n !== agent.name) patch.mutate({ name: n });
  };
  return (
    <div className="agentmenu" ref={ref} role="dialog" aria-label={t("agent.menu")}>
      <div className="lab">{t("agent.name")}</div>
      <input className="inp" value={name} maxLength={40} autoFocus aria-label={t("agent.name")}
        onChange={(e) => setName(e.target.value)} onBlur={saveName}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      <div className="lab" style={{ marginTop: 14 }}>{t("agent.tone")}</div>
      <div className="tones">
        {TONES.map((tone) => (
          <button key={tone} className={`tone${agent.tone === tone ? " on" : ""}`} aria-pressed={agent.tone === tone}
            onClick={() => patch.mutate({ tone })}>
            <span className="ic"><AgentIcon tone={tone} small /></span>
            {t(`tones.${tone}`)}
          </button>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 10 }}>{t("agent.everywhere")}</div>
    </div>
  );
}
