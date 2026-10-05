// The API address. On one origin (docker compose: nginx proxies the API) it is
// empty and paths are relative. When the site and the API are on different
// domains (nabu.<domain> and nabu-api.<domain>), the address comes from
// /config.json, which the web container writes at start from API_BASE_URL: one
// image fits any domain.

let apiBase = "";

export function setApiBase(url: string | undefined | null) {
  apiBase = (url ?? "").replace(/\/+$/, "");
}

export function getApiBase(): string {
  return apiBase;
}

/** The full URL of an API path: `/api/v1/...` → `https://nabu-api.<domain>/api/v1/...`. */
export function apiUrl(path: string): string {
  return apiBase + path;
}

/** Loads /config.json; its absence (dev server, compose) is not an error. */
export async function loadRuntimeConfig(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const res = await fetchImpl("/config.json", { cache: "no-store" });
    if (!res.ok) return;
    const cfg = (await res.json()) as { apiBaseUrl?: string };
    setApiBase(cfg.apiBaseUrl);
  } catch {
    // No file or not JSON: the API is on the same origin.
  }
}
