import type { Page } from "@playwright/test";

// The screens of the comparison (FTR.NAB.CMN-0005 qa §5): every route and the
// states that appear after a click. `only` limits a screen to one width.
export interface Screen {
  name: string;
  path: string;
  /** A visitor without a session: the sign-in screen. */
  visitor?: boolean;
  only?: "desktop" | "phone";
  /** The memory of communications is on (mock-comm). */
  comm?: boolean;
  /** The type of the connection of the model of the collection (mock-collect-model); LiteLLM by default. */
  collectModel?: "deepseek";
  /** What to do after the page has settled, before the shot. */
  act?: (page: Page) => Promise<void>;
}

const click = (name: string) => async (page: Page) => {
  await page.getByRole("button", { name, exact: true }).first().click();
};

const ADMIN = ["users", "channels", "group-agents", "agent-pods", "models", "groups", "catalog", "service-agents", "sandbox-images", "comm", "clients", "usage", "audit", "settings"];

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
  // FTR.NAB.CMN-0005 design §4: in the administration the burger holds its sections
  { name: "admin-sections", path: "/admin/audit", only: "phone", act: click("Администрирование") },
  { name: "memory", path: "/memory" },
  { name: "memory-add", path: "/memory", act: async (page) => { await page.locator(".btn.primary.sm").first().click(); } },
  // FTR.NAB.CMN-0003 design §3.1: the digest of a week names a channel the user has lost
  { name: "memory-tasks", path: "/memory?tab=tasks", comm: true }, // FTR.NAB.CMN-0003 qa TASK-21
  // FTR.NAB.CMN-0003 R19: the graph of people and topics, at rest and with a pinned person
  { name: "memory-graph", path: "/memory?tab=comm&view=graph", comm: true },
  { name: "memory-graph-pinned", path: "/memory?tab=comm&view=graph", comm: true, act: async (page) => {
    await page.getByRole("button", { name: /^Анна Петрова/ }).click();
    await page.mouse.move(0, 0);
  } },
  // FTR.NAB.CMN-0003 qa UI-12: a commitment from the chat with the link to its conversation
  { name: "memory-commitments", path: "/memory?tab=commitments", comm: true },
  { name: "tasks", path: "/tasks" },
  { name: "space", path: "/space" },
  // FTR.NAB.CHAT-0001 R34: a file of the space opens in the preview
  { name: "space-preview", path: "/space", act: async (page) => {
    // ATT-21: the button stands before «Download»; a file without a preview has none
    const row = page.getByRole("row", { name: /notes\/план\.md/ });
    const buttons = await row.locator(".file-actions > *").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim()));
    if (buttons[0] !== "Просмотреть notes/план.md" || buttons[1] !== "Скачать") throw new Error(`ATT-21: the actions are ${buttons.join(", ")}`);
    if (await page.getByRole("button", { name: "Просмотреть backup/archive.zip" }).count()) throw new Error("ATT-21: an archive has a preview");
    await page.getByRole("button", { name: "Просмотреть notes/план.md" }).click();
    await page.getByRole("dialog").getByRole("heading", { name: "План" }).waitFor();
  } },
  { name: "connections", path: "/connections" },
  { name: "admin", path: "/admin" },
  ...ADMIN.map((s) => ({ name: `admin-${s}`, path: `/admin/${s}` })),
  // FTR.NAB.CMN-0003 qa UI-13: the explicit thinking off of the model of the collection, under the block «Сбор»
  { name: "admin-comm-thinking", path: "/admin/comm", act: async (page) => { await page.getByText("Отключать размышление явно").scrollIntoViewIfNeeded(); } },
  // UI-13: a DeepSeek model of the collection gets the hint instead of the switch
  { name: "admin-comm-thinking-deepseek", path: "/admin/comm", collectModel: "deepseek",
    act: async (page) => { await page.getByText("Размышление этой модели при сборе отключается всегда.").scrollIntoViewIfNeeded(); } },
  // FTR.NAB.CHAT-0001 design §3.4: a new connection — the models the provider lists and their prices
  { name: "admin-models-add", path: "/admin/models", act: async (page) => {
    await page.getByRole("button", { name: "Добавить подключение" }).click();
    await page.getByRole("button", { name: "OpenAI-совместимый" }).click();
    await page.getByLabel("Ключ", { exact: true }).fill("sk-live-0123456789");
    await page.getByLabel("Базовый URL").fill("https://litellm.apps.citydrive.ru/v1");
    await page.getByRole("button", { name: "Загрузить модели" }).click();
    await page.getByRole("dialog").getByRole("checkbox", { name: "GLM-5.3" }).waitFor();
  } },
  // FTR.NAB.CMN-0008 design §3: the card of a package, the profiles
  { name: "admin-sandbox-package", path: "/admin/sandbox-images", only: "desktop", act: async (page) => { await page.getByText("opencv-python").first().click(); } },
  { name: "admin-sandbox-profiles", path: "/admin/sandbox-images", act: async (page) => { await page.getByRole("tab", { name: "Профили" }).click(); } },
  // FTR.HMR.CMN-0007 design §3: the proxies, a proxy of package registries open
  { name: "admin-sandbox-proxies", path: "/admin/sandbox-images", act: async (page) => { await page.getByRole("tab", { name: "Прокси" }).click(); } },
  { name: "admin-sandbox-proxy-edit", path: "/admin/sandbox-images", only: "desktop", act: async (page) => {
    await page.getByRole("tab", { name: "Прокси" }).click();
    await page.getByRole("button", { name: "Изменить" }).first().click();
    await page.getByRole("dialog").waitFor();
  } },
  { name: "admin-clients-edit", path: "/admin/clients", act: click("Изменить") },
  { name: "admin-clients-delete", path: "/admin/clients", act: click("Удалить") },
  // FTR.NAB.CMN-0006 design §3: the tools of a checked item with its file argument open, and a new item before a check
  { name: "admin-catalog-tools", path: "/admin/catalog", act: async (page) => {
    await click("Изменить")(page);
    await page.getByRole("button", { name: /^Аргументы/ }).first().click();
  } },
  { name: "admin-catalog-new", path: "/admin/catalog", act: click("Добавить MCP") },
  // FTR.NAB.ADM-0001 design §3.1: OAuth MCP of an item, registered
  { name: "admin-catalog-mcp-oauth", path: "/admin/catalog", act: async (page) => {
    await page.getByRole("button", { name: "Изменить" }).nth(1).click();
    await page.getByRole("dialog").getByText("nabu-7f3c2a", { exact: false }).waitFor();
    // FTR.NAB.ADM-0001 CAT-NODEV-03: no switch «in development»
    if (await page.getByRole("dialog").getByText("в разработке").count()) throw new Error("CAT-NODEV-03: the switch is shown");
  } },
  // FTR.NAB.CMN-0007 design §3.2: the card of an ordinary group
  { name: "admin-groups-card", path: "/admin/groups", act: async (page) => { await page.getByText("Продажи", { exact: true }).click(); } },
  // FTR.NAB.CMN-0002 design §3.3, FTR.NAB.CMN-0001 design §3.7: the card of a user and the block that asks first
  // FTR.NAB.CMN-0002 qa UI-06: the card and the confirmation of a block
  { name: "admin-users-card", path: "/admin/users", act: async (page) => { await page.getByRole("button", { name: "Алан Тьюринг" }).click(); } },
  { name: "admin-users-block", path: "/admin/users", act: click("Заблокировать") },
  // FTR.NAB.CMN-0005 qa CMP-01: the dialog keeps the focus in the field being typed in — the form beside it renders
  // on every letter and makes a new onClose with it (ui-kit 1.19.0)
  { name: "admin-groups-create", path: "/admin/groups", act: async (page) => {
    await page.getByRole("button", { name: "Создать группу" }).click();
    const note = page.getByRole("dialog").getByLabel("Описание");
    await note.click();
    await page.keyboard.type("Отдел продаж");
    if (!(await note.evaluate((el) => el === document.activeElement))) throw new Error("CMP-01: the focus left the field being typed in");
    if ((await note.inputValue()) !== "Отдел продаж") throw new Error("CMP-01: the text did not reach the field");
  } },
];
