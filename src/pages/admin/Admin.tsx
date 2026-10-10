import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../../app/session";
import { Icon } from "../../components/Icon";
import { Empty } from "../../components/ui";
import { adminPath } from "./paths";
import { UsersAdmin } from "./Users";
import { ModelsAdmin } from "./Models";
import { HarnessAdmin } from "./Harness";
import { CatalogAdmin } from "./Catalog";
import { ServiceAgentsAdmin } from "./ServiceAgents";
import { ClientsAdmin } from "./Clients";
import { UsageAdmin } from "./Usage";
import { AuditAdmin } from "./Audit";
import { ChannelsAdmin } from "./Channels";
import { GroupAgentsAdmin } from "./GroupAgents";
import { SettingsAdmin } from "./Settings";

const SECTIONS = [
  { path: "users", icon: "users" },
  { path: "channels", icon: "msg" },
  { path: "group-agents", icon: "grid" },
  { path: "models", icon: "cpu" },
  { path: "harness", icon: "box" },
  { path: "catalog", icon: "plug" },
  { path: "service-agents", icon: "spark" },
  { path: "clients", icon: "server" },
  { path: "usage", icon: "chart" },
  { path: "audit", icon: "shield" },
  { path: "settings", icon: "gear" },
] as const;

/** The administration panel (R33–R34, design §2): for platform administrators only. */
export function AdminPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  if (!me.isAdmin) {
    return <main className="main"><Empty icon="lock" title={t("admin.noAccess")} /></main>;
  }
  return (
    <div className="admin">
      <nav className="side" aria-label={t("admin.title")}>
        <div className="lab">{t("admin.title")}</div>
        {SECTIONS.map((s) => (
          <NavLink key={s.path} to={adminPath(s.path)}><Icon name={s.icon} />{t(`admin.${s.path}.title`)}</NavLink>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route index element={<Navigate to={adminPath("users")} replace />} />
          <Route path="users" element={<UsersAdmin />} />
          <Route path="models" element={<ModelsAdmin />} />
          <Route path="harness" element={<HarnessAdmin />} />
          <Route path="catalog" element={<CatalogAdmin />} />
          <Route path="service-agents" element={<ServiceAgentsAdmin />} />
          <Route path="clients" element={<ClientsAdmin />} />
          <Route path="usage" element={<UsageAdmin />} />
          <Route path="audit" element={<AuditAdmin />} />
          <Route path="channels" element={<ChannelsAdmin />} />
          <Route path="group-agents" element={<GroupAgentsAdmin />} />
          <Route path="settings" element={<SettingsAdmin />} />
          <Route path="*" element={<Navigate to={adminPath("users")} replace />} />
        </Routes>
      </main>
    </div>
  );
}
