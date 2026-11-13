import { expect, type Page } from "@playwright/test";

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
  /** A scenario of the report of the catalog: its goal window (TIL-01) or its administration log (ACT-16). */
  usage?: "goal" | "events";
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
  // FTR.NAB.CMN-0003 R19: the graph of people and topics, at rest and with a pinned person
  { name: "memory-graph", path: "/memory?tab=comm&view=graph", comm: true },
  { name: "memory-graph-pinned", path: "/memory?tab=comm&view=graph", comm: true, act: async (page) => {
    await page.getByRole("button", { name: /^Анна Петрова/ }).click();
    await page.mouse.move(0, 0);
  } },
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
  // FTR.NAB.CHAT-0005 design §3.1: the tab «Usage» of the catalog
  { name: "admin-catalog-usage", path: "/admin/catalog", act: click("Использование") },
  // FTR.NAB.CHAT-0005 qa ACT-06 (R27, R23): after a withdrawal the item is hidden by default and
  // comes back under «включая снятые» with the date of the withdrawal and without hints
  { name: "admin-catalog-usage-ACT-06", path: "/admin/catalog", act: async (page) => {
    await click("Использование")(page);
    await expect(page.getByRole("row", { name: /github/ })).toBeVisible();
    await expect(page.getByText("yandex-mail", { exact: true })).toHaveCount(0);
    await page.getByLabel("Включая снятые").check();
    const row = page.getByRole("row", { name: /yandex-mail/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText("снята");
    await expect(row.locator(".nb-cu-chip")).toHaveCount(0);
  } },
  // FTR.NAB.CHAT-0005 qa ACT-16 (R31): the administration log carries the three catalog actions
  // after a withdrawal, a publication and a grant revocation, each with its reason and author
  { name: "admin-audit-ACT-16", path: "/admin/audit", usage: "events", act: async (page) => {
    const log = page.locator(".nb-adm-log");
    await expect(log).toBeVisible();
    await expect(log).toContainText("catalog.unpublish");
    await expect(log).toContainText("catalog.publish");
    await expect(log).toContainText("catalog.grant.revoke");
    await expect(log).toContainText("переходим на Jira");
    await expect(log).toContainText("evgeny@example.com");
  } },
  // FTR.NAB.CHAT-0005 qa SEC-01 (R26): a filter by a group of two people shows numbers only — no names or lists
  { name: "admin-catalog-usage-SEC-01", path: "/admin/catalog", act: async (page) => {
    await click("Использование")(page);
    await expect(page.getByRole("row", { name: /github/ })).toBeVisible();
    await page.getByLabel("Группа").selectOption({ label: "Продажи" });
    const report = page.locator(".nb-cu");
    await expect(report).not.toContainText("Ада Лавлейс");
    await expect(report).not.toContainText("Алан Тьюринг");
    await expect(report).not.toContainText("@example.com");
    await expect(page.getByRole("row", { name: /github/ })).toContainText("310");
  } },
  // FTR.NAB.CHAT-0005 qa TIL-01 (R16): ninety days of data — the goal tile shows its value,
  // the tools and the success share carry their trends, the tops are filled
  { name: "admin-catalog-usage-TIL-01", path: "/admin/catalog", usage: "goal", act: async (page) => {
    await click("Использование")(page);
    const tiles = page.locator(".nb-cu-tiles");
    await expect(tiles).toContainText("доля мёртвых");
    await expect(tiles).toContainText("инструментов в опубликованных позициях");
    await expect(tiles).toContainText("доля успешных вызовов");
    await expect(tiles).toContainText("топ вызовов");
    await expect(tiles).toContainText("топ ошибок");
    const dead = tiles.locator(".nb-cu-tile").filter({ hasText: "доля мёртвых" });
    await expect(dead.locator(".v")).toContainText("15");
    await expect(dead).toContainText("6 из 40");
    await expect(tiles).toContainText("тренд от 2 точек");
  } },
  // FTR.NAB.CMN-0007 design §3.2: the card of an ordinary group
  { name: "admin-groups-card", path: "/admin/groups", act: async (page) => { await page.getByText("Продажи", { exact: true }).click(); } },
];
