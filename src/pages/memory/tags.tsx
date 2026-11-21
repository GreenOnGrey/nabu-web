import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { CommNote, CommTag } from "../../api/types";
import { Icon } from "@green-on-grey/ui-kit";

/** A person or a topic (FTR.NAB.CMN-0003 design §1, decision 19): a neutral
 * chip with a green person icon or a violet hash — the colour is on the icon
 * only and is not the only sign. */
export function TagChip({ tag, onClick, onRemove, removeLabel }: {
  tag: Pick<CommTag, "kind" | "label">; onClick?: () => void; onRemove?: () => void; removeLabel?: string;
}) {
  const cls = `tg ${tag.kind === "person" ? "p" : "t"}`;
  const body = <><Icon name={tag.kind === "person" ? "user" : "hash"} size={12} />{tag.label}</>;
  return (
    <span className={cls}>
      {onClick ? <button type="button" className="tg-b" onClick={onClick}>{body}</button> : body}
      {onRemove && <button type="button" className="tg-x" onClick={onRemove} aria-label={removeLabel}><Icon name="x" size={11} /></button>}
    </span>
  );
}

/** The name of a source: a known key is translated, another is shown as it is. */
export const sourceName = (t: TFunction, key: string) => t(`comm.sources.${key}`, { defaultValue: key });

/** A source in the lists of settings: a mailbox of any provider (source "mail",
 * FTR.NAB.CMN-0006) is named by its catalog item, others by the source. */
export const sourceTitle = (t: TFunction, s: { source: string; title?: string }) => (s.source === "mail" && s.title ? s.title : sourceName(t, s.source));

export const sourceIcon = (key: string) => (key === "vkteams" ? "msg" : "mail") as "msg" | "mail";

/** The date of a note: sources that give only the day show no time (tech §3.3). */
export function noteWhen(iso: string, precision: "minute" | "day", lng: string): string {
  const d = new Date(iso);
  return precision === "day"
    ? new Intl.DateTimeFormat(lng, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d)
    : new Intl.DateTimeFormat(lng, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function dueText(due: string, lng: string): string {
  return new Intl.DateTimeFormat(lng, { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(new Date(due + "T00:00:00Z"));
}

/** The period of a record by its level (FTR.NAB.MEM-0001 R1, design §3.1): «14 Nov», «10–16 Nov», «November 2026»,
 * «3–19 Nov». The dates are the dates of the user, kept as they are. */
const at = (iso: string) => new Date(iso + "T00:00:00Z");

export function notePeriod(n: Pick<CommNote, "level" | "periodFrom" | "periodTo">, lng: string): string {
  if (!n.periodFrom) return ""; // a record the collection did not date
  const day = (iso: string) => new Intl.DateTimeFormat(lng, { day: "numeric", month: "short", timeZone: "UTC" }).format(at(iso));
  if (n.level === "month") {
    // «Октябрь 2026»: the month by name and the year, without the suffix some locales add to a full date
    const name = new Intl.DateTimeFormat(lng, { month: "long", timeZone: "UTC" }).format(at(n.periodFrom));
    return `${name.charAt(0).toLocaleUpperCase(lng)}${name.slice(1)} ${n.periodFrom.slice(0, 4)}`;
  }
  return n.level === "day" ? day(n.periodFrom) : `${day(n.periodFrom)}–${day(n.periodTo)}`;
}

/** The level of a record before its date (design §1): neutral for a day and a thread, a violet outline for a week
 * and a month, so a compacted record reads as a summary. */
export function LevelChip({ level }: { level: CommNote["level"] }) {
  const { t } = useTranslation();
  return <span className={`nb-lvl${level === "week" || level === "month" ? " compact" : ""}`}>{t(`comm.level.${level}`)}</span>;
}
