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

/** The answer of the network that did not happen: the same error whatever carried the request. */
const networkError = () => new ApiError(0, "network", "network error");

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
    throw networkError();
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

/** The error of an answer: the stable code of the API, or `http_<status>` when the answer has none. `res` is the
 *  answer of `fetch` or of `XMLHttpRequest`: both carry the status of what they got. */
function apiError(res: { status: number; statusText: string }, data: unknown): ApiError {
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
  return (await raw(path)).blob();
}

/** The answer of a GET with the session cookie, its headers included; an answer with an error throws. */
async function raw(path: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { credentials: "include" });
  } catch {
    throw networkError();
  }
  if (!res.ok) {
    const text = await res.text();
    throw apiError(res, text ? safeJSON(text) : undefined);
  }
  return res;
}

/** The upload with the share of its body, 0..1: `fetch` follows the answer, not the sending, so the body goes by
 * `XMLHttpRequest` (FTR.NAB.CMN-0005 design §6.5). The headers and the error are those of `request`. */
function uploadWithProgress<T>(path: string, form: FormData, onProgress: (share: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(path));
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-CSRF-Token", csrfToken());
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener("load", () => {
      const data = xhr.responseText ? safeJSON(xhr.responseText) : undefined;
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(apiError(xhr, data));
    });
    // nothing cancels an upload (design §6.5): a body that failed is the only other outcome
    xhr.addEventListener("error", () => reject(networkError()));
    xhr.send(form);
  });
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: Body) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string, body?: Body) => request<T>("DELETE", path, body),
  /** Without `onProgress` the body goes by `fetch`; with it, by `XMLHttpRequest`, which follows the sending. */
  upload: <T>(path: string, form: FormData, onProgress?: (share: number) => void) =>
    onProgress ? uploadWithProgress<T>(path, form, onProgress) : request<T>("POST", path, form),
  blob,
  raw,
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
