// Types mirror the JSON of nabu-core (FTR.NAB.CMN-0001 tech §2–5).

export type Tone = "business" | "friendly" | "brief" | "mentor";
export const TONES: Tone[] = ["business", "friendly", "brief", "mentor"];

export interface PublicConfig {
  authProvider: "github" | "oidc";
  providerLabel: string;
  allowedOrg?: string;
  languages: string[];
  defaultLanguage: string;
  uploadMaxBytes: number;
  voice: boolean;
  /** The limit of a recording (FTR.NAB.CHAT-0001 R20); 0 or missing — 300. */
  voiceMaxSeconds?: number;
  spaces: boolean;
  channels: Record<string, boolean>;
  version: string;
  /** Documents and spreadsheets open in the preview (FTR.NAB.CHAT-0003 R22). */
  previewOffice?: boolean;
}

/** A channel in the Connections of a user (FTR.NAB.CMN-0002 tech §3). */
export interface MyChannel {
  kind: "telegram" | "vkteams" | "email";
  available: boolean;
  reason: "always" | "all_users" | "user" | "disabled";
  binding?: { account: string; boundAt: string };
  keyIssuedAt?: string;
  address?: string;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  isAdmin: boolean;
  language: string;
  theme: string;
  timezone: string;
  channels: MyChannel[];
}

/** The capabilities of a model as the user sees them (FTR.NAB.CHAT-0001 R8, R16). */
export interface ModelCaps {
  image: boolean;
  tools: boolean;
  reasoning: boolean;
  contextWindow: number;
}

export interface AvailableModel {
  connectionId: string;
  model: string;
  name: string;
  connection: string;
  caps: ModelCaps;
}

/** The fill of the context window of a conversation (FTR.NAB.CHAT-0001 R3). */
export interface ContextFill {
  tokens: number;
  window: number;
}

export interface Agent {
  name: string;
  tone: Tone;
  model: AvailableModel | null;
  defaultModel: AvailableModel | null;
  /** The user chose the model; false — the default one. */
  chosen: boolean;
  availableModels: AvailableModel[];
  /** The fill of the context of the main conversation. */
  context: ContextFill;
}

/** A skill the user may call (FTR.NAB.CHAT-0001 R4). */
export interface Skill {
  name: string;
  description: string;
  itemId: string;
  itemTitle: string;
}

/** An event of a conversation (FTR.NAB.CHAT-0001 R1, R2, R16). */
export type ChatEventData =
  | { kind: "reset" }
  | { kind: "compact"; auto?: boolean; tokensBefore: number; tokensAfter: number; summary?: string }
  | { kind: "model"; connectionId?: string; model: string; name?: string };

export interface List<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Conversation {
  id: string;
  kind: "main" | "topic";
  title: string | null;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  /** FTR.NAB.CMN-0002: mail topics. */
  source: "chat" | "email" | "group";
  unreadCount: number;
  writesRequireConfirmation: boolean;
}

/** The letter of a mail message (messages.context.email). */
export interface EmailContext {
  from: string;
  fromName: string;
  to: string[];
  cc: string[];
  subject: string;
  mode: "direct" | "web_only";
  quoted: string;
  tooLarge: string[] | null;
}

export interface MessageContext {
  email?: EmailContext;
  confirmation?: { id: string; status: "approved" | "rejected"; summary: string };
}

/** A call of a tool that waits for the user (tech §3). */
export interface Confirmation {
  id: string;
  conversationId: string;
  server: string;
  tool: string;
  summary: string;
  argsPreview: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export interface ToolStep {
  id: string;
  server: string;
  tool: string;
  summary: string;
  status: "running" | "done" | "error";
}

/** The sheets of a spreadsheet in its preview (FTR.NAB.CHAT-0003 tech §6.2): at most 500 rows and 50
 * columns; a formula comes as its text. */
export interface PreviewSheets {
  sheets: {
    name: string;
    rows: number;
    cols: number;
    cells: { v?: string; n?: number; f?: string }[][];
    merges: string[];
    freeze: string;
  }[];
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface Message {
  id: string;
  conversationId: string;
  /** an event too large for the bus: only ids and status came (FTR.NAB.CMN-0001 tech, decision 23) */
  truncated?: boolean;
  role: "user" | "assistant" | "event" | "notice";
  event?: ChatEventData;
  /** FTR.NAB.CHAT-0002 R2: the service client that wrote a notice and its data for the product. */
  clientName?: string | null;
  payload?: Record<string, unknown> | null;
  /** The skill the user called with the message. */
  skill?: string | null;
  /** The text was recognized from a voice message. */
  voice?: boolean;
  text: string;
  channel: string;
  status: "pending" | "streaming" | "done" | "failed";
  attachments: Attachment[];
  toolSteps: ToolStep[];
  context?: MessageContext;
  /** FTR.NAB.CMN-0003 tech §3.5: the digest of commitments drawn instead of the text. */
  card?: DigestCard;
  model: string | null;
  errorClass: string | null;
  errorText: string | null;
  replyTo: string | null;
  createdAt: string;
}

export interface Memory {
  id: string;
  text: string;
  source: "agent" | "user";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSchedule {
  kind: "once" | "cron";
  at?: string;
  cron?: string;
  timezone: string;
  human: string;
}

export interface Task {
  id: string;
  title: string;
  instruction: string;
  schedule: TaskSchedule;
  channel: string;
  status: "active" | "paused" | "done" | "cancelled";
  nextRunAt: string | null;
  failures: number;
  pauseReason: string | null;
  lastRun: { at: string; status: string; summary: string | null; error?: string | null } | null;
  createdAt: string;
  /** FTR.NAB.CMN-0003 R14: agent — created in the chat; the rest are prepared memory tasks. */
  kind: "agent" | "memory_collect" | "memory_digest_day" | "memory_digest_week";
  pauseKind: "user" | "source_access" | "budget" | "archived" | null;
  /** the settings of a memory task */
  settings?: { interval?: "15m" | "1h" | "4h" | "1d"; roundTheClock?: boolean };
}

// ─── FTR.NAB.CMN-0003: the memory of communications (tech §3) ───────
export interface CommTag {
  id: string;
  kind: "person" | "topic";
  label: string;
  email?: string;
  notes?: number;
}

export interface CommMessage {
  id: string;
  author: string;
  sentAt: string | null;
  title: string;
  url: string;
}

export interface Commitment {
  id: string;
  text: string;
  direction: "mine" | "theirs";
  person: CommTag | null;
  topics: CommTag[];
  due: string | null;
  overdue: boolean;
  state: "open" | "done" | "cancelled";
  closedBy: "user" | "agent" | "collector" | null;
  closedAt: string | null;
  noteId: string;
  noteTitle: string;
  basisUrl: string;
  closeBasisUrl?: string;
}

export interface CommNote {
  id: string;
  title: string;
  excerpt: string;
  source: string;
  firstAt: string;
  lastAt: string;
  timePrecision: "minute" | "day";
  messageCount: number;
  people: CommTag[];
  topics: CommTag[];
  openCommitments: number;
  userEdited: boolean;
  summary?: string;
  appended?: { at: string; text: string }[];
  messages?: CommMessage[];
  commitments?: Commitment[];
}

export interface CommGraph {
  nodes: { id: string; kind: "person" | "topic"; label: string; notes: number; links: number }[];
  edges: { a: string; b: string; notes: number }[];
  totalNodes: number;
}

export interface CommSource {
  itemId: string;
  source: string;
  title: string;
  connected: boolean;
  enabled: boolean;
}

export interface CommState {
  /** the administrator allows the function now */
  allowed: boolean;
  /** the tabs are shown: allowed, or switched off with something collected to see (R24) */
  available: boolean;
  consentAt: string | null;
  retentionDays: number;
  semantic: boolean;
  sources: CommSource[];
  collect: {
    status: "off" | "active" | "paused";
    pauseKind: Task["pauseKind"];
    nextRunAt: string | null;
    backfill: { done: number; total: number } | null;
    budgetUsedPct: number;
  };
  counts: { notes: number; openCommitments: number };
}

export interface CollectSettings {
  sources: { itemId: string; source: string }[];
  interval: "15m" | "1h" | "4h" | "1d";
  roundTheClock: boolean;
  exclusions: { senders: string[]; folders: string[]; chats: string[] };
}

export interface DigestSettings {
  time: string;
  days?: number[];
  weekday?: number;
  channel: string;
}

export interface MemoryTask {
  kind: "collect" | "digest_day" | "digest_week";
  enabled: boolean;
  taskId: string | null;
  status: "off" | "active" | "paused";
  pauseKind: Task["pauseKind"];
  nextRunAt: string | null;
  lastRun: Task["lastRun"];
  settings: CollectSettings & DigestSettings;
}

export interface DigestCard {
  type: "digest";
  period: "day" | "week";
  items: {
    commitmentId: string;
    text: string;
    direction: "mine" | "theirs";
    group: "overdue" | "due" | "theirs" | "undated";
    person: CommTag | null;
    topics: CommTag[];
    due: string | null;
    state: string;
    noteId: string;
    url: string;
  }[];
}

export interface CommAdminSettings {
  enabled: boolean;
  retentionDays: number;
  model: { connectionId: string; model: string } | null;
  embeddings: { connectionId: string; model: string } | null;
  monthlyLimitUsd: number;
  /** the database has the vector extension; the chosen model of embeddings resolves */
  vectorsAvailable: boolean;
  semantic: boolean;
}

export interface TaskRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "succeeded" | "failed";
  summary: string | null;
  messageId: string | null;
  errorClass: string | null;
  errorText: string | null;
  /** channel_unavailable: the result went to the web (R5). */
  deliveryNote: string | null;
}

export interface SpaceInfo {
  state: "running" | "sleeping" | "starting" | "stopping";
  usedBytes: number;
  quotaBytes: number;
  files: number;
  lastActivityAt: string | null;
  enabled: boolean;
}

export interface SpaceFile {
  path: string;
  size: number;
  sha256: string;
  modifiedAt: string;
  modifiedBy: "agent" | "user";
}

export interface CatalogItem {
  id: string;
  type: "mcp" | "skill";
  name: string;
  title: string;
  description: string;
  mode: "personal" | "platform" | null;
  authKind?: string;
  readOnly: boolean;
  status: "available" | "in_development" | "unavailable";
  connected: boolean;
  connectedAt: string | null;
  inDevelopment: boolean;
}


// ─── administration ─────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  status: "invited" | "active" | "blocked" | "archived";
  lastSeenAt: string | null;
  createdAt: string;
  channels: string[];
  archivedAt?: string;
  archivedBy?: string;
  purgeAfter?: string;
}

/** A channel of the instance (tech §2.1). */
export interface AdminChannel {
  /** web, email, vkteams, telegram or the name of a product (a service client). */
  kind: string;
  enabled: boolean;
  allUsers: boolean;
  groupsEnabled: boolean;
  usersCount: number;
  status: string;
  statusReason: string | null;
  statusAt: string | null;
  settings: Record<string, unknown>;
  secrets: string[];
  locked?: boolean;
  product?: boolean;
}

export interface EmailSettings {
  provider: "google" | "yandex360" | "vkworkmail";
  mailbox: string;
  aliases: string[];
  domains: string[];
  authservId: string;
  imap: { host: string; port: number };
  smtp: { host: string; port: number };
}

export interface EmailLogEntry {
  id: number;
  at: string;
  from: string;
  subject: string;
  result: "accepted" | "rejected" | "ignored" | "unavailable";
  reason: string | null;
}

export interface UserChannel {
  kind: string;
  available: boolean;
  reason: "always" | "all_users" | "user" | "disabled";
  binding?: { account: string; boundAt: string };
}

/** A turn waiting for the pod of the agent (FTR.NAB.CMN-0004 tech §2). */
export interface AgentWait {
  conversationId: string;
  messageId: string;
  state: "starting" | "queued";
  position?: number;
}

/** GET /admin/api/v1/agent-pods (FTR.NAB.CMN-0004 tech §5). */
export interface AgentPod {
  ownerId: string;
  ownerKind: "user" | "group";
  title: string;
  channel?: string;
  state: "starting" | "ready" | "stopping";
  stopReason?: string;
  warm: boolean;
  busy: boolean;
  sessions: number;
  startedAt: string;
  lastActivityAt: string;
  node?: string;
  image: string;
}
export interface AgentPods {
  enabled: boolean;
  capacity: { max: number | null; source: "config" | "quota" | "cluster" | "none"; used: number; starting: number;
    learnedAt: string | null; probeAfter: string | null };
  warm: { now: number; target: number | null };
  queue: { length: number; oldestSeconds: number };
  pods: AgentPod[];
}

export interface GroupAgent {
  id: string;
  channel: string;
  chatId: string;
  chatTitle: string;
  membersCount: number | null;
  owner: { id: string; email: string; name: string } | null;
  name: string;
  tone: Tone;
  connectionId: string | null;
  model: string | null;
  skills: string[];
  status: "active" | "disabled" | "removed";
  dataUntil: string | null;
  costMonth: number;
  createdAt: string;
}

export interface UserCard {
  user: AdminUser;
  channels: UserChannel[];
  groupAgents: GroupAgent[];
}

export interface RestoreRequest {
  id: string;
  userId: string;
  email: string;
  name: string;
  archivedAt: string | null;
  requestedAt: string;
  newIdentity: { issuer: string; subject: string } | null;
}

export interface ArchiveResult {
  email: string;
  result: "archived" | "restored" | "already_archived" | "already_active" | "not_found" | "purged";
}

export interface ModelDef {
  id: string;
  name?: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input?: string[];
  thinkingLevelMap?: Record<string, string | null>;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** FTR.NAB.CHAT-0001 R8: the model calls tools; it only answers /embeddings; other ids. */
  tools?: boolean;
  embeddings?: boolean;
  aliases?: string[];
  /** R7: where each capability came from; the fields an administrator set; the provider no longer lists it. */
  sources?: Record<string, "provider" | "catalog" | "probe" | "manual" | "default">;
  overrides?: string[];
  gone?: boolean;
}

/** An edit of the capabilities of a model (R8). */
export interface CapsPatch {
  image?: boolean;
  tools?: boolean;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  reset?: string[];
}

export type ModelRef = { id: string; overrides?: CapsPatch };

export type ConnectionType = "deepseek" | "gigachat" | "zai" | "openai_compatible";

/** GET /admin/api/v1/model-connections: the connections and the presets of the types. */
export interface ModelConnectionList {
  items: ModelConnection[];
  types: { type: ConnectionType; baseUrl?: string; models?: ModelDef[]; scopes?: string[]; defaultScope?: string; endpoints?: Record<string, string> }[];
}

export interface ModelConnection {
  id: string;
  name: string;
  type: ConnectionType;
  baseUrl: string;
  options: Record<string, string>;
  models: ModelDef[];
  /** R10: models the provider lists and the connection does not have. */
  discovered: { id: string; name: string; firstSeenAt: string }[];
  newCount: number;
  keyLast4: string;
  enabled: boolean;
  status: string;
  statusReason: string | null;
  checkedAt: string | null;
  refreshedAt: string | null;
  createdAt: string;
}

export interface Choice {
  connectionId: string;
  model: string;
  thinking?: string;
}

export interface PersonalModels {
  default: Choice | null;
  available: Choice[];
}

export interface CheckResult {
  results: { model: string; ok: boolean; latencyMs?: number; errorClass?: string; httpStatus?: number; message?: string; embeddings?: boolean;
    /** R9: the probes of images and tools. */
    caps?: Record<string, "confirmed" | "unconfirmed" | "skipped"> }[];
}

export interface Harness {
  name: string;
  version: string;
  status: string;
}

/** A tool of an MCP item as its check reported it (FTR.NAB.CMN-0006 tech §3.2). */
export interface CatalogTool {
  name: string;
  description?: string;
  readOnly: boolean;
  destructive?: boolean;
  /** String arguments: the ones that can be files of the space. */
  stringArgs?: string[];
  /** Arguments that are lists of strings: lists of files of the space (FTR.NAB.CHAT-0003 R12). */
  stringListArgs?: string[];
}

/** A string argument of a tool that is a path in the user's space (R14). */
export interface FileArg {
  tool: string;
  arg: string;
}

export interface AdminCatalogItem {
  id: string;
  type: "mcp" | "skill";
  name: string;
  title: string;
  description: string;
  source: { kind: string; url?: string; repo?: string; path?: string; ref?: string };
  mode: "personal" | "platform" | null;
  personalAuth: { kind: string; authorizeUrl?: string; tokenUrl?: string; clientId?: string; scopes?: string[]; audience?: string; hasSecret?: boolean } | null;
  platformAuth: Record<string, string>;
  readOnly: boolean;
  exposure: string;
  published: boolean;
  inDevelopment: boolean;
  status: string | null;
  statusReason: string | null;
  tools: CatalogTool[];
  /** FTR.NAB.CMN-0006 R13, R14: null — the old rule of readOnly. */
  allowedTools: string[] | null;
  fileArgs: FileArg[];
  fileMaxBytes: number;
  /** FTR.NAB.CHAT-0003 R10, R11, R25: result paths, their limit, the tools that write only to the space. */
  resultArgs?: FileArg[];
  resultMaxBytes?: number;
  spaceOnlyTools?: string[];
  newTools?: string[];
  /** The last successful check. */
  checkedAt: string | null;
  skills: string[];
  syncedAt: string | null;
  callbackUrl?: string;
  hookUrl?: string;
  hookSecret?: string;
}

export interface ServiceAgent {
  name: string;
  description: string;
  harness: string;
  model: Choice;
  instructions: string;
  skills: string[];
  mcp: string[];
  acceptCallerMcp: boolean;
  workspace: "none" | "nabu" | "external";
  /** FTR.NAB.CMN-0008 R6: the sandbox profile of a workspace in Nabu; absent — the default of the stand. */
  workspaceProfile?: string;
  limits: { timeoutSec: number; maxTokens: number };
  clients: string[];
  enabled: boolean;
  runsWeek: number;
  failedWeek: number;
  updatedAt: string;
}

export interface Run {
  id: string;
  agent: string;
  clientName: string;
  initiator: string | null;
  status: string;
  summary: string | null;
  errorClass: string | null;
  errorText: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ServiceClient {
  id: string;
  name: string;
  url: string;
  clientId: string;
  agents: string[];
  canDelegate: boolean;
  canImport: boolean;
  canArchive: boolean;
  canRestore: boolean;
  enabled: boolean;
  prevSecretExpiresAt: string | null;
  createdAt: string;
  secret?: string;
}

export interface UsageGroup {
  key: string;
  label: string;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  requests: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  agentKind: "personal" | "service";
  agent: string;
  userEmail: string | null;
  clientName: string | null;
  initiatorEmail: string | null;
  channel: string;
  server: string | null;
  tool: string;
  argsSummary: string | null;
  result: "ok" | "error";
  error: string | null;
}

// ─── FTR.NAB.CMN-0007: groups of users and access ───────────────────

export interface GroupGrants {
  models: Choice[];
  defaultModel: Choice | null;
  channels: string[];
  catalogItems: string[];
}

export interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  builtin: "all" | "admins" | null;
  position: number;
  memberCount: number;
  /** null for «admins»: it has everything enabled. */
  grants: GroupGrants | null;
  allEnabled: boolean;
}

export interface GroupMember {
  id: string;
  email: string;
  name: string;
}

export interface EffectiveAccess {
  admin: boolean;
  groups: { id: string; name: string; builtin: "all" | "admins" | null }[];
  models: { connectionId: string; model: string; name: string; connection: string; via: string[] }[];
  defaultModel: { connectionId: string; model: string; source: "user" | "group" | "global" | "first"; groupId?: string } | null;
  channels: { kind: string; via: string[] }[];
  catalogItems: { id: string; type: "mcp" | "skill"; title: string; mode: string | null; via: string[] }[];
}

// ─── FTR.NAB.CMN-0008: sandbox profiles and library requests ─────────

export interface SandboxPackage { name: string; version?: string }
export interface SandboxManifest {
  name: string;
  kind: "builtin" | "custom";
  version?: string;
  digest?: string;
  tools?: { group: string; name: string; version?: string }[];
  python?: SandboxPackage[];
  system?: SandboxPackage[];
  commands?: string[];
  includes?: string;
  description?: string;
}
export interface SandboxProfile {
  name: string;
  kind: "builtin" | "custom";
  imageRef: string;
  imageDigest?: string;
  pendingRef?: string;
  description: string;
  state: "checking" | "ready" | "error";
  error?: string;
  baseVersion?: string;
  nodesReady: number;
  nodesTotal: number;
  assignedTo: { personal: boolean; group: boolean; services: string[] };
  inventory?: SandboxManifest;
  checkedAt?: string;
}
export interface SandboxProfiles {
  customImages: boolean;
  prefixes: string[];
  currentVersion: string;
  profiles: SandboxProfile[];
  assignments: { personal: string; group: string; defaults: Record<string, string> };
}
export type PackageEcosystem = "pypi" | "apt" | "binary" | "python-module" | "command";
export type PackageStatus = "new" | "planned" | "added" | "rejected";
export interface PackageRow {
  ecosystem: PackageEcosystem;
  name: string;
  aliases: { ecosystem: string; name: string; builtin: boolean }[];
  users: number;
  signals: number;
  bySource: { agent?: number; auto?: number };
  byProfile: Record<string, number>;
  byKind: { personal?: number; group?: number; service?: number };
  previousSignals: number;
  new: boolean;
  lastAt: string;
  status: PackageStatus;
  profile?: string;
  version?: string;
  note?: string;
  lookalike?: string;
}
export interface PackageCard extends PackageRow {
  reasons: { text: string; profile: string; at: string }[];
  daily: { day: string; signals: number }[];
  history: { status: PackageStatus; profile?: string; version?: string; note?: string; by?: string; at: string }[];
}
