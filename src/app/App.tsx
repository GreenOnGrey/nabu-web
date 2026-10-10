import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { keys, useConfig, useMe } from "../api/queries";
import { connectEvents, disconnectEvents, onEvent, onReconnect } from "../lib/sse";
import { setDocumentLanguage } from "../lib/i18n";
import { Empty, Loading } from "../components/ui";
import { SessionProvider } from "./session";
import { Shell } from "./Shell";
import { LoginPage } from "../pages/Login";
import { ChatPage } from "../chat/ChatPage";
import { TasksPage } from "../pages/Tasks";
import { MemoryPage } from "../pages/Memory";
import { SpacePage } from "../pages/Space";
import { ConnectionsPage } from "../pages/Connections";

const AdminPage = lazy(() => import("../pages/admin/Admin").then((m) => ({ default: m.AdminPage })));

export function App() {
  const config = useConfig();
  const me = useMe();
  const location = useLocation();
  const { t } = useTranslation();

  if (config.isLoading || me.isLoading) return <Loading />;
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;
  if (unauthenticated || location.pathname === "/login") {
    if (!unauthenticated && me.data) return <Navigate to="/" replace />;
    return config.data ? <LoginPage config={config.data} /> : <Loading />;
  }
  if (me.error instanceof ApiError && (me.error.code === "user_blocked" || me.error.code === "user_archived")) {
    return (
      <main className="main">
        <Empty icon="lock" title={t(`errors.${me.error.code}`)} />
      </main>
    );
  }
  if (!me.data || !config.data) return <Loading />;
  return (
    <SessionProvider me={me.data} config={config.data}>
      <Authenticated />
    </SessionProvider>
  );
}

function Authenticated() {
  const me = useMe();
  const qc = useQueryClient();
  const { i18n } = useTranslation();

  // The interface language after sign-in comes from the profile.
  const lang = me.data?.language;
  useEffect(() => {
    if (lang && i18n.language !== lang) {
      i18n.changeLanguage(lang);
      setDocumentLanguage(lang);
    }
  }, [lang, i18n]);

  const theme = me.data?.theme;
  useEffect(() => {
    if (!theme) return;
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("nabu-theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  // Server-sent events keep lists fresh; the chat page follows the stream itself.
  useEffect(() => {
    connectEvents();
    const inv = (key: readonly unknown[]) => () => qc.invalidateQueries({ queryKey: key });
    const offs = [
      onEvent("conversation.updated", inv(["conversations"])),
      onEvent("task.created", inv(["tasks"])),
      onEvent("task.updated", inv(["tasks"])),
      onEvent("task.run.finished", () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["taskRuns"] });
      }),
      onEvent("memory.changed", inv(["memories"])),
      onEvent("agent.updated", inv(keys.agent)),
      onEvent("space.state", () => {
        qc.invalidateQueries({ queryKey: keys.space });
        qc.invalidateQueries({ queryKey: keys.files });
      }),
      onEvent("conversation.unread", inv(["conversations"])),
      onEvent("access.changed", inv(keys.channels)),
      onEvent("connections.changed", () => {
        qc.invalidateQueries({ queryKey: keys.catalog });
        qc.invalidateQueries({ queryKey: keys.channels });
        qc.invalidateQueries({ queryKey: keys.me });
      }),
      onReconnect(() => qc.invalidateQueries()),
    ];
    return () => {
      offs.forEach((off) => off());
      disconnectEvents();
    };
  }, [qc]);

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<ChatPage />} />
        <Route path="chat/:id" element={<ChatPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="space" element={<SpacePage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="admin/*" element={<Suspense fallback={<Loading />}><AdminPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
