import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { Me } from "../api/types";
import { LANGUAGES, LANGUAGE_NAMES, LANGUAGE_SHORT, setDocumentLanguage } from "../lib/i18n";
import { Icon } from "../components/Icon";
import { Avatar, useOutside } from "../components/ui";
import { useSession } from "./session";

/** Common time zones offered in the profile; the browser's own zone comes first. */
const ZONES = ["Europe/Moscow", "Europe/Kaliningrad", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Novosibirsk",
  "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Vladivostok", "Europe/Berlin", "Europe/London", "Europe/Madrid",
  "Asia/Shanghai", "America/New_York", "America/Los_Angeles", "UTC"];

/** The profile menu (R31, design §3.6): language in one line, time zone,
 * theme, Administration for administrators, sign out. */
export function ProfileMenu({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { me } = useSession();
  const qc = useQueryClient();
  const close = useCallback(() => onClose(), [onClose]);
  const ref = useOutside<HTMLDivElement>(true, close);
  const patch = useMutation({
    mutationFn: (p: Partial<Pick<Me, "language" | "theme" | "timezone">>) => api.patch("/api/v1/me", p),
    onMutate: (p) => qc.setQueryData<Me>(keys.me, (old) => (old ? { ...old, ...p } : old)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
  const browserZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = Array.from(new Set([me.timezone, browserZone, ...ZONES])).filter(Boolean);

  const setLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setDocumentLanguage(lng);
    patch.mutate({ language: lng });
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      qc.clear();
      window.location.href = "/login";
    }
  };

  return (
    <div className="menu" ref={ref} role="dialog" aria-label={t("profile.title")}>
      <div className="sec">
        <div className="line" style={{ justifyContent: "flex-start", gap: 10 }}>
          <Avatar name={me.name || me.email} url={me.avatarUrl} />
          <div style={{ minWidth: 0 }}>
            <b>{me.name || me.email}</b>
            <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{me.email}</div>
          </div>
        </div>
      </div>
      <div className="sec">
        <div className="line">
          <span>{t("profile.language")}</span>
          <span className="mini-seg">
            {LANGUAGES.map((l) => (
              <button key={l} className={me.language === l ? "on" : ""} lang={l} title={LANGUAGE_NAMES[l]} aria-label={LANGUAGE_NAMES[l]}
                aria-pressed={me.language === l} onClick={() => setLanguage(l)}>
                {LANGUAGE_SHORT[l]}
              </button>
            ))}
          </span>
        </div>
        <div className="line" style={{ marginTop: 12 }}>
          <span>{t("profile.theme")}</span>
          <span className="mini-seg">
            {(["light", "dark"] as const).map((th) => (
              <button key={th} className={me.theme === th ? "on" : ""} aria-pressed={me.theme === th} onClick={() => patch.mutate({ theme: th })}>
                {t(`profile.themes.${th}`)}
              </button>
            ))}
          </span>
        </div>
        <div className="line" style={{ marginTop: 12 }}>
          <span>{t("profile.timezone")}</span>
          <select className="inp" style={{ width: 180, padding: "4px 8px" }} value={me.timezone} aria-label={t("profile.timezone")}
            onChange={(e) => patch.mutate({ timezone: e.target.value })}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      </div>
      {me.isAdmin && (
        <div className="sec">
          <Link className="action" to="/admin" onClick={onClose}><Icon name="wrench" />{t("profile.admin")}</Link>
        </div>
      )}
      <div className="sec">
        <button className="action danger" onClick={logout}><Icon name="out" />{t("profile.logout")}</button>
      </div>
    </div>
  );
}
