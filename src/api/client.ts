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
  if (!res.ok) throw apiError(res, data);
  return data as T;
}

/** The error of an answer: the stable code of the API, or `http_<status>` when the answer has none. */
function apiError(res: Response, data: unknown): ApiError {
  const err = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error;
  return new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? res.statusText, err?.details ?? {});
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The content of a file (an attachment for its preview); the session cookie goes with it. */
async function blob(path: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { credentials: "include" });
  } catch {
    throw new ApiError(0, "network", "network error");
  }
  if (!res.ok) {
    const text = await res.text();
    throw apiError(res, text ? safeJSON(text) : undefined);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: Body) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string, body?: Body) => request<T>("DELETE", path, body),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, form),
  blob,
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
