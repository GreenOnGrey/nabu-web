import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "../components/ui";
import { ProfileMenu } from "./ProfileMenu";
import { useSession } from "./session";

// The top menu of the site (FTR.NAB.CMN-0001 design §2): Chat, Tasks, Memory,
// Space, Connections; the avatar opens the profile menu on the right.
export const SECTIONS = [
  { to: "/", key: "chat", match: (p: string) => p === "/" || p.startsWith("/chat") },
  { to: "/tasks", key: "tasks", match: (p: string) => p.startsWith("/tasks") },
  { to: "/memory", key: "memory", match: (p: string) => p.startsWith("/memory") },
  { to: "/space", key: "space", match: (p: string) => p.startsWith("/space") },
  { to: "/connections", key: "connections", match: (p: string) => p.startsWith("/connections") },
] as const;

export function Shell() {
  const { t } = useTranslation();
  const { me } = useSession();
  const location = useLocation();
  const [menu, setMenu] = useState(false);

  const links = SECTIONS.map((s) => (
    <NavLink key={s.key} to={s.to} end={s.to === "/"} className={s.match(location.pathname) ? "on" : undefined}>
      {t(`nav.${s.key}`)}
    </NavLink>
  ));

  return (
    <div className="app">
      <div className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.jpg" alt="" />
          <span className="hide-m">Nabu</span>
        </Link>
        <nav className="nav hide-m" aria-label={t("nav.title")}>
          {links}
        </nav>
        <div className="top-actions">
          <button className="avatar" style={menu ? { boxShadow: "0 0 0 2px var(--violet)" } : undefined}
            onClick={() => setMenu((v) => !v)} aria-label={t("profile.title")} aria-expanded={menu}>
            <Avatar name={me.name || me.email} url={me.avatarUrl} />
          </button>
        </div>
        {menu && <ProfileMenu onClose={() => setMenu(false)} />}
      </div>
      <div className="nbody">
        <Outlet />
      </div>
      <nav className="bnav show-m" aria-label={t("nav.title")}>
        {links}
      </nav>
    </div>
  );
}
