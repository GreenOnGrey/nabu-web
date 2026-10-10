import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { AdminChannel, EmailLogEntry, EmailSettings, List } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { dateTime } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { Modal, Switch, useToast } from "../../components/ui";

const ICONS: Record<string, "globe" | "mail" | "msg" | "tg"> = { web: "globe", email: "mail", vkteams: "msg", telegram: "tg" };

/** The label of a channel: products are named by their service client (R15). */
export const channelLabel = (t: (k: string, o?: Record<string, unknown>) => string, kind: string) =>
  t(`channels.${kind}`, { defaultValue: kind.replace(/^./, (c) => c.toUpperCase()) });
const PROVIDERS = ["google", "yandex360", "vkworkmail"] as const;
const PRESETS: Record<string, { imap: [string, number]; smtp: [string, number]; authservId: string }> = {
  google: { imap: ["imap.gmail.com", 993], smtp: ["smtp.gmail.com", 587], authservId: "mx.google.com" },
  yandex360: { imap: ["imap.yandex.ru", 993], smtp: ["smtp.yandex.ru", 465], authservId: "mail.yandex.net" },
  vkworkmail: { imap: ["imap.mail.ru", 993], smtp: ["smtp.mail.ru", 465], authservId: "mail.ru" },
};

function hostPort(v: string, d: [string, number]) {
  const [h, p] = v.trim().split(":");
  return h ? { host: h, port: Number(p) || d[1] } : { host: d[0], port: d[1] };
}

function identity(c: AdminChannel): string {
  const s = c.settings as Record<string, string | undefined>;
  if (c.kind === "telegram") return s.username ? `@${s.username}` : "";
  if (c.kind === "vkteams") return s.botNick || s.apiUrl || "";
  if (c.kind === "email") return [s.mailbox, s.provider].filter(Boolean).join(" · ");
  return "";
}

/** Channels (FTR.NAB.CMN-0002 R23, design §3.1–3.2): the channels of the
 * instance with the connection state, «enabled», «for all users», groups. */
export function ChannelsAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminChannel | null>(null);
  const list = useQuery({ queryKey: ["admin", "channels"], queryFn: () => api.get<{ items: AdminChannel[] }>("/admin/api/v1/channels") });
  const inv = () => qc.invalidateQueries({ queryKey: ["admin", "channels"] });
  const patch = useMutation({
    mutationFn: ({ kind, ...p }: { kind: string; enabled?: boolean; allUsers?: boolean; groupsEnabled?: boolean }) => api.patch(`/admin/api/v1/channels/${kind}`, p),
    onSuccess: inv,
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const items = list.data?.items ?? []; // a product channel is listed only with its service client (R15)
  return (
    <>
      <h2 style={{ margin: 0 }}>{t("admin.channels.title")}</h2>
      <p className="lead">{t("admin.channels.lead")}</p>
      <div style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr>
            <th>{t("admin.channels.channel")}</th><th>{t("admin.channels.state")}</th><th>{t("admin.channels.enabled")}</th>
            <th>{t("admin.channels.allUsers")}</th><th>{t("admin.channels.groups")}</th><th>{t("admin.channels.users")}</th><th />
          </tr></thead>
          <tbody>
            {items.map((c) => {
              const groups = c.kind === "telegram" || c.kind === "vkteams";
              return (
                <tr key={c.kind} className={c.locked ? "locked" : ""}>
                  <td><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Icon name={ICONS[c.kind] ?? "server"} />
                    <div><b>{channelLabel(t, c.kind)}</b><div className="small muted mono">{identity(c)}</div></div></div></td>
                  <td>{c.locked ? <span className="muted"><Icon name="lock" size={14} /> {t("admin.channels.always")}</span>
                    : c.product ? <span className="st ok">{t("admin.channels.client")}</span>
                      : <span className={`st ${c.status === "ok" ? "ok" : c.status === "error" ? "draft" : "review"}`} title={c.statusReason ?? undefined}>{t(`admin.channels.statuses.${c.status}`, { defaultValue: c.status })}</span>}
                    {c.status === "error" && c.statusReason && <div className="small err-t" style={{ maxWidth: 260 }}>{c.statusReason}</div>}</td>
                  <td><Switch on={c.enabled} disabled={c.locked} onChange={(v) => patch.mutate({ kind: c.kind, enabled: v })} /></td>
                  <td><Switch on={c.allUsers} disabled={c.locked} onChange={(v) => patch.mutate({ kind: c.kind, allUsers: v })} /></td>
                  <td>{groups ? <Switch on={c.groupsEnabled} onChange={(v) => patch.mutate({ kind: c.kind, groupsEnabled: v })} /> : <span className="muted">—</span>}</td>
                  <td>{c.locked || c.allUsers ? <span className="muted">{t("admin.channels.everybody")}</span> : c.usersCount}</td>
                  <td>{!c.locked && !c.product && <button className="btn sm" onClick={() => setEditing(c)}>{t("admin.channels.configure")}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <ChannelCard channel={editing} onClose={() => { setEditing(null); inv(); }} />}
    </>
  );
}

function ChannelCard({ channel, onClose }: { channel: AdminChannel; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [cur, setCur] = useState(channel);
  const s0 = channel.settings as Partial<EmailSettings> & { apiUrl?: string };
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>(s0.provider ?? "yandex360");
  const [mailbox, setMailbox] = useState(s0.mailbox ?? "");
  const [aliases, setAliases] = useState((s0.aliases ?? []).join(", "));
  const [domains, setDomains] = useState<string[]>(s0.domains ?? []);
  const [domain, setDomain] = useState("");
  const [authservId, setAuthservId] = useState(s0.authservId ?? "");
  const [imap, setImap] = useState(s0.imap ? `${s0.imap.host}:${s0.imap.port}` : "");
  const [smtp, setSmtp] = useState(s0.smtp ? `${s0.smtp.host}:${s0.smtp.port}` : "");
  const [apiUrl, setApiUrl] = useState(s0.apiUrl ?? "");
  const [secret, setSecret] = useState("");
  const kind = channel.kind;
  const preset = PRESETS[provider];
  const secretName = kind === "telegram" ? "botToken" : kind === "vkteams" ? "token" : provider === "google" ? "serviceAccountJson" : "appPassword";
  const body = () => {
    const secrets = secret.trim() ? { [secretName]: secret.trim() } : undefined;
    if (kind === "email") {
      return { settings: { provider, mailbox: mailbox.trim(), aliases: aliases.split(/[\s,;]+/).filter(Boolean), domains,
        authservId: authservId.trim() || preset.authservId, imap: hostPort(imap, preset.imap), smtp: hostPort(smtp, preset.smtp) }, secrets };
    }
    if (kind === "vkteams") return { settings: { apiUrl: apiUrl.trim() }, secrets };
    return { secrets };
  };
  const save = useMutation({
    mutationFn: () => api.patch<AdminChannel>(`/admin/api/v1/channels/${kind}`, body()),
    onSuccess: (c) => { setCur(c); setSecret(""); qc.invalidateQueries({ queryKey: ["admin", "channels"] }); toast({ kind: "ok", title: t("common.saved") }); },
  });
  const check = useMutation({
    mutationFn: () => api.post<AdminChannel>(`/admin/api/v1/channels/${kind}/check`),
    onSuccess: (c) => { setCur(c); toast({ kind: c.status === "ok" ? "ok" : "error", title: c.status === "ok" ? t("admin.channels.checkOk") : t("admin.channels.checkFailed"), text: c.statusReason ?? undefined }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const rejected = useQuery({
    queryKey: ["admin", "email-log"], enabled: kind === "email",
    queryFn: () => api.get<List<EmailLogEntry>>("/admin/api/v1/channels/email/log?result=rejected&limit=20"),
  });
  const addDomain = () => {
    const d = domain.trim().toLowerCase().replace(/^@/, "");
    if (d && !domains.includes(d)) setDomains([...domains, d]);
    setDomain("");
  };
  const hasSecret = cur.secrets.includes(secretName);
  return (
    <Modal wide title={t("admin.channels.cardTitle", { channel: channelLabel(t, kind) })} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.close")}</button>
      <button className="btn" disabled={check.isPending} onClick={() => check.mutate()}>{t("admin.channels.check")}</button>
      <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      {kind === "email" && (
        <>
          <div className="field">
            <label>{t("admin.channels.provider")}</label>
            <div className="mini-seg" style={{ display: "inline-flex" }}>
              {PROVIDERS.map((p) => <button key={p} className={provider === p ? "on" : ""} aria-pressed={provider === p}
                onClick={() => { setProvider(p); setImap(""); setSmtp(""); setAuthservId(""); }}>{t(`admin.channels.providers.${p}`)}</button>)}
            </div>
          </div>
          <div className="form-grid">
            <div className="field"><label htmlFor="ch-mb">{t("admin.channels.mailbox")}</label>
              <input id="ch-mb" className="inp mono" value={mailbox} onChange={(e) => setMailbox(e.target.value)} placeholder="nabu@company.ru" /></div>
            <div className="field"><label htmlFor="ch-al">{t("admin.channels.aliases")}</label>
              <input id="ch-al" className="inp mono" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="ai@company.ru" /></div>
            <div className="field"><label htmlFor="ch-imap">IMAP</label>
              <input id="ch-imap" className="inp mono" value={imap} onChange={(e) => setImap(e.target.value)} placeholder={`${preset.imap[0]}:${preset.imap[1]}`} /></div>
            <div className="field"><label htmlFor="ch-smtp">SMTP</label>
              <input id="ch-smtp" className="inp mono" value={smtp} onChange={(e) => setSmtp(e.target.value)} placeholder={`${preset.smtp[0]}:${preset.smtp[1]}`} /></div>
          </div>
          <div className="field"><label htmlFor="ch-dom">{t("admin.channels.domains")}</label>
            <div className="chipinput">
              {domains.map((d) => <button key={d} className="chip on mono" title={t("common.delete")} onClick={() => setDomains(domains.filter((x) => x !== d))}>{d} ×</button>)}
              <input id="ch-dom" value={domain} onChange={(e) => setDomain(e.target.value)} onBlur={addDomain} placeholder="company.ru"
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); addDomain(); } }} />
            </div>
            <div className="hint">{t("admin.channels.domainsHint")}</div>
          </div>
          <div className="field"><label htmlFor="ch-as">authserv-id</label>
            <input id="ch-as" className="inp mono" value={authservId} onChange={(e) => setAuthservId(e.target.value)} placeholder={preset.authservId} />
            <div className="hint">{t("admin.channels.authservHint")}</div></div>
        </>
      )}
      {kind === "vkteams" && (
        <div className="field"><label htmlFor="ch-api">{t("admin.channels.apiUrl")}</label>
          <input id="ch-api" className="inp mono" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://myteam.company.ru/bot/v1" /></div>
      )}
      <div className="field">
        <label htmlFor="ch-sec">{t(`admin.channels.secrets.${secretName}`)}</label>
        {secretName === "serviceAccountJson"
          ? <textarea id="ch-sec" className="inp mono" rows={4} autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hasSecret ? t("admin.channels.secretSet") : ""} />
          : <input id="ch-sec" type="password" autoComplete="off" className="inp mono" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hasSecret ? t("admin.channels.secretSet") : ""} />}
        <div className="hint">{t("admin.channels.secretHint")}</div>
      </div>
      {kind === "email" && (
        <>
          <div className="hintbox"><Icon name="shield" /><span>{t("admin.channels.rules")}</span></div>
          {(rejected.data?.items.length ?? 0) > 0 && (
            <div className="hintbox warn" style={{ display: "block" }}>
              <b>{t("admin.channels.rejected")}</b>
              {rejected.data!.items.map((e) => (
                <div key={e.id} className="small" style={{ marginTop: 4 }}>
                  <span className="mono">{e.from || "—"}</span> · {dateTime(e.at, intlLocale(i18n.language))} · {e.reason}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {cur.status === "error" && cur.statusReason && <div className="err-text">{cur.statusReason}</div>}
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}
