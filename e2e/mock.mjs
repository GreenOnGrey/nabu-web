// A mock of the Nabu API with fixed data that serves one build of nabu-web — the
// server of the screen comparison (FTR.NAB.CMN-0005 qa §5, NAB-01):
//   DIST=<dist of a build> PORT=<n> node e2e/mock.mjs
// The state of a request comes with its cookies, so screens are shot in parallel:
//   mock-theme=light|dark   the theme of the profile
//   mock-auth=0             a visitor: /api/v1/me answers 401 and the app shows sign-in
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve(process.env.DIST ?? "dist");
const PORT = Number(process.env.PORT ?? 5300);
const T = (hm, day = "11") => `2026-10-${day}T${hm}:00Z`;

const me = (theme = "light") => ({ id: "u1", email: "ada@example.com", name: "Ада Лавлейс", isAdmin: true, language: "ru", theme, timezone: "Europe/Moscow",
  channels: [{ kind: "telegram", available: true, reason: "all_users", binding: { account: "@ada", boundAt: T("09:00", "01") } }, { kind: "email", available: true, reason: "always", address: "ada@nabu.example" }] });
const config = { authProvider: "github", providerLabel: "GitHub", allowedOrg: "GreenOnGrey", languages: ["en", "ru", "de", "es", "zh"], defaultLanguage: "en",
  uploadMaxBytes: 20000000, voice: true, spaces: true, channels: { telegram: true, email: true }, version: "1.0.0" };
const model = { connectionId: "c1", model: "sonnet", name: "sonnet-5", connection: "Anthropic" };
const agent = { name: "Набу", tone: "business", model, availableModels: [model] };
const conv = (id, kind, title, extra = {}) => ({ id, kind, title, lastMessageAt: T("14:12"), archivedAt: null, createdAt: T("09:00", "01"), source: "chat", unreadCount: 0, writesRequireConfirmation: false, ...extra });
const conversations = [conv("main", "main", null), conv("t1", "topic", "Релиз 1.4", { lastMessageAt: T("10:00") }),
  conv("t2", "topic", "Счёт от поставщика", { source: "email", unreadCount: 2, writesRequireConfirmation: true, lastMessageAt: T("08:30") })];
const archived = [conv("a1", "topic", "Переезд на поды", { archivedAt: T("12:00", "03"), lastMessageAt: T("12:00", "03") })];
const msg = (id, role, text, extra = {}) => ({ id, conversationId: "main", role, text, channel: "web", status: "done", attachments: [], toolSteps: [], model: "sonnet", errorClass: null, errorText: null, replyTo: null, createdAt: T("14:00"), ...extra });
const step = (id, tool, summary, status = "done", server = "nabu") => ({ id, server, tool, summary, status });
const messages = {
  main: [
    msg("m1", "user", "Какие требования ещё не покрыты тестами?", { createdAt: T("14:01") }),
    msg("m2", "assistant", "Без тестов остаются три требования:\n\n- **R17** — перечень изменений\n- **R23** — запрет переопределений\n- **R26** — отставание версии\n\n| Требование | Тест |\n|---|---|\n| R17 | `HMR-01` |\n| R23 | `CHK-01` |\n\n```\nnpm run lint\n```", {
      createdAt: T("14:02"), toolSteps: [step("s1", "memory_search", "memory_search — найдено 3 записи"), step("s2", "read", "read — spec.md", "done", "workspace")] }),
    msg("m3", "user", "Напомни завтра в 10 про ревью", { createdAt: T("14:10"), channel: "telegram", attachments: [{ id: "f1", fileName: "план.pdf", mimeType: "application/pdf", size: 1200 }] }),
    msg("m4", "assistant", "Готово: напомню завтра в 10:00.", { createdAt: T("14:10"), channel: "telegram",
      toolSteps: [1, 2, 3, 4, 5].map((n) => step(`t${n}`, "tasks_create", `tasks_create — шаг ${n}`, n === 4 ? "error" : "done")) }),
    msg("m5", "user", "Собери перечень изменений", { createdAt: T("14:12") }),
    msg("m6", "assistant", "", { createdAt: T("14:12"), status: "failed", errorClass: "rate_limit" }),
  ],
  t1: [],
  t2: [
    msg("e1", "user", "Добрый день! Высылаю счёт за октябрь.", { conversationId: "t2", channel: "email", createdAt: T("08:30"),
      context: { email: { from: "sales@example.com", fromName: "Поставщик", to: ["ada@nabu.example"], cc: ["boss@example.com"], subject: "Счёт №42", mode: "direct", quoted: "> Прошу выслать счёт.", tooLarge: null } } }),
    msg("e2", "assistant", "Счёт получен. Подготовил ответ — нужно подтверждение отправки.", { conversationId: "t2", channel: "email", createdAt: T("08:31") }),
    msg("e3", "user", "", { conversationId: "t2", createdAt: T("08:32"), context: { confirmation: { id: "c0", status: "approved", summary: "сохранить счёт в пространство" } } }),
  ],
  a1: [msg("o1", "user", "Когда переезд?", { conversationId: "a1", createdAt: T("11:00", "03") }), msg("o2", "assistant", "Переезд завершён 3 октября.", { conversationId: "a1", createdAt: T("11:01", "03") })],
};
const confirmations = [{ id: "c1", conversationId: "t2", server: "mail", tool: "send", summary: "отправить письмо поставщику", argsPreview: '{ "to": "sales@example.com", "subject": "Re: Счёт №42" }', status: "pending", createdAt: T("08:33"), expiresAt: T("09:33") }];
const tasks = [{ id: "k1", title: "Утренняя сводка", instruction: "Собери почту и календарь", schedule: { kind: "daily", time: "09:00" }, channel: "telegram", status: "active", nextRunAt: T("06:00", "12"), failures: 0, pauseReason: null,
  lastRun: { at: T("06:00"), status: "ok", summary: "Сводка отправлена" }, createdAt: T("09:00", "01"), kind: "agent", pauseKind: null }];
const memories = [{ id: "y1", text: "Предпочитает краткие ответы.", source: "agent", pinned: true, createdAt: T("09:00", "02"), updatedAt: T("09:00", "02") },
  { id: "y2", text: "Работает в часовом поясе Москвы.", source: "user", pinned: false, createdAt: T("09:00", "03"), updatedAt: T("09:00", "03") }];
const space = { state: "running", usedBytes: 1200000, quotaBytes: 100000000, files: 2, lastActivityAt: T("13:00"), enabled: true };
const files = [{ path: "notes/план.md", size: 2048, sha256: "ab12", modifiedAt: T("13:00"), modifiedBy: "agent" }, { path: "счёт.pdf", size: 120000, sha256: "cd34", modifiedAt: T("08:40"), modifiedBy: "user" }];
const catalog = [{ id: "i1", type: "mcp", name: "github", title: "GitHub", description: "Задачи и запросы на изменение.", mode: "personal", authKind: "oauth", readOnly: false, status: "available", connected: true, connectedAt: T("09:00", "02"), inDevelopment: false },
  { id: "i2", type: "skill", name: "summary", title: "Сводка", description: "Краткое изложение длинных текстов.", mode: "platform", readOnly: true, status: "available", connected: false, connectedAt: null, inDevelopment: false }];
const users = [{ id: "u1", email: "ada@example.com", name: "Ада Лавлейс", isAdmin: true, status: "active", lastSeenAt: T("14:00"), createdAt: T("09:00", "01"), channels: ["telegram"] },
  { id: "u2", email: "alan@example.com", name: "Алан Тьюринг", isAdmin: false, status: "invited", lastSeenAt: null, createdAt: T("09:00", "05"), channels: [] },
  { id: "u3", email: "grace@example.com", name: "Грейс Хоппер", isAdmin: false, status: "blocked", lastSeenAt: T("10:00", "04"), createdAt: T("09:00", "02"), channels: [] }];
const commState = { allowed: false, available: false, consentAt: null, retentionDays: 90, semantic: false, sources: [], collect: { status: "off", pauseKind: null, nextRunAt: null, backfill: null, budgetUsedPct: 0 }, counts: { notes: 0, openCommitments: 0 } };

function api(url, theme) {
  const p = url.pathname;
  if (p === "/api/v1/me") return me(theme);
  if (p === "/api/v1/config") return config;
  if (p === "/api/v1/agent") return agent;
  if (p === "/api/v1/conversations") return { items: url.searchParams.get("archived") === "true" ? archived : conversations };
  let m = /^\/api\/v1\/conversations\/([^/]+)\/messages$/.exec(p);
  if (m) return { items: messages[m[1]] ?? [], nextCursor: m[1] === "main" ? "older" : null };
  if (p === "/api/v1/confirmations") return { items: confirmations.filter((c) => c.conversationId === url.searchParams.get("conversationId")) };
  if (p === "/api/v1/tasks") return { items: tasks, nextCursor: null };
  if (/^\/api\/v1\/tasks\/[^/]+\/runs$/.test(p)) return { items: [], nextCursor: null };
  if (p === "/api/v1/memories") return { items: memories, nextCursor: null };
  if (p === "/api/v1/space") return space;
  if (p === "/api/v1/space/files") return { items: files, nextCursor: null };
  if (p === "/api/v1/catalog") return { items: catalog };
  if (p === "/api/v1/channels") return { items: me().channels };
  if (p === "/api/v1/comm/state") return commState;
  if (p === "/admin/api/v1/users") return { items: url.searchParams.get("status") === "archived" ? [] : users };
  return { items: [], nextCursor: null };
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".map": "application/json" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const cookie = (name) => new RegExp(`(?:^|; )${name}=([^;]*)`).exec(req.headers.cookie ?? "")?.[1];
  if (url.pathname === "/config.json") { res.writeHead(404); return res.end(); }
  if (url.pathname === "/api/v1/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    // closed at once and not to be retried soon: an open stream would hold the virtual time of a headless screenshot
    return res.end("retry: 600000\n\n");
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/api/")) {
    if (req.method !== "GET") { res.writeHead(204); return res.end(); }
    if (url.pathname === "/api/v1/me" && cookie("mock-auth") === "0") { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"error":{"code":"unauthenticated","message":"sign in"}}'); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(api(url, cookie("mock-theme"))));
  }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "0.0.0.0", () => console.log(`mock ${DIST} on ${PORT}`));
