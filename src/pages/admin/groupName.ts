import type { UserGroup } from "../../api/types";

/** The name of a group: built-in groups are named by the interface (FTR.NAB.CMN-0007 tech §2). */
export function groupName(t: (k: string) => string, g: Pick<UserGroup, "name" | "builtin">): string {
  if (g.builtin === "all") return t("admin.groups.all");
  if (g.builtin === "admins") return t("admin.groups.admins");
  return g.name;
}
