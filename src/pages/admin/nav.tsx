import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@green-on-grey/ui-kit";
import { adminPath } from "./paths";

// The sections of the administration (R33–R34, design §2). Apart from the
// lazy panel: the top bar puts them behind the burger of a phone
// (FTR.NAB.CMN-0005 design §4) without loading the administration.
const SECTIONS = [
  { path: "users", icon: "users" },
  { path: "groups", icon: "lock" },
  { path: "channels", icon: "msg" },
  { path: "agent-pods", icon: "bolt" },
  { path: "group-agents", icon: "grid" },
  { path: "service-agents", icon: "spark" },
  { path: "sandbox-images", icon: "box" }, // FTR.NAB.CMN-0008 design §2
  { path: "models", icon: "cpu" },
  { path: "catalog", icon: "plug" },
  { path: "comm", icon: "brain" },
  { path: "clients", icon: "server" },
  { path: "usage", icon: "chart" },
  { path: "audit", icon: "shield" },
  { path: "settings", icon: "gear" },
] as const;

/** The navigation of the administration: the side panel of a desktop (`inBurger` hides it on a phone)
 * and the burger of a phone (`onPick` closes it). */
export function AdminNav({ inBurger, onPick }: { inBurger?: boolean; onPick?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav className={inBurger ? "side in-burger" : "side"} aria-label={t("admin.title")}>
      <div className="lab">{t("admin.title")}</div>
      {SECTIONS.map((s) => (
        <NavLink key={s.path} to={adminPath(s.path)} onClick={onPick}><Icon name={s.icon} />{t(`admin.${s.path}.title`)}</NavLink>
      ))}
    </nav>
  );
}
