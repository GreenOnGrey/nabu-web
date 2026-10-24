import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../../app/session";
import { Empty } from "@green-on-grey/ui-kit";
import { AdminNav } from "./nav";
import { adminPath } from "./paths";
import { UsersAdmin } from "./Users";
import { GroupsAdmin } from "./Groups";
import { ModelsAdmin } from "./Models";
import { CatalogAdmin } from "./Catalog";
import { ServiceAgentsAdmin } from "./ServiceAgents";
import { ClientsAdmin } from "./Clients";
import { UsageAdmin } from "./Usage";
import { AuditAdmin } from "./Audit";
import { ChannelsAdmin } from "./Channels";
import { GroupAgentsAdmin } from "./GroupAgents";
import { AgentPodsAdmin } from "./AgentPods";
import { SettingsAdmin } from "./Settings";
import { CommAdmin } from "./Comm";
import { SandboxImagesAdmin } from "./SandboxImages";


/** The administration panel (R33–R34, design §2): for platform administrators only. */
export function AdminPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  if (!me.isAdmin) {
    return <main className="main"><Empty icon="lock" title={t("admin.noAccess")} /></main>;
  }
  return (
    <div className="admin nb-adm">
      {/* on a phone the sections are behind the burger of the top bar (Shell) */}
      <AdminNav inBurger />
      <main className="main nb-adm-main">
        <Routes>
          <Route index element={<Navigate to={adminPath("users")} replace />} />
          <Route path="users" element={<UsersAdmin />} />
          <Route path="groups" element={<GroupsAdmin />} />
          <Route path="models" element={<ModelsAdmin />} />
          <Route path="catalog" element={<CatalogAdmin />} />
          <Route path="service-agents" element={<ServiceAgentsAdmin />} />
          <Route path="sandbox-images" element={<SandboxImagesAdmin />} />
          <Route path="clients" element={<ClientsAdmin />} />
          <Route path="usage" element={<UsageAdmin />} />
          <Route path="audit" element={<AuditAdmin />} />
          <Route path="channels" element={<ChannelsAdmin />} />
          <Route path="group-agents" element={<GroupAgentsAdmin />} />
          <Route path="agent-pods" element={<AgentPodsAdmin />} />
          <Route path="comm" element={<CommAdmin />} />
          <Route path="settings" element={<SettingsAdmin />} />
          <Route path="*" element={<Navigate to={adminPath("users")} replace />} />
        </Routes>
      </main>
    </div>
  );
}
