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
  spaces: boolean;
  channels: Record<string, boolean>;
  version: string;
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

export interface AvailableModel {
  connectionId: string;
  model: string;
  name: string;
  connection: string;
}

export interface Agent {
  name: string;
  tone: Tone;
  model: AvailableModel | null;
  availableModels: AvailableModel[];
}

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

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  text: string;
  channel: string;
  status: "pending" | "streaming" | "done" | "failed";
  attachments: Attachment[];
  toolSteps: ToolStep[];
  context?: MessageContext;
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
  thinkingLevelMap?: Record<string, string | null>;
}

export interface ModelConnection {
  id: string;
  name: string;
  type: "deepseek" | "openai_compatible";
  baseUrl: string;
  models: ModelDef[];
  keyLast4: string;
  enabled: boolean;
  status: string;
  statusReason: string | null;
  checkedAt: string | null;
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
  results: { model: string; ok: boolean; latencyMs?: number; errorClass?: string; httpStatus?: number; message?: string }[];
}

export interface Harness {
  name: string;
  version: string;
  status: string;
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
  tools: { name: string; readOnly: boolean }[];
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
