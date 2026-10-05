// Dates, numbers and relative time through Intl in the interface language (tech spec §15).

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function relativeTime(iso: string | Date, lng: string, now: Date = new Date()): string {
  const t = typeof iso === "string" ? new Date(iso) : iso;
  const diff = (t.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: "auto" });
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs || unit === "second") {
      return rtf.format(Math.round(diff / secs), unit);
    }
  }
  return rtf.format(0, "second");
}

/** Duration without direction, e.g. "2 days" for the approvals queue. */
export function duration(fromIso: string, lng: string, now: Date = new Date()): string {
  const secs = Math.max(0, (now.getTime() - new Date(fromIso).getTime()) / 1000);
  for (const [unit, s] of UNITS) {
    if (secs >= s || unit === "second") {
      const n = Math.max(1, Math.floor(secs / s));
      return new Intl.NumberFormat(lng, { style: "unit", unit, unitDisplay: "long" }).format(n);
    }
  }
  return "";
}

export function dateTime(iso: string, lng: string): string {
  return new Intl.DateTimeFormat(lng, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function bytes(n: number, lng: string): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return new Intl.NumberFormat(lng, { style: "unit", unit: units[i], unitDisplay: "short", maximumFractionDigits: 1 }).format(v);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "";
}
