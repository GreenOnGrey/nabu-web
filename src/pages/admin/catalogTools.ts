/** The choice of tools of an MCP item, of its file arguments
 * (FTR.NAB.CMN-0006 R13, R14; design §3.2) and of its result paths (FTR.NAB.CHAT-0003 R10, R11, R25). Pure functions: the form keeps
 * the state, these decide what a click changes. */
import type { CatalogTool, FileArg } from "../../api/types";

/** The default limit of a file argument; the server has the same (catalog.DefaultFileMaxBytes). */
export const DEFAULT_FILE_MAX_BYTES = 20 << 20;
/** The default and the largest limit of a result (catalog.DefaultResultMaxBytes). */
export const DEFAULT_RESULT_MAX_BYTES = 50 << 20;

export type ItemTool = CatalogTool;

export interface ToolChoice {
  allowed: string[];
  fileArgs: FileArg[];
  /** Arguments where the agent passes the path to save a file of the server to. */
  resultArgs: FileArg[];
  /** Tools with a result path that write only to the space: no confirmation in mail topics. */
  spaceOnly: string[];
}

/** Keeps of the arguments and the space-only tools those of the allowed tools; a space-only tool needs a result path. */
function within(c: ToolChoice, allowed: string[]): ToolChoice {
  const resultArgs = c.resultArgs.filter((f) => allowed.includes(f.tool));
  return { allowed, fileArgs: c.fileArgs.filter((f) => allowed.includes(f.tool)), resultArgs,
    spaceOnly: c.spaceOnly.filter((n) => resultArgs.some((f) => f.tool === n)) };
}

/** The tools "Read-only" checks: those that only read. */
export function readOnlyPreset(tools: ItemTool[]): string[] {
  return tools.filter((t) => t.readOnly).map((t) => t.name);
}

/** "Read-only" is on when every checked tool only reads. */
export function isReadOnly(tools: ItemTool[], allowed: string[]): boolean {
  return tools.every((t) => !allowed.includes(t.name) || t.readOnly);
}

/** Checks or unchecks a tool; unchecking drops its file arguments and result paths. */
export function toggleTool(c: ToolChoice, name: string, on: boolean): ToolChoice {
  if (on) return c.allowed.includes(name) ? c : { ...c, allowed: [...c.allowed, name] };
  return within(c, c.allowed.filter((n) => n !== name));
}

/** Switches "Read-only": on — only the reading tools; off — all tools (design §3.2). */
export function applyReadOnly(c: ToolChoice, tools: ItemTool[], on: boolean): ToolChoice {
  return within(c, on ? readOnlyPreset(tools) : tools.map((t) => t.name));
}

export function isFileArg(c: ToolChoice, tool: string, arg: string): boolean {
  return c.fileArgs.some((f) => f.tool === tool && f.arg === arg);
}

const other = (tool: string, arg: string) => (f: FileArg) => !(f.tool === tool && f.arg === arg);

/** Marks an argument as a file of the space; an argument is a file or a result path, not both (CHAT-0003 design §6). */
export function toggleFileArg(c: ToolChoice, tool: string, arg: string, on: boolean): ToolChoice {
  const rest = c.fileArgs.filter(other(tool, arg));
  if (!on || !c.allowed.includes(tool) || isResultArg(c, tool, arg)) return { ...c, fileArgs: rest };
  return { ...c, fileArgs: [...rest, { tool, arg }] };
}

export function isResultArg(c: ToolChoice, tool: string, arg: string): boolean {
  return c.resultArgs.some((f) => f.tool === tool && f.arg === arg);
}

export function hasResult(c: ToolChoice, tool: string): boolean {
  return c.resultArgs.some((f) => f.tool === tool);
}

/** Marks an argument as a result path; the last one of a tool off drops its «writes only to the space». */
export function toggleResultArg(c: ToolChoice, tool: string, arg: string, on: boolean): ToolChoice {
  const rest = c.resultArgs.filter(other(tool, arg));
  if (on && c.allowed.includes(tool) && !isFileArg(c, tool, arg)) return { ...c, resultArgs: [...rest, { tool, arg }] };
  return within({ ...c, resultArgs: rest }, c.allowed);
}

export function toggleSpaceOnly(c: ToolChoice, tool: string, on: boolean): ToolChoice {
  const rest = c.spaceOnly.filter((n) => n !== tool);
  return { ...c, spaceOnly: on && hasResult(c, tool) ? [...rest, tool] : rest };
}

/** The checked tools first, then the others; by name inside. */
export function sortTools(tools: ItemTool[], allowed: string[]): ItemTool[] {
  return tools.toSorted((a, b) => {
    const d = Number(allowed.includes(b.name)) - Number(allowed.includes(a.name));
    return d || a.name.localeCompare(b.name);
  });
}

/** The allowed tools that the server still has: what the agent sees and what is saved. */
export function allowedOf(tools: ItemTool[], allowed: string[]): string[] {
  return allowed.filter((n) => tools.some((t) => t.name === n));
}

export function allowedCount(tools: ItemTool[], allowed: string[] | null, readOnly: boolean): number {
  if (allowed) return allowedOf(tools, allowed).length;
  return readOnly ? readOnlyPreset(tools).length : tools.length;
}

export const MB = 1 << 20;

/** Megabytes of the form ↔ bytes of the API; the limit is 1 KB to `max` (a file — 100 MB, a result — 50 MB). */
export function mbToBytes(mb: string, max = 100 * MB): number | null {
  const v = Number(mb.replace(",", "."));
  if (!Number.isFinite(v)) return null;
  const b = Math.round(v * MB);
  return b >= 1024 && b <= max ? b : null;
}

export function bytesToMb(b: number): string {
  return String(Math.round((b / MB) * 1000) / 1000);
}
