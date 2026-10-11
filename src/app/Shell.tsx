import { useCallback, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "../components/Icon";
import { Avatar, useOutside } from "../components/ui";
import { ProfileMenu } from "./ProfileMenu";
import { useSession } from "./session";

// The sections of the site (FTR.NAB.CMN-0001 design §2; the order and the
// place of Connections — FTR.NAB.CMN-0003 design, decisions 21–23): Chat,
// Memory, Space, Tasks in the top menu, and behind the burger on a phone;
// Connections live in the profile menu the avatar opens.
export const SECTIONS = [
  { to: "/", key: "chat", match: (p: string) => p === "/" || p.startsWith("/chat") },
  { to: "/memory", key: "memory", match: (p: string) => p.startsWith("/memory") },
  { to: "/space", key: "space", match: (p: string) => p.startsWith("/space") },
  { to: "/tasks", key: "tasks", match: (p: string) => p.startsWith("/tasks") },
] as const;

export function Shell() {
  const { t } = useTranslation();
  const { me } = useSession();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  // the sections on a phone: a list under the burger, closed by a pick, a tap outside or Escape
  const [sections, setSections] = useState(false);
  const closeSections = useCallback(() => setSections(false), []);
  const sectionsRef = useOutside<HTMLDivElement>(sections, closeSections);

  const links = SECTIONS.map((s) => (
    <NavLink key={s.key} to={s.to} end={s.to === "/"} className={s.match(location.pathname) ? "on" : undefined} onClick={closeSections}>
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
            onClick={() => { setSections(false); setMenu((v) => !v); }} aria-label={t("profile.title")} aria-expanded={menu}>
            <Avatar name={me.name || me.email} url={me.avatarUrl} />
          </button>
          <div className="burger" ref={sectionsRef}>
            <button className={`iconbtn${sections ? " on" : ""}`} onClick={() => { setMenu(false); setSections((v) => !v); }}
              aria-label={t("nav.title")} aria-expanded={sections} aria-controls="nav-sections">
              <Icon name={sections ? "x" : "menu"} />
            </button>
            {sections && <nav id="nav-sections" className="navmenu" aria-label={t("nav.title")}>{links}</nav>}
          </div>
        </div>
        {menu && <ProfileMenu onClose={() => setMenu(false)} />}
      </div>
      <div className="nbody">
        <Outlet />
      </div>
    </div>
  );
}
