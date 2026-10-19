import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Harness } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Icon, Modal, useToast } from "@green-on-grey/ui-kit";

interface Archive { retentionDays: number; willPurge?: number }
interface Voice { configured: boolean; ok: boolean; url?: string; error?: string }

/** Settings (FTR.NAB.CMN-0002 R20, design §3.4): the retention of archived
 * accounts; before saving the number of accounts the next purge deletes is shown. */
export function SettingsAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const cur = useQuery({ queryKey: ["admin", "settings", "archive"], queryFn: () => api.get<Archive>("/admin/api/v1/settings/archive") });
  const [edited, setDays] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Archive | null>(null);
  // FTR.NAB.CHAT-0001 R22: the recognizer of speech
  // the version of the agent harness (the former section Harness)
  const harness = useQuery({ queryKey: ["admin", "harnesses"], queryFn: () => api.get<{ items: Harness[] }>("/admin/api/v1/harnesses") });
  const voice = useQuery({ queryKey: ["admin", "voice"], queryFn: () => api.get<Voice>("/admin/api/v1/voice") });
  const days = edited ?? (cur.data ? String(cur.data.retentionDays) : "");
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= 3650;
  const dry = useMutation({
    mutationFn: () => api.put<Archive>("/admin/api/v1/settings/archive?dryRun=true", { retentionDays: n }),
    onSuccess: (r) => setConfirm(r),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const save = useMutation({
    mutationFn: () => api.put<Archive>("/admin/api/v1/settings/archive", { retentionDays: n }),
    onSuccess: () => { setConfirm(null); qc.invalidateQueries({ queryKey: ["admin"] }); toast({ kind: "ok", title: t("common.saved") }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  return (
    <>
      <h2 style={{ margin: 0 }}>{t("admin.settings.title")}</h2>
      <p className="lead">{t("admin.settings.lead")}</p>
      <div className="svc" style={{ maxWidth: 560 }}>
        <div className="field">
          <label htmlFor="ret">{t("admin.settings.retention")}</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="ret" className="inp" style={{ width: 120 }} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
            <span className="muted">{t("admin.settings.days")}</span>
            <button className="btn primary" disabled={!valid || n === cur.data?.retentionDays || dry.isPending} onClick={() => dry.mutate()}>{t("common.save")}</button>
          </div>
          <div className="hint">{t("admin.settings.retentionHint")}</div>
        </div>
      </div>
      {harness.data?.items.map((h) => (
        <div key={h.name} className="svc" style={{ maxWidth: 560, marginTop: 14 }}>
          <div className="h"><Icon name="box" /><b>{t("admin.settings.harness", { name: h.name === "pi" ? "Pi" : h.name })}</b>
            <span className={`st ${h.status === "ok" ? "ok" : "review"}`}>{t(`admin.harness.states.${h.status}`, { defaultValue: h.status })}</span>
          </div>
          <div className="small t2">{t("admin.settings.version")} <span className="mono">{h.version}</span></div>
        </div>
      ))}
      {voice.data && (
        <div className="svc" style={{ maxWidth: 560, marginTop: 14 }}>
          <div className="h"><Icon name="mic" /><b>{t("admin.settings.voice")}</b>
            <span className={`st ${voice.data.ok ? "ok" : voice.data.configured ? "review" : "none"}`}>
              {t(voice.data.ok ? "admin.settings.voiceOk" : voice.data.configured ? "admin.settings.voiceDown" : "admin.settings.voiceOff")}
            </span>
          </div>
          <div className="small t2">{voice.data.url ?? t("admin.settings.voiceHint")}{voice.data.error && <> · {voice.data.error}</>}</div>
        </div>
      )}
      {confirm && (
        <Modal title={t("admin.settings.confirmTitle")} onClose={() => setConfirm(null)} footer={<>
          <button className="btn ghost" onClick={() => setConfirm(null)}>{t("common.cancel")}</button>
          <button className={`btn ${confirm.willPurge ? "danger" : "primary"}`} disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
        </>}>
          <p style={{ marginTop: 0 }}>{t("admin.settings.confirmText", { days: n })}</p>
          <div className={`hintbox${confirm.willPurge ? " warn" : ""}`}><Icon name={confirm.willPurge ? "alert" : "check"} />
            <span>{t("admin.settings.willPurge", { count: confirm.willPurge ?? 0 })}</span></div>
        </Modal>
      )}
    </>
  );
}
