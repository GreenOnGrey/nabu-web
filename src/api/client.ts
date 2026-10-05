// Fetch wrapper: JSON, cookies, CSRF double-submit and stable error codes.

import { apiUrl } from "./base";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** The CSRF cookie of Nabu (nabu_csrf: other products may share the base domain). */
export function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)nabu_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

type Body = Record<string, unknown> | unknown[] | FormData | Blob | undefined;

export async function request<T>(method: string, path: string, body?: Body, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET" && method !== "HEAD") headers["X-CSRF-Token"] = csrfToken();
  let payload: BodyInit | undefined;
  if (body instanceof FormData || body instanceof Blob) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    // include: the API lives on nabu-api.<domain>, the site on nabu.<domain>.
    res = await fetch(apiUrl(path), { method, headers, body: payload, credentials: "include", ...init });
  } catch {
    throw new ApiError(0, "network", "network error");
  }
  if (res.status === 204 || res.status === 202) {
    const text = await res.text();
    return (text ? safeJSON(text) : undefined) as T;
  }
  const text = await res.text();
  const data = text ? safeJSON(text) : undefined;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error;
    throw new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? res.statusText, err?.details ?? {});
  }
  return data as T;
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: Body) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string, body?: Body) => request<T>("DELETE", path, body),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, form),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
