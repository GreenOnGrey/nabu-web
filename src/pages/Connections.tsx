import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { CatalogItem, MyChannel } from "../api/types";
import { errorText } from "../lib/errors";
import { intlLocale } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Modal, useToast } from "../components/ui";

const FILTERS = ["all", "connected", "mcp", "skill"] as const;

/** Connections (R31, design §3.5): the channels of the user and the catalog
 * of skills and MCP with the access mode and the action. */
export function ConnectionsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [tokenFor, setTokenFor] = useState<CatalogItem | null>(null);
  const catalog = useQuery({ queryKey: keys.catalog, queryFn: () => api.get<{ items: CatalogItem[] }>("/api/v1/catalog") });

  // The result of a personal OAuth connection comes back in the query string.
  useEffect(() => {
    const r = params.get("oauth");
    if (!r) return;
    toast({ kind: r === "connected" ? "ok" : "error", title: t(`connections.oauth.${r}`, { defaultValue: t("connections.oauth.failed") }), text: params.get("item") ?? undefined });
    setParams({}, { replace: true });
  }, [params, setParams, t, toast]);

  const connect = useMutation({
    mutationFn: ({ id, token }: { id: string; token?: string }) => api.post<{ connected: boolean; authorizeUrl?: string }>(`/api/v1/catalog/${id}/connect`, token ? { token } : {}),
    onSuccess: (r) => {
      if (r.authorizeUrl) window.location.href = r.authorizeUrl;
      else qc.invalidateQueries({ queryKey: keys.catalog });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/catalog/${id}/connect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.catalog }),
  });

  const items = (catalog.data?.items ?? []).filter((i) =>
    filter === "all" ? true : filter === "connected" ? i.connected : i.type === filter);
  return (
    <div className="page">
      <h1>{t("connections.title")}</h1>
      <p className="lead">{t("connections.lead")}</p>
      <ChannelsBlock />
      <h3 className="sec">{t("connections.catalog")}</h3>
      <div className="mini-seg" style={{ display: "inline-flex", marginBottom: 14 }}>
        {FILTERS.map((f) => <button key={f} className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`connections.filters.${f}`)}</button>)}
      </div>
      {items.length === 0 && !catalog.isLoading && <Empty icon="plug" title={t("connections.empty")} />}
      <div className="cardgrid">
        {items.map((it) => (
          <div className="ccard" key={it.id}>
            <div className="t"><Icon name={it.type === "mcp" ? "plug" : "spark"} size={16} />{it.title}</div>
            <div className="row" style={{ gap: 6 }}>
              {it.type === "mcp" && it.mode === "personal" && <span className="mode p">{t("connections.personal")}</span>}
              {it.type === "mcp" && it.mode === "platform" && <span className="mode">{it.readOnly ? t("connections.platformRead") : t("connections.platform")}</span>}
              {it.type === "skill" && <span className="mode">{t("connections.skill")}</span>}
              {it.inDevelopment && <span className="mode dev">{t("connections.inDevelopment")}</span>}
            </div>
            <div className="d">{it.description}</div>
            <div className="acts">
              <span className={`small ${it.connected ? "ok-t" : it.status === "unavailable" ? "err-t" : "muted"}`}>
                {it.connected ? t("connections.connected") : t(`connections.status.${it.status}`)}
              </span>
              {it.connected ? (
                <button className="btn sm" onClick={() => disconnect.mutate(it.id)}>
                  {it.mode === "personal" ? t("connections.revoke") : t("connections.disable")}
                </button>
              ) : (
                <button className="btn sm primary" disabled={it.inDevelopment || connect.isPending}
                  onClick={() => (it.authKind === "token" ? setTokenFor(it) : connect.mutate({ id: it.id }))}>
                  {t("connections.connect")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {tokenFor && <TokenModal item={tokenFor} onClose={() => setTokenFor(null)} onSave={(token) => { connect.mutate({ id: tokenFor.id, token }); setTokenFor(null); }} />}
    </div>
  );
}

function TokenModal({ item, onClose, onSave }: { item: CatalogItem; onClose: () => void; onSave: (token: string) => void }) {
  const { t } = useTranslation();
  const [token, setToken] = useState("");
  return (
    <Modal title={t("connections.tokenTitle", { name: item.title })} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={token.trim().length < 4} onClick={() => onSave(token.trim())}>{t("connections.connect")}</button>
    </>}>
      <div className="field">
        <label htmlFor="pat">{t("connections.token")}</label>
        <input id="pat" type="password" autoComplete="off" className="inp" value={token} onChange={(e) => setToken(e.target.value)} />
        <div className="hint">{t("connections.tokenHint")}</div>
      </div>
    </Modal>
  );
}

/** Channels of the user (FTR.NAB.CMN-0002 R12–R13, design §3.6): Telegram is
 * linked with a personal key shown once; VK Teams and mail need no linking. */
function ChannelsBlock() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [key, setKey] = useState<{ key: string; bot: string } | null>(null);
  const channels = useQuery({ queryKey: keys.channels, queryFn: () => api.get<{ items: MyChannel[] }>("/api/v1/channels") });
  const refresh = () => { qc.invalidateQueries({ queryKey: keys.channels }); qc.invalidateQueries({ queryKey: keys.me }); };
  const issue = useMutation({
    mutationFn: () => api.post<{ key: string; bot: string }>("/api/v1/channels/telegram/key"),
    onSuccess: (r) => { setKey(r); refresh(); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const unlink = useMutation({ mutationFn: () => api.del("/api/v1/channels/telegram/binding"), onSuccess: refresh });
  const items = channels.data?.items ?? [];
  if (items.length === 0) return null;
  const locale = intlLocale(i18n.language);
  return (
    <>
      <h3 className="sec">{t("connections.channels")}</h3>
      <div className="channels">
        {items.map((c) => (
          <div className="ccard" key={c.kind}>
            <div className="t"><Icon name={c.kind === "telegram" ? "tg" : c.kind === "email" ? "mail" : "msg"} size={16} />{t(`channels.${c.kind}`)}
              {c.address && <span className="small muted mono">{c.address}</span>}</div>
            {!c.available ? (
              <div className="d"><Icon name="lock" size={14} /> {t("connections.channelUnavailable")}</div>
            ) : c.kind === "telegram" ? (
              c.binding ? (
                <>
                  <div className="d">{t("connections.linkedAs", { account: c.binding.account || "—", when: dateTime(c.binding.boundAt, locale) })}</div>
                  <div className="acts"><span className="small ok-t">{t("connections.linked")}</span>
                    <span className="row" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => issue.mutate()}>{t("connections.reissueKey")}</button>
                      <button className="btn sm" onClick={() => unlink.mutate()}>{t("connections.unlink")}</button>
                    </span></div>
                </>
              ) : (
                <>
                  <div className="d">{t("connections.keyHint", { bot: c.address ?? "" })}</div>
                  <div className="acts"><span className="small muted">{c.keyIssuedAt ? t("connections.keyIssued", { when: dateTime(c.keyIssuedAt, locale) }) : ""}</span>
                    <button className="btn sm primary" disabled={issue.isPending} onClick={() => issue.mutate()}>
                      <Icon name="key" size={14} />{c.keyIssuedAt ? t("connections.reissueKey") : t("connections.getKey")}
                    </button></div>
                </>
              )
            ) : (
              <>
                <div className="d">{c.kind === "email" ? t("connections.emailHint") : t("connections.vkteamsHint")}</div>
                <div className="acts"><span className="small ok-t">{t("connections.noLinking")}</span><span /></div>
              </>
            )}
          </div>
        ))}
      </div>
      {key && (
        <Modal title={t("connections.keyTitle")} onClose={() => setKey(null)}
          footer={<button className="btn primary" onClick={() => setKey(null)}>{t("common.done")}</button>}>
          <p style={{ marginTop: 0 }}>{t("connections.keyText", { bot: key.bot || "Telegram" })}</p>
          <div className="keybox" data-testid="tg-key">{key.key}</div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn sm" onClick={() => { void navigator.clipboard?.writeText(key.key); toast({ kind: "ok", title: t("connections.copied") }); }}>
              <Icon name="copy" size={14} />{t("connections.copy")}
            </button>
            {key.bot && <a className="btn sm ghost" href={`https://t.me/${key.bot.replace(/^@/, "")}`} target="_blank" rel="noreferrer">{t("connections.openBot")}</a>}
          </div>
          <div className="hintbox warn" style={{ marginTop: 12 }}><Icon name="alert" /><span>{t("connections.keyOnce")}</span></div>
        </Modal>
      )}
    </>
  );
}
