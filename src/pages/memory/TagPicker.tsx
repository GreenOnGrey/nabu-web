import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { qs, request } from "../../api/client";
import type { CommTag, List } from "../../api/types";
import { Combobox, type ComboItem } from "@green-on-grey/ui-kit";

/** The days of communication as the field of suggestions shows them, or nothing. */
const dayLabel = (t: TFunction, days?: number) => (days ? t("comm.days", { count: days }) : undefined);

/** The field «Человек или тема» (FTR.NAB.MEM-0001 R22, design §3.4) on the Combobox of the kit: the people and the
 * topics of the user in two groups, eight of each, the days of communication on the right. One filter at a time: a
 * choice of one kind replaces the choice of the other — the same field on the communications and on the commitments
 * (FTR.NAB.CMN-0003 design §3.6, decision 27). */
export function TagPicker({ onPick }: { onPick: (tag: Pick<CommTag, "id" | "kind" | "label">) => void }) {
  const { t } = useTranslation();
  const load = async (q: string, signal: AbortSignal): Promise<ComboItem[]> => {
    const path = (kind: "people" | "topics") => `/api/v1/comm/${kind}${qs({ q, limit: 8 })}`;
    const [p, tp] = await Promise.all([
      request<List<CommTag>>("GET", path("people"), undefined, { signal }),
      request<List<CommTag>>("GET", path("topics"), undefined, { signal }),
    ]);
    return [
      ...p.items.map((x) => ({ id: x.id, label: x.label, hint: x.email, meta: dayLabel(t, x.days), group: "person", icon: "user" as const })),
      ...tp.items.map((x) => ({ id: x.id, label: x.label, meta: dayLabel(t, x.days), group: "topic", icon: "hash" as const })),
    ];
  };
  return (
    <Combobox ariaLabel={t("comm.filterPersonTopic")} placeholder={t("comm.filterPersonTopic")}
      groups={[{ id: "person", label: t("comm.people") }, { id: "topic", label: t("comm.topics") }]}
      load={load}
      onSelect={(item) => onPick({ id: item.id, kind: item.group === "person" ? "person" : "topic", label: item.label })} />
  );
}
