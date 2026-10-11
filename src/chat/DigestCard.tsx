import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { Commitment, DigestCard } from "../api/types";
import { intlLocale } from "../lib/i18n";
import { Icon } from "../components/Icon";
import { useCommitmentActions } from "../pages/memory/Commitments";
import { TagChip, dueText } from "../pages/memory/tags";

/** The digest of commitments in the web chat (FTR.NAB.CMN-0003 R16, design
 * §3.9): a card with checkboxes instead of the text other channels get. The
 * state of an item is the current state of its commitment, not what it was
 * when the digest was sent. */
export function DigestCardView({ card }: { card: DigestCard }) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const act = useCommitmentActions();
  const all = useQuery({ queryKey: keys.commitments("state=all"), queryFn: () => api.get<{ items: Commitment[] }>("/api/v1/commitments?state=all"), retry: false });
  const now = new Map(all.data?.items.map((c) => [c.id, c]));
  const late = card.items.filter((i) => i.group === "overdue").length;
  return (
    <div className="digest">
      <div className="dh">{t(`comm.digest.${card.period}`)}</div>
      <div className="small muted">{t("comm.digest.count", { count: card.items.length })}{late > 0 ? ` · ${t("comm.digest.late", { count: late })}` : ""}</div>
      {card.items.map((it) => {
        const cur = now.get(it.commitmentId);
        const gone = all.isSuccess && !cur; // the note was deleted
        const done = gone || (cur ? cur.state !== "open" : it.state !== "open");
        const person = it.person;
        return (
          <div key={it.commitmentId} className={`cm${done ? " done" : ""}`}>
            <button type="button" className="cm-box" role="checkbox" aria-checked={done} disabled={gone || act.isPending || all.isError}
              aria-label={done ? t("comm.cm.reopen") : t("comm.cm.close")} onClick={() => act.mutate({ id: it.commitmentId, state: done ? "open" : "done" })}>
              {done && <Icon name="check" size={12} />}
            </button>
            <span className="cm-b">
              <span className="dir">{t(`comm.cm.${it.direction}`)}</span>
              <span className="what">{it.text}</span>
              <span className="links">
                {person && <Link to={`/memory?tab=comm&person=${person.id}`} className="plain"><TagChip tag={person} /></Link>}
                {it.url && <a href={it.url} target="_blank" rel="noreferrer">{t("comm.source")} <Icon name="ext" size={11} /></a>}
              </span>
            </span>
            <span className={`when${it.group === "overdue" && !done ? " late" : ""}`}>{it.due ? dueText(it.due, lng) : t("comm.cm.noDue")}</span>
          </div>
        );
      })}
    </div>
  );
}
