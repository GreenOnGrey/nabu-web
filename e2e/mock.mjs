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
// FTR.NAB.CMN-0008: requests of libraries and the profiles of sandbox images
const pkg = (ecosystem, name, users, agent, auto, kinds, extra = {}) => ({ ecosystem, name, aliases: [], users, signals: agent + auto, bySource: { agent, auto },
  byProfile: { documents: agent + auto }, byKind: kinds, previousSignals: Math.round((agent + auto) * 0.7), new: false, lastAt: T("10:00"), status: "new", ...extra });
const sandboxPackages = [
  pkg("pypi", "opencv-python", 14, 9, 23, { personal: 22, group: 7, service: 3 }, { aliases: [{ ecosystem: "python-module", name: "cv2", builtin: true }] }),
  pkg("apt", "ffmpeg", 9, 4, 17, { personal: 18, group: 3 }, { status: "planned", aliases: [{ ecosystem: "command", name: "ffmpeg", builtin: false }] }),
  pkg("pypi", "pymupdf", 6, 2, 8, { personal: 10 }, { status: "added", profile: "documents", version: "v0.4.0", previousSignals: 10 }),
  pkg("python-module", "qrcode", 4, 0, 5, { personal: 4, service: 1 }, { new: true, previousSignals: 0 }),
  pkg("pypi", "tensorflow", 3, 3, 2, { personal: 5 }, { status: "rejected", note: "Слишком тяжёлый", previousSignals: 7 }),
  pkg("pypi", "reqeusts", 1, 1, 0, { personal: 1 }, { new: true, previousSignals: 0, lookalike: "requests" }),
];
const prof = (name, kind, extra) => ({ name, kind, description: "", state: "ready", nodesReady: 1, nodesTotal: 1,
  assignedTo: { personal: false, group: false, services: [] }, baseVersion: "v0.5.0", ...extra });
const sandboxProfiles = { customImages: true, prefixes: ["registry.company.local/nabu/"], currentVersion: "v0.5.0",
  assignments: { personal: "company-tools", group: "documents", defaults: { personal: "documents", group: "documents", service: "base" } },
  profiles: [
    prof("base", "builtin", { imageRef: "ghcr.io/greenongrey/nabu-sandbox-base:v0.5.0", assignedTo: { personal: false, group: false, services: ["memory-collector"] },
      inventory: { name: "base", kind: "builtin", tools: [{ group: "Архивы", name: "zip", version: "3.0" }, { group: "Python", name: "python3", version: "3.13.5" }] } }),
    prof("documents", "builtin", { imageRef: "ghcr.io/greenongrey/nabu-sandbox-documents:v0.5.0", assignedTo: { personal: false, group: true, services: ["report-builder"] },
      inventory: { name: "documents", kind: "builtin", includes: "base", tools: [{ group: "PDF", name: "typst", version: "0.15.1" }], python: [{ name: "pandas", version: "3.1.0" }] } }),
    prof("company-tools", "custom", { imageRef: "registry.company.local/nabu/company-tools:2025.10", imageDigest: "sha256:3f9a1d2c4b5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5ec21e",
      baseVersion: "v0.4.0", nodesReady: 2, nodesTotal: 3, description: "Есть Oracle Instant Client и sqlplus.", assignedTo: { personal: true, group: false, services: [] },
      inventory: { name: "company-tools", kind: "custom", commands: ["sqlplus", "corp-tickets"], python: [{ name: "oracledb", version: "3.3.0" }] } }),
    prof("oracle-client", "custom", { imageRef: "registry.company.local/nabu/oracle-client:1.2", state: "error", error: "sandbox_probe_no_bash", nodesReady: 0, nodesTotal: 0 }),
  ] };

const model = { connectionId: "c1", model: "sonnet", name: "sonnet-5", connection: "Anthropic", caps: { image: true, tools: true, reasoning: true, contextWindow: 200000 } };
const flash = { connectionId: "c2", model: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", connection: "DeepSeek", caps: { image: true, tools: true, reasoning: false, contextWindow: 128000 } };
const agent = { name: "Набу", tone: "business", model, defaultModel: model, chosen: false, availableModels: [model, flash], context: { tokens: 42000, window: 200000 } };
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
    // FTR.NAB.CHAT-0001 R33, R34: files the agent sent — a thumbnail, tiles of the preview, a download tile
    msg("m2f", "assistant", "Отчёт, таблица и график — во вложениях.", { createdAt: T("14:03"), attachments: [
      { id: "fa1", fileName: "chart.png", mimeType: "image/png", size: 68 },
      { id: "fa2", fileName: "release-notes.md", mimeType: "text/markdown", size: 120 },
      { id: "fa3", fileName: "metrics.csv", mimeType: "text/csv", size: 90 },
      { id: "fa4", fileName: "data.zip", mimeType: "application/zip", size: 1204000 },
    ] }),
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
const files = [{ path: "notes/план.md", size: 2048, sha256: "ab12", modifiedAt: T("13:00"), modifiedBy: "agent" }, { path: "счёт.pdf", size: 120000, sha256: "cd34", modifiedAt: T("08:40"), modifiedBy: "user" },
  { path: "backup/archive.zip", size: 1204000, sha256: "ef56", modifiedAt: T("08:00"), modifiedBy: "agent" }];
const catalog = [{ id: "i1", type: "mcp", name: "github", title: "GitHub", description: "Задачи и запросы на изменение.", mode: "personal", authKind: "oauth", readOnly: false, status: "available", connected: true, connectedAt: T("09:00", "02"), inDevelopment: false },
  { id: "i2", type: "skill", name: "summary", title: "Сводка", description: "Краткое изложение длинных текстов.", mode: "platform", readOnly: true, status: "available", connected: false, connectedAt: null, inDevelopment: false }];
const users = [{ id: "u1", email: "ada@example.com", name: "Ада Лавлейс", isAdmin: true, status: "active", lastSeenAt: T("14:00"), createdAt: T("09:00", "01"), channels: ["telegram"] },
  { id: "u2", email: "alan@example.com", name: "Алан Тьюринг", isAdmin: false, status: "invited", lastSeenAt: null, createdAt: T("09:00", "05"), channels: [] },
  { id: "u3", email: "grace@example.com", name: "Грейс Хоппер", isAdmin: false, status: "blocked", lastSeenAt: T("10:00", "04"), createdAt: T("09:00", "02"), channels: [] }];
const commState = { allowed: false, available: false, consentAt: null, retentionDays: 90, semantic: false, sources: [], collect: { status: "off", pauseKind: null, nextRunAt: null, backfill: null, budgetUsedPct: 0 }, counts: { notes: 0, openCommitments: 0 } };

// A service client with an address: the edit and the delete dialogs open from its card (SVC-10, SVC-11).
const clients = [
  { id: "c1", name: "billing", url: "https://billing.example.org", clientId: "billing", agents: [], canDelegate: true, canImport: false,
    canArchive: false, canRestore: false, enabled: true, prevSecretExpiresAt: null, createdAt: "2026-01-12T09:00:00Z" },
];

// The catalog of the administration (FTR.NAB.CMN-0006 design §3): a checked item
// with allowed tools, a file argument and a new tool of the server; the form of
// a new item shows the plate "Save and check".
const tool = (name, readOnly, stringArgs, description) => ({ name, readOnly, destructive: !readOnly, stringArgs, description });
const adminCatalog = [
  { id: "a1", type: "mcp", name: "docling", title: "Документы", description: "Разбор PDF, DOCX и сканов.",
    source: { kind: "url", url: "http://docling-mcp.mcp.svc:8080/mcp" }, mode: "platform", personalAuth: null,
    platformAuth: { Authorization: "…3f9a" }, readOnly: false, exposure: "deferred", published: true, inDevelopment: false,
    status: "ok", statusReason: null, skills: [], syncedAt: null, checkedAt: T("11:42", "14"),
    tools: [tool("convert_document_into_docling_document", false, ["source"], "Convert a document from a URL or local path into a Docling document."),
      tool("export_docling_document_to_markdown", true, ["document_key"], "Export a cached Docling document to Markdown."),
      tool("get_overview_of_document_anchors", true, ["document_key"], "Overview of sections and items of a Docling document."),
      tool("list_cached_documents", true, [], "Return the keys of all Docling documents currently held in the cache."),
      tool("save_docling_document", false, ["document_key"], "Save a Docling document to disk."),
      tool("get_page_thumbnail", true, ["document_key"], "Thumbnail of a page.")],
    allowedTools: ["convert_document_into_docling_document", "export_docling_document_to_markdown", "get_overview_of_document_anchors"],
    fileArgs: [{ tool: "convert_document_into_docling_document", arg: "source" }], fileMaxBytes: 20971520,
    newTools: ["get_page_thumbnail"] },
];

// FTR.NAB.CMN-0007 design §3.1–3.2: the built-in groups and an ordinary one with its members.
const grants = { models: [{ connectionId: "c1", model: "sonnet" }], defaultModel: { connectionId: "c1", model: "sonnet" }, channels: ["telegram"], catalogItems: ["a1"] };
const userGroups = [
  { id: "g-admins", name: "Administrators", description: null, builtin: "admins", position: -1, memberCount: 1, grants: null, allEnabled: true },
  { id: "g-sales", name: "Продажи", description: "Отдел продаж", builtin: null, position: 1, memberCount: 2, grants, allEnabled: false },
  { id: "g-all", name: "All users", description: null, builtin: "all", position: 2147483647, memberCount: 3, grants: { ...grants, channels: [] }, allEnabled: false },
];
const members = [{ id: "u1", email: "ada@example.com", name: "Ада Лавлейс" }, { id: "u2", email: "alan@example.com", name: "Алан Тьюринг" }];

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
  if (p === "/admin/api/v1/clients") return { items: clients };
  if (p === "/admin/api/v1/catalog") return { items: adminCatalog };
  if (p === "/admin/api/v1/groups") return { items: userGroups };
  if (/^\/admin\/api\/v1\/groups\/[^/]+\/members$/.test(p)) return { items: members, nextCursor: null };
  if (p === "/admin/api/v1/harnesses") return { items: [{ name: "pi", version: "1.3.0", status: "ok" }] };
  // FTR.NAB.CMN-0008: sandbox images
  if (p === "/admin/api/v1/sandbox/packages") return { items: sandboxPackages };
  if (p.startsWith("/admin/api/v1/sandbox/packages/")) return { ...sandboxPackages[0], reasons: [
    { text: "Распознать таблицу на фото накладной перед загрузкой в Excel", profile: "documents", at: T("10:00") },
    { text: "Найти и вырезать подписи на сканах договоров", profile: "documents", at: T("09:00", "10") }],
    daily: [3, 5, 1, 0, 6, 8, 4, 7, 11, 5, 9, 12, 9, 13].map((n, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, signals: n })), history: [] };
  if (p === "/admin/api/v1/sandbox/profiles") return sandboxProfiles;
  if (p === "/admin/api/v1/voice") return { configured: true, ok: true, url: "http://whisper.nabu.svc:9000" };
  if (p === "/admin/api/v1/users") return { items: url.searchParams.get("status") === "archived" ? [] : users };
  return { items: [], nextCursor: null };
}

// the content of the attachments of the history (R34)
const files_ = {
  fa1: ["image/png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqH9cDwAE0QH6ziMKDgAAAABJRU5ErkJggg==", "base64")],
  fa2: ["text/markdown", Buffer.from("# Релиз 1.3\n\n- волна вместо микрофона\n- **предпросмотр** файлов\n")],
  fa3: ["text/csv", Buffer.from("date,requests,errors\n2026-10-13,1204,0.8\n2026-10-14,1377,0.6\n2026-10-15,1512,1.1\n")],
};

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
    const att = /^\/api\/v1\/attachments\/([^/]+)$/.exec(url.pathname);
    if (att) {
      const f = files_[att[1]];
      if (!f) { res.writeHead(404, { "content-type": "application/json" }); return res.end('{"error":{"code":"not_found","message":"attachment not found"}}'); }
      res.writeHead(200, { "content-type": "application/octet-stream", "x-content-type-options": "nosniff" });
      return res.end(f[1]);
    }
    if (url.pathname === "/api/v1/space/files/content") {
      res.writeHead(200, { "content-type": "application/octet-stream", "x-content-type-options": "nosniff" });
      return res.end(url.searchParams.get("path") === "notes/план.md" ? "# План\n\n- ревью спецификации\n- **релиз** в пятницу\n" : "");
    }
    if (url.pathname === "/api/v1/me" && cookie("mock-auth") === "0") { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"error":{"code":"unauthenticated","message":"sign in"}}'); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(api(url, cookie("mock-theme"))));
  }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "0.0.0.0", () => console.log(`mock ${DIST} on ${PORT}`));
