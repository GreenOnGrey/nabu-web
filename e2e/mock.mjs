// A mock of the Nabu API with fixed data that serves one build of nabu-web — the
// server of the screen comparison (FTR.NAB.CMN-0005 qa §5, NAB-01):
//   DIST=<dist of a build> PORT=<n> node e2e/mock.mjs
// The state of a request comes with its cookies, so screens are shot in parallel:
//   mock-theme=light|dark   the theme of the profile
//   mock-auth=0             a visitor: /api/v1/me answers 401 and the app shows sign-in
//   mock-comm=1             the memory of communications is on, with people, topics and their graph
//   mock-collect-model=deepseek  the model of the collection is behind a DeepSeek connection
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve(process.env.DIST ?? "dist");
const PORT = Number(process.env.PORT ?? 5300);
const T = (hm, day = "11") => `2026-10-${day}T${hm}:00Z`;

const me = (theme = "light") => ({ id: "u1", email: "ada@example.com", name: "Ада Лавлейс", isAdmin: true, language: "ru", theme, timezone: "Europe/Moscow",
  channels: [{ kind: "telegram", available: true, reason: "all_users", binding: { account: "@ada", boundAt: T("09:00", "01") } }, { kind: "email", available: true, reason: "always", address: "ada@nabu.example" }] });
const config = { authProvider: "github", providerLabel: "GitHub", allowedOrg: "GreenOnGrey", languages: ["en", "ru", "de", "es", "zh"], defaultLanguage: "en",
  uploadMaxBytes: 20000000, voice: true, spaces: true, turnStaleSeconds: 1860, channels: { telegram: true, email: true }, version: "1.0.0" };

// FTR.NAB.CMN-0001 R28 (design §3.10): the audit, with a row whose details are long
// enough to be cut in the table and opened by a click
const auditRows = [
  { id: 12, at: T("10:42"), agentKind: "personal", agent: "Ассистент", userEmail: "ada@example.com", clientName: null, initiatorEmail: null,
    channel: "web", server: "hammurapi", tool: "read_document",
    argsSummary: JSON.stringify({ path: "reports/q1.pdf", pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ocr: false }),
    result: "error",
    error: "MCP error -32603: the document service is unavailable: the connection was refused by the upstream at 10.0.0.14:8443 after 30 s" },
  { id: 11, at: T("10:31"), agentKind: "personal", agent: "Ассистент", userEmail: "ada@example.com", clientName: "Portfolio", initiatorEmail: "ada@example.com",
    channel: "client:portfolio", server: "nabu", tool: "chat_attach",
    argsSummary: JSON.stringify({ path: "reports/summary.md" }), result: "ok", error: null },
  { id: 10, at: T("09:58"), agentKind: "service", agent: "memory-collector", userEmail: null, clientName: null, initiatorEmail: "ada@example.com",
    channel: "email", server: null, tool: "model", argsSummary: JSON.stringify({ errorClass: "rate_limit" }),
    result: "error", error: "429 Too Many Requests: the provider slowed the request down" },
];

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
// FTR.HMR.CMN-0007 R16, R21: the proxies of sandboxes
const sandboxProxies = [
  { name: "packages", kind: "packages", title: "Реестры пакетов", description: "npm, Go-модули и PyPI для сборки и тестов проекта.",
    ecosystems: ["go", "npm", "pypi"], registries: [{ ecosystem: "npm", url: "https://npm.company.local", internal: true, tokenSet: true }],
    allow: [{ host: "proxy.golang.org", port: 443, internal: false }, { host: "registry.npmjs.org", port: 443, internal: false },
      { host: "pypi.org", port: 443, internal: false }, { host: "files.pythonhosted.org", port: 443, internal: false }, { host: "npm.company.local", port: 443, internal: true }],
    env: [{ name: "GOPROXY", value: "https://proxy.golang.org", secret: false }, { name: "GOFLAGS", value: "-mod=mod", secret: false },
      { name: "PIP_INDEX_URL", value: "https://pypi.org/simple", secret: false }, { name: "NPM_TOKEN", secret: true, set: true }],
    state: "ok", checkedAt: T("10:00"), assigned: { personal: false, group: false, services: ["hammurapi-codegen", "hammurapi-review-update"] } },
  { name: "corp-docs", kind: "hosts", title: "Вики компании", description: "Внутренняя вики: регламенты и шаблоны документов.",
    allow: [{ host: "wiki.company.local", port: 443, internal: true }, { host: "*.docs.company.local", port: 443, internal: true }],
    env: [{ name: "WIKI_TOKEN", secret: true, set: true }],
    state: "unreachable", checkError: "dial tcp 10.0.4.12:443: i/o timeout", checkedAt: T("10:00"), assigned: { personal: true, group: false, services: [] } },
];
const proxyTemplates = { packages: {
  go: { hosts: ["proxy.golang.org", "sum.golang.org"], env: ["GOPROXY=https://proxy.golang.org", "GOFLAGS=-mod=mod"] },
  npm: { hosts: ["registry.npmjs.org"], env: [] },
  pypi: { hosts: ["pypi.org", "files.pythonhosted.org"], env: ["PIP_INDEX_URL=https://pypi.org/simple"] } } };
const prof = (name, kind, extra) => ({ name, kind, description: "", state: "ready", nodesReady: 1, nodesTotal: 1,
  assignedTo: { personal: false, group: false, services: [] }, baseVersion: "v0.5.0", ...extra });
const sandboxProfiles = { customImages: true, prefixes: ["registry.company.local/nabu/"], currentVersion: "v0.5.0",
  assignments: { personal: "company-tools", group: "documents", proxies: { personal: ["corp-docs"], group: [] },
    defaults: { personal: "documents", group: "documents", service: "base" } },
  profiles: [
    prof("base", "builtin", { imageRef: "ghcr.io/greenongrey/nabu-sandbox-base:v0.5.0", assignedTo: { personal: false, group: false, services: ["memory-collector"] },
      inventory: { name: "base", kind: "builtin", tools: [{ group: "archives", name: "zip", version: "3.0" }, { group: "python", name: "python3", version: "3.13.5" }] } }),
    prof("documents", "builtin", { imageRef: "ghcr.io/greenongrey/nabu-sandbox-documents:v0.5.0", assignedTo: { personal: false, group: true, services: ["report-builder"] },
      inventory: { name: "documents", kind: "builtin", includes: "base", tools: [{ group: "PDF", name: "typst", version: "0.15.1" }], python: [{ name: "pandas", version: "3.1.0" }] } }),
    prof("company-tools", "custom", { imageRef: "registry.company.local/nabu/company-tools:2025.10", imageDigest: "sha256:3f9a1d2c4b5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5ec21e",
      baseVersion: "v0.4.0", nodesReady: 2, nodesTotal: 3, description: "Есть Oracle Instant Client и sqlplus.", assignedTo: { personal: true, group: false, services: [] },
      inventory: { name: "company-tools", kind: "custom", commands: ["sqlplus", "corp-tickets"], python: [{ name: "oracledb", version: "3.3.0" }] } }),
    prof("oracle-client", "custom", { imageRef: "registry.company.local/nabu/oracle-client:1.2", state: "error", error: "sandbox_probe_no_bash", nodesReady: 0, nodesTotal: 0 }),
  ] };

const model = { connectionId: "c1", model: "sonnet", name: "sonnet-5", connection: "Anthropic", caps: { image: true, tools: true, reasoning: true, contextWindow: 200000 },
  price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } };
const flash = { connectionId: "c2", model: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", connection: "DeepSeek", caps: { image: true, tools: true, reasoning: false, contextWindow: 128000 },
  price: { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0 } };
// FTR.NAB.CHAT-0001 R16: many models — the list scrolls and the menu keeps its place on the screen
// FTR.NAB.CHAT-0001 R16: a model whose price Nabu does not know (GigaChat is billed by packages) has no price
const extra = [["giga", "GigaChat 2 Max", "GigaChat", 131072, false], ["giga", "GigaChat 2 Lite", "GigaChat", 131072, false],
  ["zai", "GLM-4.6", "Z.AI", 200000, true, { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 }],
  ["zai", "GLM-4.5-Air", "Z.AI", 128000, false, { input: 0.2, output: 1.1, cacheRead: 0.02, cacheWrite: 0 }],
  ["ds", "DeepSeek V4.1 Pro", "DeepSeek", 1000000, false, { input: 1.74, output: 3.48, cacheRead: 0.145, cacheWrite: 0 }],
  ["oa", "gpt-5.1", "OpenAI", 400000, false, { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 }],
  ["oa", "gpt-5.1-mini", "OpenAI", 400000, false, { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 }],
  ["oa", "o4-mini", "OpenAI", 200000, false, { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 0 }],
  ["oa", "gemini-3-pro", "Google", 1000000, false, { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 }]]
  .map(([c, name, connection, window, image, price]) => ({
    connectionId: c, model: name, name, connection, caps: { image, tools: true, reasoning: false, contextWindow: window },
    ...(price ? { price } : {}) }));
const agent = { name: "Набу", tone: "business", model, defaultModel: model, chosen: false, availableModels: [model, flash, ...extra], context: { tokens: 42000, window: 200000 } };
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
  lastRun: { at: T("06:00"), status: "ok", summary: "Сводка отправлена" }, createdAt: T("09:00", "01"), kind: "agent", pauseKind: null },
  // FTR.NAB.ADM-0001 R10: a run of the collection that stopped at the limit of a chat
  { id: "k2", title: "", instruction: "", schedule: { kind: "cron", cron: "17 8-19 * * *" }, channel: "web", status: "active", nextRunAt: T("14:17"), failures: 0, pauseReason: null,
    lastRun: { at: T("13:17"), status: "ok", summary: "messages:42 notes:7\ntruncated:{\"tech-devs\":1000}" }, createdAt: T("09:00", "01"), kind: "memory_collect", pauseKind: null,
    settings: { interval: "1h", roundTheClock: false } }];
const memories = [{ id: "y1", text: "Предпочитает краткие ответы.", source: "agent", pinned: true, createdAt: T("09:00", "02"), updatedAt: T("09:00", "02") },
  { id: "y2", text: "Работает в часовом поясе Москвы.", source: "user", pinned: false, createdAt: T("09:00", "03"), updatedAt: T("09:00", "03") }];
const space = { state: "running", usedBytes: 1200000, quotaBytes: 100000000, files: 2, lastActivityAt: T("13:00"), enabled: true };
const files = [{ path: "notes/план.md", size: 2048, sha256: "ab12", modifiedAt: T("13:00"), modifiedBy: "agent" }, { path: "счёт.pdf", size: 120000, sha256: "cd34", modifiedAt: T("08:40"), modifiedBy: "user" },
  { path: "backup/archive.zip", size: 1204000, sha256: "ef56", modifiedAt: T("08:00"), modifiedBy: "agent" }];
const catalog = [{ id: "i1", type: "mcp", name: "github", title: "GitHub", description: "Задачи и запросы на изменение.", mode: "personal", authKind: "oauth", readOnly: false, status: "available", connected: true, connectedAt: T("09:00", "02") },
  { id: "i2", type: "skill", name: "summary", title: "Сводка", description: "Краткое изложение длинных текстов.", mode: "platform", readOnly: true, status: "available", connected: false, connectedAt: null }];
// FTR.NAB.CMN-0007 R7: the groups come with the row of the list; the role is the built-in «Administrators».
const users = [{ id: "u1", email: "ada@example.com", name: "Ада Лавлейс", isAdmin: true, status: "active", lastSeenAt: T("14:00"), createdAt: T("09:00", "01"), channels: ["telegram"],
    groups: [{ id: "g-sales", name: "Продажи", builtin: null }] },
  { id: "u2", email: "alan@example.com", name: "Алан Тьюринг", isAdmin: false, status: "invited", lastSeenAt: null, createdAt: T("09:00", "05"), channels: [],
    groups: [{ id: "g-sales", name: "Продажи", builtin: null }, { id: "g-legal", name: "Юристы", builtin: null }, { id: "g-ops", name: "Операции", builtin: null }, { id: "g-hr", name: "Найм", builtin: null }] },
  { id: "u3", email: "grace@example.com", name: "Грейс Хоппер", isAdmin: false, status: "blocked", lastSeenAt: T("10:00", "04"), createdAt: T("09:00", "02"), channels: [], groups: [] }];
// FTR.NAB.CMN-0002 design §3.3: the card of a user — the channels with their reasons and the access of the groups.
const userCardFor = (id) => ({ user: users.find((u) => u.id === id) ?? users[1], channels: [{ kind: "web", available: true, reason: "always" },
  { kind: "telegram", available: true, reason: "group" },
  { kind: "vkteams", available: false, reason: "disabled" }], groupAgents: [] });
const userAccess = { admin: false, groups: [{ id: "g-sales", name: "Продажи", builtin: null }],
  models: [{ connectionId: "c1", model: "sonnet", name: "Sonnet", connection: "Anthropic", via: ["g-sales"] }],
  defaultModel: { connectionId: "c1", model: "sonnet", source: "group", groupId: "g-sales" },
  channels: [{ kind: "telegram", via: ["g-sales"] }],
  catalogItems: [{ id: "a1", type: "mcp", title: "GitHub", mode: "personal", via: ["g-sales"] }] };
const commState = { allowed: false, available: false, consentAt: null, retentionMonths: 3, retentionDays: 90, compact: { lastAt: null }, semantic: false, sources: [], collect: { status: "off", pauseKind: null, nextRunAt: null, backfill: null, budgetUsedPct: 0 }, counts: { notes: 0, openCommitments: 0 } };

// A service client with an address: the edit and the delete dialogs open from its card (FTR.NAB.CMN-0001 SVC-10, SVC-11).
const clients = [
  { id: "c1", name: "billing", url: "https://billing.example.org", clientId: "billing", agents: [], canDelegate: true, canImport: false,
    canArchive: false, canRestore: false, enabled: true, prevSecretExpiresAt: null, createdAt: "2026-01-12T09:00:00Z" },
];

// FTR.NAB.CHAT-0001 design §3.4: a connection of models and the list its provider
// gives — prices with a long tail that the table rounds.
const mdef = (id, name, extra = {}) => ({ id, name, contextWindow: 128000, maxTokens: 64000, reasoning: false, input: ["text"], tools: true, ...extra });
const providerModels = [
  mdef("deepseek-v4.1-flash", "DeepSeek V4.1 Flash", { input: ["text", "image"], reasoning: true, contextWindow: 1000000,
    cost: { input: 53.23, output: 159.67999999999998, cacheRead: 5.32, cacheWrite: 0 } }),
  mdef("GLM-5.3", "GLM-5.3", { reasoning: true, contextWindow: 200000, maxTokens: 200000,
    cost: { input: 141.92999999999998, output: 496.7599999999993, cacheRead: 0, cacheWrite: 0 } }),
  mdef("qwen3.8-27b", "qwen3.8-27b", { reasoning: true, contextWindow: 262144 }),
  mdef("nemotron-embed-1b", "nemotron-embed-1b", { embeddings: true, tools: false }),
];
const modelConnections = [
  { id: "mc1", name: "LiteLLM", type: "openai_compatible", baseUrl: "https://litellm.apps.citydrive.ru/v1", options: {}, keyLast4: "9f3a",
    enabled: true, status: "ok", statusReason: null, checkedAt: T("10:00"), refreshedAt: T("10:00"), createdAt: T("09:00", "01"), newCount: 1,
    models: providerModels.slice(0, 3), discovered: [{ id: "glm-5.3-air", name: "GLM-5.3 Air", firstSeenAt: T("10:00") }] },
];
const connectionTypes = [
  { type: "deepseek", baseUrl: "https://api.deepseek.com/v1" },
  { type: "gigachat", scopes: ["GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"], defaultScope: "GIGACHAT_API_CORP" },
  { type: "zai", endpoints: { general: "https://api.z.ai/api/paas/v4", coding: "https://api.z.ai/api/coding/paas/v4" } },
  { type: "openai_compatible", baseUrl: "" },
];

// The catalog of the administration (FTR.NAB.CMN-0006 design §3): a checked item
// with allowed tools, a file argument and a new tool of the server; the form of
// a new item shows the plate "Save and check".
const tool = (name, readOnly, stringArgs, description) => ({ name, readOnly, destructive: !readOnly, stringArgs, description });
const adminCatalog = [
  { id: "a1", type: "mcp", name: "docling", title: "Документы", description: "Разбор PDF, DOCX и сканов.",
    source: { kind: "url", url: "http://docling-mcp.mcp.svc:8080/mcp" }, mode: "platform", personalAuth: null,
    platformAuth: { Authorization: "…3f9a" }, readOnly: false, exposure: "deferred", published: true,
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
  // FTR.NAB.ADM-0001 design §3.1: OAuth MCP found by the discovery
  { id: "a2", type: "mcp", name: "vk-workspace", title: "VK WorkSpace", description: "Почта и VK Teams.",
    source: { kind: "url", url: "https://ai.workspace.vk.ru/mcp" }, mode: "personal",
    personalAuth: { kind: "mcp_oauth", issuer: "https://ai.workspace.vk.ru", authorizeUrl: "https://ai.workspace.vk.ru/oauth/authorize",
      tokenUrl: "https://ai.workspace.vk.ru/oauth/token", resource: "https://ai.workspace.vk.ru/mcp", clientId: "nabu-7f3c2a", registeredAt: T("10:15", "13") },
    platformAuth: {}, readOnly: true, exposure: "deferred", published: true,
    status: null, statusReason: null, skills: [], syncedAt: null, checkedAt: null, tools: [], allowedTools: null, fileArgs: [], fileMaxBytes: 20971520, newTools: [],
    callbackUrl: "https://nabu.example/api/v1/oauth/callback/a2" },
];

// FTR.NAB.CMN-0007 design §3.1–3.2: the built-in groups and an ordinary one with its members.
const grants = { models: [{ connectionId: "c1", model: "sonnet" }], defaultModel: { connectionId: "c1", model: "sonnet" }, channels: ["telegram"], catalogItems: ["a1"] };
const userGroups = [
  { id: "g-admins", name: "Administrators", description: null, builtin: "admins", position: -1, memberCount: 1, grants: null, allEnabled: true },
  { id: "g-sales", name: "Продажи", description: "Отдел продаж", builtin: null, position: 1, memberCount: 2, grants, allEnabled: false },
  { id: "g-all", name: "All users", description: null, builtin: "all", position: 2147483647, memberCount: 3, grants: { ...grants, channels: [] }, allEnabled: false },
];
const members = [{ id: "u1", email: "ada@example.com", name: "Ада Лавлейс" }, { id: "u2", email: "alan@example.com", name: "Алан Тьюринг" }];

// FTR.NAB.CMN-0003 R19: the memory of communications on, and the graph of its people and topics.
const commOn = { ...commState, allowed: true, available: true, consentAt: T("09:00", "01"), compact: { lastAt: T("03:10", "16") }, collect: { ...commState.collect, status: "active" }, counts: { notes: 42, openCommitments: 3 } };
// FTR.NAB.ADM-0001 R8: the source of the collection with its muted groups (mock-muted-groups: one returned or none)
const vkSource = { itemId: "vk-1", source: "vkteams", title: "VK Teams", connected: true, enabled: true };
const tag = (id, kind, label, notes, links) => ({ id, kind, label, notes, links, days: notes });
const commGraph = {
  nodes: [tag("p1", "person", "Анна Петрова", 14, 4), tag("p2", "person", "Иван Соколов", 9, 3), tag("p3", "person", "Мария Ли", 3, 1),
    tag("t1", "topic", "Релиз 2.4", 12, 3), tag("t2", "topic", "Бюджет", 6, 2), tag("t3", "topic", "Найм", 2, 1)],
  edges: [{ a: "p1", b: "t1", notes: 6, days: 4 }, { a: "p2", b: "t1", notes: 3, days: 3 }, { a: "p1", b: "t2", notes: 2, days: 2 },
    { a: "p3", b: "t3", notes: 1, days: 1 }, { a: "p2", b: "t2", notes: 1, days: 1 }, { a: "p1", b: "p2", notes: 2, days: 2 }],
  totalNodes: 6,
  totalEdges: 6,
};
// FTR.NAB.CMN-0003 R11 (design §3.6, decision 25): collected commitments and one the agent saved in the chat.
const cmPerson = (id) => { const n = commGraph.nodes.find((x) => x.id === id); return { id, kind: "person", label: n.label, email: "" }; };
const cmTopic = (id) => { const n = commGraph.nodes.find((x) => x.id === id); return { id, kind: "topic", label: n.label }; };
const commitment = (id, text, direction, due, extra = {}) => ({ id, text, direction, person: null, topics: [], due, overdue: false, state: "open",
  closedBy: null, closedAt: null, origin: "collected", noteId: "n1", noteTitle: "Перенос выпуска 2.4", conversationId: null,
  basisUrl: "https://mail.example/m1", createdAt: T("09:00", "08"), ...extra });
const commitments = [
  commitment("c1", "Проверить формулировки заметок о выпуске", "mine", "2026-10-10", { overdue: true, person: cmPerson("p1"), topics: [cmTopic("t1")] }),
  commitment("c2", "Отправить смету на согласование", "mine", "2026-10-11", { person: cmPerson("p2"), topics: [cmTopic("t2")] }),
  commitment("c3", "Прислать смету по релизу", "mine", "2026-10-16", { person: cmPerson("p2"), origin: "chat", noteId: null, noteTitle: "",
    conversationId: "main", basisUrl: "" }),
  commitment("c4", "Вернуть правки по договору", "theirs", null, { person: cmPerson("p3") }),
];
const commTags = (kind) => ({ items: commGraph.nodes.filter((n) => n.kind === kind).map(({ id, kind: k, label, notes, days }) => ({ id, kind: k, label, notes, days })) });

// FTR.NAB.MEM-0001 R1, R17, R18 (design §3.1, §3.2): the records of four levels, one of them compacted.
const note = (id, level, title, from, to, days, messages, extra = {}) => ({ id, title, excerpt: "Обсудили сроки и договорились о следующем шаге.",
  source: "mail", itemId: "i1", firstAt: T("09:00", "01"), lastAt: T("18:20", from.slice(8)), timePrecision: "minute", messageCount: messages,
  people: [cmPerson("p1")], topics: [cmTopic("t1")], openCommitments: 1, userEdited: false, level, periodFrom: from, periodTo: to, days,
  sourceUrl: "https://mail.example/thread/1", compactedFrom: null, compactedAt: null, ...extra });
const commNotes = [
  note("n1", "day", "Перенос выпуска 2.4", "2026-10-14", "2026-10-14", 1, 8),
  note("n2", "week", "Неделя 10–16 октября", "2026-10-10", "2026-10-16", 7, 42, { compactedFrom: 5, compactedAt: T("03:10", "17") }),
  note("n3", "month", "Октябрь 2026", "2026-10-01", "2026-10-31", 31, 180, { compactedFrom: 4, compactedAt: T("03:10", "18") }),
  note("n4", "thread", "Смета по релизу", "2026-10-03", "2026-10-19", 9, 64, { compactedFrom: 2, compactedAt: T("03:10", "19") }),
];
const commNote = (id) => {
  const n = commNotes.find((x) => x.id === id) ?? commNotes[1];
  const msgs = Array.from({ length: Math.min(n.messageCount, 6) }, (_, k) => ({ id: `m${k}`, author: k % 2 ? "ada@example.com" : "Иван Соколов",
    sentAt: T("10:0" + (k % 10), "12"), title: "Re: " + n.title, url: "https://mail.example/m" + k, key: k < 2 }));
  return { ...n, summary: "Решили перенести выпуск на неделю и вернуться к смете после согласования.", appended: [], messages: msgs, commitments };
};

// FTR.NAB.MEM-0001 R25, R26 (design §3.7): the month of the memory of communications — cards, charts, blocks, users.
// The numbers are invented; the day of the month drives them so two builds show the same picture.
const usageDay = (i) => ({ day: `2026-10-${String(i).padStart(2, "0")}`, costCollect: Math.round((8 + (i % 5) * 3) * 10) / 10,
  costCompact: Math.round((2 + (i % 3) * 4) * 10) / 10, messages: 120 + ((i * 37) % 260), created: 3 + ((i * 7) % 11),
  levels: { day: 2 + ((i * 5) % 13), week: i % 4, month: i % 3 === 0 ? 1 : 0, thread: i % 5 === 0 ? 1 : 0 } });
const commUsageDays = Array.from({ length: 30 }, (_, k) => usageDay(k + 1));
const usageRow = (email, notes, levels, runs, costCollect, costCompact, extra = {}) => ({ userId: email, email, notes, levels, runs,
  lastCollect: { at: T("09:00", "20"), outcome: "ok" }, costUsd: costCollect + costCompact, costCollect, costCompact, limitUsedPct: 0,
  lastCompactAt: T("03:10", "18"), compactBroken: false, openCommitments: 2, ...extra });
const commUsage = {
  month: "2026-10", monthlyLimitUsd: 6, enabledUsers: 12, activeUsers: 7, notes: 4312, costUsd: 18.4,
  cost: { collect: 14.1, compact: 4.3 },
  compaction: { charsIn: 980000, charsOut: 233333, ratio: 4.2, ok: 1204, failed: 3, lastNightAt: T("03:10", "20"), brokenUsers: 1 },
  levels: { day: 3500, week: 500, month: 240, thread: 72 },
  commitments: { open: 17, closedInMonth: 42, overdue: 5 },
  collect: { outcomes: { ok: 210, busy: 12, rate_limited: 4, source_access: 1, timeout: 0, error: 2 },
    messagesBySource: [{ itemId: "i1", source: "mail", title: "ada@example.com", messages: 3420 },
      { itemId: "i2", source: "vkteams", title: "VK Teams", messages: 890 }] },
  items: [usageRow("ada@example.com", 2104, { day: 1700, week: 260, month: 120, thread: 24 }, 168, 3.42, 1.1, { limitUsedPct: 75, openCommitments: 6 }),
    usageRow("alan@example.com", 980, { day: 800, week: 120, month: 50, thread: 10 }, 92, 1.9, 0.6, { limitUsedPct: 42 }),
    usageRow("grace@example.com", 640, { day: 520, week: 80, month: 32, thread: 8 }, 61, 1.2, 0.4, { limitUsedPct: 27, openCommitments: 1 }),
    usageRow("linus@example.com", 588, { day: 480, week: 40, month: 38, thread: 30 }, 55, 0.9, 0.3,
      { limitUsedPct: 20, lastCompactAt: null, compactBroken: true, openCommitments: 0 })],
};

function api(url, theme, comm, collectModel, mutedGroups) {
  const p = url.pathname;
  // FTR.NAB.ADM-0001 R8: the collection reads VK Teams — with a group returned to it or with nothing returned
  const vkOn = mutedGroups === "one" || mutedGroups === "none";
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
  if (p === "/api/v1/comm/state") return comm ? { ...commOn, sources: vkOn ? [vkSource] : [] } : commState;
  if (comm && p === "/api/v1/comm/people") return commTags("person");
  if (comm && p === "/api/v1/comm/topics") return commTags("topic");
  if (comm && p === "/api/v1/comm/graph") return commGraph;
  if (comm && p === "/api/v1/comm/notes") return { items: commNotes, nextCursor: null };
  if (comm && /^\/api\/v1\/comm\/notes\/[^/]+$/.test(p)) return commNote(p.split("/").pop());
  if (comm && p === "/api/v1/commitments") {
    const person = url.searchParams.get("person");
    const topic = url.searchParams.get("topic");
    const items = url.searchParams.get("state") === "closed" ? [] : commitments
      .filter((c) => !person || c.person?.id === person)
      .filter((c) => !topic || c.topics.some((x) => x.id === topic));
    return { items };
  }
  // FTR.NAB.CMN-0003 R29 (design §3.10, decision 26): the model of the collection is behind LiteLLM, its thinking is off
  if (p === "/admin/api/v1/settings/comm") return { enabled: true, retentionMonths: 6, retentionDays: 180, model: { connectionId: "mc1", model: "deepseek-v4.1-flash" }, compactModel: null,
    embeddings: null, monthlyLimitUsd: 6, runTimeoutMinutes: 30, batchThreads: null, defaults: { runTimeoutMinutes: 20, batchThreads: 8 },
    thinkingOff: "chat-template", vectorsAvailable: true, semantic: false };
  if (p === "/admin/api/v1/comm/sources") return { items: [], adapters: ["gmail", "mail"] };
  if (p === "/admin/api/v1/comm/usage") return commUsage;
  if (p === "/admin/api/v1/comm/usage/daily") return { days: commUsageDays };
  if (p === "/admin/api/v1/clients") return { items: clients };
  if (p === "/admin/api/v1/audit") return { items: auditRows, nextCursor: null };
  if (p === "/admin/api/v1/model-connections") return { items: collectModel === "deepseek" ? modelConnections.map((c) => ({ ...c, type: "deepseek" })) : modelConnections,
    types: connectionTypes };
  if (p === "/admin/api/v1/personal-models") return { default: { connectionId: "mc1", model: "deepseek-v4.1-flash", thinking: "off" },
    available: [{ connectionId: "mc1", model: "deepseek-v4.1-flash" }, { connectionId: "mc1", model: "GLM-5.3" }] };
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
  if (p === "/admin/api/v1/proxies") return { items: sandboxProxies };
  if (p === "/admin/api/v1/proxies/templates") return proxyTemplates;
  if (p === "/admin/api/v1/voice") return { configured: true, ok: true, url: "http://whisper.nabu.svc:9000" };
  if (p === "/admin/api/v1/users") return { items: url.searchParams.get("status") === "archived" ? [] : users };
  if (/^\/admin\/api\/v1\/users\/[^/]+$/.test(p)) return userCardFor(p.split("/").at(-1));
  if (/^\/admin\/api\/v1\/users\/[^/]+\/access$/.test(p)) return userAccess;
  if (/^\/api\/v1\/comm\/sources\/[^/]+\/muted-groups$/.test(p)) return { items: [
    { chatSn: "muted-long", name: "Marketing&PR news Citydrive <> Support|CX|Content — очень длинное название заглушённой группы" },
    { chatSn: "muted-alerts", name: "Тестовый чатик с алертами" },
  ] };
  // FTR.NAB.CMN-0003 R14: the prepared tasks; the day digest names a channel the user no longer has
  if (p === "/api/v1/memory-tasks") return { items: [
    { kind: "collect", enabled: false, taskId: null, status: "off", pauseKind: null, nextRunAt: null, lastRun: null,
      settings: { sources: vkOn ? [{ itemId: "vk-1", source: "vkteams" }] : [], interval: "1h", roundTheClock: false, exclusions: { senders: [], folders: [], chats: [] }, includeMuted: mutedGroups === "one" ? ["muted-long"] : [], time: "09:00", channel: "web" } },
    { kind: "digest_day", enabled: true, taskId: "t-day", status: "active", pauseKind: null, nextRunAt: T("09:00", "18"), lastRun: null,
      settings: { sources: [], interval: "1h", roundTheClock: false, exclusions: { senders: [], folders: [], chats: [] }, time: "09:00", days: [1, 2, 3, 4, 5], channel: "telegram" } },
    { kind: "digest_week", enabled: true, taskId: "t-week", status: "active", pauseKind: null, nextRunAt: T("09:00", "23"), lastRun: null,
      settings: { sources: [], interval: "1h", roundTheClock: false, exclusions: { senders: [], folders: [], chats: [] }, time: "09:00", weekday: 1, channel: "vkteams" } },
  ] };
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
    // the discovery of the models of a connection: the dialog loads its table by this POST
    if (url.pathname === "/admin/api/v1/model-connections/discover" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ listed: true, models: providerModels }));
    }
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
    return res.end(JSON.stringify(api(url, cookie("mock-theme"), cookie("mock-comm") === "1", cookie("mock-collect-model"), cookie("mock-muted-groups") ?? "")));
  }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "0.0.0.0", () => console.log(`mock ${DIST} on ${PORT}`));
