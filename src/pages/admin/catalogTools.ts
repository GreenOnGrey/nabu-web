/** The choice of tools of an MCP item and of its file arguments
 * (FTR.NAB.CMN-0006 R13, R14; design §3.2). Pure functions: the form keeps
 * the state, these decide what a click changes. */
import type { CatalogTool, FileArg } from "../../api/types";

/** The default limit of a file argument; the server has the same (catalog.DefaultFileMaxBytes). */
export const DEFAULT_FILE_MAX_BYTES = 20 << 20;

export type ItemTool = CatalogTool;

export interface ToolChoice {
  allowed: string[];
  fileArgs: FileArg[];
}

/** The tools "Read-only" checks: those that only read. */
export function readOnlyPreset(tools: ItemTool[]): string[] {
  return tools.filter((t) => t.readOnly).map((t) => t.name);
}

/** "Read-only" is on when every checked tool only reads. */
export function isReadOnly(tools: ItemTool[], allowed: string[]): boolean {
  return tools.every((t) => !allowed.includes(t.name) || t.readOnly);
}

/** Checks or unchecks a tool; unchecking drops its file arguments. */
export function toggleTool(c: ToolChoice, name: string, on: boolean): ToolChoice {
  if (on) return c.allowed.includes(name) ? c : { ...c, allowed: [...c.allowed, name] };
  return { allowed: c.allowed.filter((n) => n !== name), fileArgs: c.fileArgs.filter((f) => f.tool !== name) };
}

/** Switches "Read-only": on — only the reading tools; off — all tools (design §3.2). */
export function applyReadOnly(c: ToolChoice, tools: ItemTool[], on: boolean): ToolChoice {
  const allowed = on ? readOnlyPreset(tools) : tools.map((t) => t.name);
  return { allowed, fileArgs: c.fileArgs.filter((f) => allowed.includes(f.tool)) };
}

export function isFileArg(c: ToolChoice, tool: string, arg: string): boolean {
  return c.fileArgs.some((f) => f.tool === tool && f.arg === arg);
}

export function toggleFileArg(c: ToolChoice, tool: string, arg: string, on: boolean): ToolChoice {
  const rest = c.fileArgs.filter((f) => !(f.tool === tool && f.arg === arg));
  return { ...c, fileArgs: on && c.allowed.includes(tool) ? [...rest, { tool, arg }] : rest };
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

/** Megabytes of the form ↔ bytes of the API; the limit is 1 KB to 100 MB. */
export function mbToBytes(mb: string): number | null {
  const v = Number(mb.replace(",", "."));
  if (!Number.isFinite(v)) return null;
  const b = Math.round(v * MB);
  return b >= 1024 && b <= 100 * MB ? b : null;
}

export function bytesToMb(b: number): string {
  return String(Math.round((b / MB) * 1000) / 1000);
}
