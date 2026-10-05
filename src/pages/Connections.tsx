import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { CatalogItem, Channels } from "../api/types";
import { errorText } from "../lib/errors";
import { intlLocale } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Modal, useToast } from "../components/ui";

const FILTERS = ["all", "connected", "mcp", "skill"] as const;

/** Connections (R31, design §3.5): messengers linked by a one-time code; the
 * catalog of skills and MCP with the access mode and the action. */
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
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

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

function ChannelsBlock() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState<{ type: string; code: string; expiresAt: string; bot: string } | null>(null);
  const channels = useQuery({ queryKey: keys.channels, queryFn: () => api.get<Channels>("/api/v1/channels") });
  const issue = useMutation({
    mutationFn: (type: string) => api.post<{ code: string; expiresAt: string; bot: string }>(`/api/v1/channels/${type}/link-code`),
    onSuccess: (r, type) => setCode({ type, ...r }),
  });
  const unlink = useMutation({
    mutationFn: (type: string) => api.del(`/api/v1/channels/${type}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.channels }); qc.invalidateQueries({ queryKey: keys.me }); },
  });
  const all = [...new Set([...(channels.data?.available.map((a) => a.type) ?? []), ...(channels.data?.linked.map((l) => l.type) ?? [])])];
  if (channels.data && all.length === 0) return null;
  return (
    <>
      <h3 className="sec">{t("connections.channels")}</h3>
      <div className="channels">
        {all.map((type) => {
          const linked = channels.data?.linked.find((l) => l.type === type);
          return (
            <div className="ccard" key={type}>
              <div className="t"><Icon name={type === "telegram" ? "tg" : "msg"} size={16} />{t(`channels.${type}`)}</div>
              {linked ? (
                <>
                  <div className="d">{t("connections.linkedAs", { account: linked.account || "—", when: dateTime(linked.linkedAt, intlLocale(i18n.language)) })}</div>
                  <div className="acts"><span className="small ok-t">{t("connections.linked")}</span>
                    <button className="btn sm" onClick={() => unlink.mutate(type)}>{t("connections.unlink")}</button></div>
                </>
              ) : (
                <>
                  <div className="d">{t("connections.linkHint")}</div>
                  <div className="acts"><span />
                    <button className="btn sm primary" onClick={() => issue.mutate(type)}>{t("connections.getCode")}</button></div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {code && (
        <Modal title={t("connections.codeTitle", { channel: t(`channels.${code.type}`) })} onClose={() => { setCode(null); qc.invalidateQueries({ queryKey: keys.channels }); }}
          footer={<button className="btn primary" onClick={() => { setCode(null); qc.invalidateQueries({ queryKey: keys.channels }); }}>{t("common.done")}</button>}>
          <p style={{ marginTop: 0 }}>{code.bot ? t("connections.codeTextBot", { bot: "@" + code.bot }) : t("connections.codeText")}</p>
          <div className="code-box">/start {code.code}</div>
          {code.bot && <p><a href={`https://t.me/${code.bot}?start=${code.code}`} target="_blank" rel="noreferrer">{t("connections.openBot")}</a></p>}
          <div className="hint">{t("connections.codeExpires", { time: new Date(code.expiresAt).toLocaleTimeString() })}</div>
        </Modal>
      )}
    </>
  );
}
