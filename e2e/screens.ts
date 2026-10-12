import type { Page } from "@playwright/test";

// The screens of the comparison (FTR.NAB.CMN-0005 qa §5): every route and the
// states that appear after a click. `only` limits a screen to one width.
export interface Screen {
  name: string;
  path: string;
  /** A visitor without a session: the sign-in screen. */
  visitor?: boolean;
  only?: "desktop" | "phone";
  /** What to do after the page has settled, before the shot. */
  act?: (page: Page) => Promise<void>;
}

const click = (name: string) => async (page: Page) => {
  await page.getByRole("button", { name, exact: true }).first().click();
};

const ADMIN = ["users", "channels", "group-agents", "agent-pods", "models", "harness", "catalog", "service-agents", "comm", "clients", "usage", "audit", "settings"];

export const SCREENS: Screen[] = [
  { name: "login", path: "/login", visitor: true },
  { name: "login-error", path: "/login?error=not_member", visitor: true },
  { name: "chat", path: "/" },
  { name: "chat-topic-empty", path: "/chat/t1" },
  { name: "chat-topic-mail", path: "/chat/t2" },
  { name: "chat-archived", path: "/chat/a1" },
  { name: "chat-agent-menu", path: "/", act: click("Агент") },
  { name: "chat-new-topic", path: "/", only: "desktop", act: click("Новая тема") },
  { name: "chat-conversations", path: "/", only: "phone", act: click("Разговоры") },
  { name: "chat-steps-open", path: "/", act: async (page) => { await page.getByRole("button", { name: /ещё \d+ шаг/ }).click(); } },
  { name: "profile-menu", path: "/", act: click("Профиль") },
  { name: "sections", path: "/", only: "phone", act: click("Разделы") },
  { name: "memory", path: "/memory" },
  { name: "memory-add", path: "/memory", act: async (page) => { await page.locator(".btn.primary.sm").first().click(); } },
  { name: "tasks", path: "/tasks" },
  { name: "space", path: "/space" },
  { name: "connections", path: "/connections" },
  { name: "admin", path: "/admin" },
  ...ADMIN.map((s) => ({ name: `admin-${s}`, path: `/admin/${s}` })),
];
