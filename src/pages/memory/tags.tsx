import type { TFunction } from "i18next";
import type { CommTag } from "../../api/types";
import { Icon } from "../../components/Icon";

/** A person or a topic (FTR.NAB.CMN-0003 design §1): people are green with a
 * person icon, topics violet with a hash — the colour is not the only sign. */
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
