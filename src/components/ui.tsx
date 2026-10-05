import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Tone } from "../api/types";
import { initials } from "../lib/format";
import { Icon } from "./Icon";

// ─── Modal ─────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, footer, wide = false }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, textarea, select, button.primary")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" ref={ref}>
        <header>{title}</header>
        <div className="mb">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

// ─── Toasts ────────────────────────────────────────────────────────

export interface ToastSpec {
  kind?: "error" | "ok" | "info";
  title: string;
  text?: ReactNode;
  actions?: { label: string; primary?: boolean; onClick: () => void }[];
  sticky?: boolean;
}

const ToastCtx = createContext<(t: ToastSpec) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<(ToastSpec & { id: number })[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback((t: ToastSpec) => {
    const id = next.current++;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    if (!t.sticky && !t.actions) setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind ?? "info"}`} role={t.kind === "error" ? "alert" : "status"}>
            <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <div className="grow">
                <b>{t.title}</b>
                {t.text && <span className="small t2">{t.text}</span>}
              </div>
              <button className="iconbtn" style={{ width: 24, height: 24 }} onClick={() => dismiss(t.id)} aria-label="×">
                <Icon name="x" size={14} />
              </button>
            </div>
            {t.actions && (
              <div className="acts">
                {t.actions.map((a) => (
                  <button key={a.label} className={`btn sm${a.primary ? " primary" : ""}`} onClick={() => { dismiss(t.id); a.onClick(); }}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ─── Small pieces ──────────────────────────────────────────────────

/** Icon of the agent per tone (FTR.NAB.CMN-0001 design §1): business — briefcase,
 * friendly — smile, brief — lightning, mentor — book. */
export const TONE_ICONS = { business: "tBusiness", friendly: "tFriendly", brief: "tBrief", mentor: "tMentor" } as const;

/** The agent's round button with the icon of its tone (R31: the tone is shown by the icon). */
export function AgentIcon({ tone, small }: { tone: Tone; small?: boolean }) {
  return <Icon name={TONE_ICONS[tone] ?? "tBusiness"} size={small ? 15 : 18} />;
}

export function Avatar({ name, url, small, agent, tone }: {
  name: string; url?: string | null; small?: boolean; agent?: boolean; tone?: Tone;
}) {
  const cls = `avatar${small ? " s" : ""}${agent ? " agent" : ""}${agent && tone ? ` ${tone}` : ""}`;
  return (
    <span className={cls} aria-hidden="true">
      {url ? <img src={url} alt="" />
        : agent && tone ? <Icon name={TONE_ICONS[tone]} size={small ? 14 : 18} />
        : agent ? name.slice(0, 1).toUpperCase() : initials(name)}
    </span>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span className={`sw${on ? " on" : ""}`} />
      {label}
    </button>
  );
}

export function Empty({ icon, title, children }: { icon: Parameters<typeof Icon>[0]["name"]; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty dashed">
      <div className="ic"><Icon name={icon} /></div>
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return <div className="loading">{t("common.loading")}</div>;
}

/** Popover menu closed by an outside click. */
export function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, close]);
  return ref;
}
