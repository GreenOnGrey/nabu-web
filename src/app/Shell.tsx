import { Link, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar, TopBar, type LinkComponent } from "@green-on-grey/ui-kit";
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

/** The link of the router for the top bar of the kit (FTR.NAB.CMN-0005 arch §4.2). */
const RouterLink: LinkComponent = ({ href, ...rest }) => <Link to={href} {...rest} />;

const profileMenu = (close: () => void) => <ProfileMenu onClose={close} />;

export function Shell() {
  const { t } = useTranslation();
  const { me } = useSession();
  const location = useLocation();
  return (
    <div className="app">
      <TopBar logo="/logo.jpg" name="Nabu" Link={RouterLink} profileMenu={profileMenu}
        sections={SECTIONS.map((s) => ({ key: s.key, label: t(`nav.${s.key}`), href: s.to, active: s.match(location.pathname) }))}
        avatar={<Avatar name={me.name || me.email} url={me.avatarUrl} />} />
      <div className="nbody">
        <Outlet />
      </div>
    </div>
  );
}
