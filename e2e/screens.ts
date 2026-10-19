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

const ADMIN = ["users", "channels", "group-agents", "agent-pods", "models", "groups", "catalog", "service-agents", "comm", "clients", "usage", "audit", "settings"];

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
  // FTR.NAB.CHAT-0001 R34: the preview of a file the agent sent
  { name: "chat-file-markdown", path: "/", act: async (page) => {
    await page.getByRole("button", { name: "Открыть release-notes.md" }).click();
    await page.getByRole("dialog").getByRole("heading", { name: "Релиз 1.3" }).waitFor();
  } },
  { name: "chat-file-table", path: "/", act: async (page) => {
    await page.getByRole("button", { name: "Открыть metrics.csv" }).click();
    await page.getByRole("dialog").locator("table").waitFor();
  } },
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
  { name: "admin-clients-edit", path: "/admin/clients", act: click("Изменить") },
  { name: "admin-clients-delete", path: "/admin/clients", act: click("Удалить") },
  // FTR.NAB.CMN-0006 design §3: the tools of a checked item with its file argument open, and a new item before a check
  { name: "admin-catalog-tools", path: "/admin/catalog", act: async (page) => {
    await click("Изменить")(page);
    await page.getByRole("button", { name: /^Аргументы/ }).first().click();
  } },
  { name: "admin-catalog-new", path: "/admin/catalog", act: click("Добавить MCP") },
  // FTR.NAB.CMN-0007 design §3.2: the card of an ordinary group
  { name: "admin-groups-card", path: "/admin/groups", act: async (page) => { await page.getByText("Продажи", { exact: true }).click(); } },
];
