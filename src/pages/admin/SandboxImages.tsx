import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { adminKeys, useSandboxProfiles } from "../../api/queries";
import type { PackageCard, PackageRow, PackageStatus, SandboxProfile } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { dateTime, relativeTime } from "../../lib/format";
import { Empty, Icon, Modal, Tabs, useToast } from "@green-on-grey/ui-kit";
import { adminPath } from "./paths";

type Tab = "requests" | "profiles";
type Period = "7d" | "30d" | "90d";
const KINDS = ["personal", "group", "service"] as const;

/** Sandbox images (FTR.NAB.CMN-0008 R14–R17, R21–R27, design §3): requests of
 * libraries and the profiles of sandbox images. */
export function SandboxImagesAdmin() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("requests");
  return (
    <>
      <h2 style={{ margin: 0 }}>{t("admin.sandbox-images.title")}</h2>
      <p className="lead">{t("admin.sandbox-images.lead")}</p>
      <Tabs label={t("admin.sandbox-images.title")} value={tab} onChange={setTab}
        items={[{ key: "requests", label: t("admin.sandbox-images.tabRequests") }, { key: "profiles", label: t("admin.sandbox-images.tabProfiles") }]} />
      <div style={{ marginTop: 16 }}>{tab === "requests" ? <Requests /> : <Profiles />}</div>
    </>
  );
}

// ─── Requests of libraries (design §3.1–3.3) ─────────────────────────

function Requests() {
  const { t, i18n } = useTranslation();
  const locale = intlLocale(i18n.language);
  const [period, setPeriod] = useState<Period>("30d");
  const [ecosystem, setEcosystem] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<PackageRow | null>(null);
  // «Map» of a module or a command without a package opens its card with the form (design §3.1)
  const [mapping, setMapping] = useState(false);
  const params = new URLSearchParams({ period, ecosystem, status, source, q }).toString();
  const list = useQuery({
    queryKey: ["admin", "sandbox-packages", params],
    queryFn: () => api.get<{ items: PackageRow[] }>(`/admin/api/v1/sandbox/packages?${params}`),
  });
  const filtered = ecosystem !== "" || status !== "" || source !== "" || q !== "";
  const rows = list.data?.items ?? [];
  const now = new Date(list.dataUpdatedAt || 0);
  // R15: the longest bar is the most requested package of the selection.
  const maxSignals = Math.max(1, ...rows.map((r) => r.signals));
  return (
    <div className={open ? "nb-sbx-split" : undefined}>
      <div>
        <div className="nb-sbx-toolbar">
          <div className="mini-seg" role="group" aria-label={t("admin.sandbox-images.period")}>
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button key={p} className={period === p ? "on" : ""} aria-pressed={period === p} onClick={() => setPeriod(p)}>{t(`admin.sandbox-images.periods.${p}`)}</button>
            ))}
          </div>
          <select className="inp" aria-label={t("admin.sandbox-images.ecosystem")} value={ecosystem} onChange={(e) => setEcosystem(e.target.value)}>
            <option value="">{t("admin.sandbox-images.allEcosystems")}</option>
            {(["pypi", "apt", "binary", "python-module", "command"] as const).map((e) => <option key={e} value={e}>{t(`admin.sandbox-images.ecosystems.${e}`)}</option>)}
          </select>
          <select className="inp" aria-label={t("admin.sandbox-images.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("admin.sandbox-images.allStatuses")}</option>
            {(["new", "planned", "added", "rejected"] as const).map((s) => <option key={s} value={s}>{t(`admin.sandbox-images.statuses.${s}`)}</option>)}
          </select>
          <select className="inp" aria-label={t("admin.sandbox-images.source")} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t("admin.sandbox-images.allSources")}</option>
            <option value="agent">{t("admin.sandbox-images.sourceAgent")}</option>
            <option value="auto">{t("admin.sandbox-images.sourceAuto")}</option>
          </select>
          <input className="inp nb-sbx-search" type="search" placeholder={t("admin.sandbox-images.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.isLoading && <p className="muted">{t("common.loading")}</p>}
        {list.isError && <div className="llmerr" role="alert"><span>{errorText(t, list.error)}</span>
          <button className="btn sm" onClick={() => list.refetch()}>{t("llm.retry")}</button></div>}
        {list.data && rows.length === 0 && (filtered
          ? <Empty icon="search" title={t("admin.sandbox-images.notFound")}>
            <button className="btn sm" onClick={() => { setEcosystem(""); setStatus(""); setSource(""); setQ(""); }}>{t("admin.sandbox-images.resetFilters")}</button></Empty>
          : <Empty icon="box" title={t("admin.sandbox-images.empty")} />)}
        {rows.length > 0 && (
          <>
            <div className="nb-sbx-legend" aria-hidden="true">
              {KINDS.map((k) => <span key={k}><i className={`nb-kind-${k}`} />{t(`admin.sandbox-images.kinds.${k}`)}</span>)}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="t nb-sbx-table">
                <thead><tr>
                  <th>{t("admin.sandbox-images.cols.package")}</th><th>{t("admin.sandbox-images.cols.users")}</th>
                  <th>{t("admin.sandbox-images.cols.signals")}</th><th>{t("admin.sandbox-images.cols.kinds")}</th>
                  <th>{t("admin.sandbox-images.cols.trend")}</th><th>{t("admin.sandbox-images.cols.last")}</th><th>{t("admin.sandbox-images.cols.status")}</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.ecosystem}/${r.name}`} className={open?.ecosystem === r.ecosystem && open.name === r.name ? "nb-sel" : undefined}
                      onClick={() => { setOpen(r); setMapping(false); }} style={{ cursor: "pointer" }}>
                      <td>
                        <span className="small muted">{t(`admin.sandbox-images.ecosystems.${r.ecosystem}`)}</span> <span className="mono">{r.name}</span>
                        {r.lookalike && <> <span className="nb-sbx-look">{t("admin.sandbox-images.lookalike", { name: r.lookalike })}</span></>}
                        {(r.ecosystem === "python-module" || r.ecosystem === "command") && (
                          <> <button type="button" className="linkish small" onClick={(e) => { e.stopPropagation(); setOpen(r); setMapping(true); }}>{t("admin.sandbox-images.map")}</button></>
                        )}
                        {r.aliases.length > 0 && <div className="small muted">{r.aliases.map((a) => `${t(`admin.sandbox-images.aliasKinds.${a.ecosystem}`)} ${a.name}`).join(", ")}</div>}
                      </td>
                      <td><b>{r.users}</b></td>
                      <td className="nb-nowrap small">
                        {(r.bySource.agent ?? 0) > 0 && <span className="nb-sbx-src" title={t("admin.sandbox-images.sourceAgent")}><Icon name="spark" size={13} />{r.bySource.agent}</span>}
                        {(r.bySource.auto ?? 0) > 0 && <span className="nb-sbx-src" title={t("admin.sandbox-images.sourceAuto")}><Icon name="bolt" size={13} />{r.bySource.auto}</span>}
                      </td>
                      <td><KindBar row={r} max={maxSignals} /></td>
                      <td className="nb-nowrap small"><Trend row={r} /></td>
                      <td className="small nb-nowrap">{relativeTime(r.lastAt, locale, now)}</td>
                      <td><StatusChip row={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {open && <PackagePanel key={`${open.ecosystem}/${open.name}/${mapping}`} row={open} period={period} mapping={mapping} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** The signals of a package by kind of agent: the length follows the most
 * requested package of the table, the tooltip lists the kinds (design §1). */
function KindBar({ row, max }: { row: PackageRow; max: number }) {
  const { t } = useTranslation();
  const width = Math.max(6, Math.round((110 * row.signals) / max));
  const kinds = KINDS.filter((k) => (row.byKind[k] ?? 0) > 0);
  return (
    <span className="nb-sbx-barwrap" tabIndex={0} aria-label={kinds.map((k) => `${t(`admin.sandbox-images.kinds.${k}`)} ${row.byKind[k]}`).join(", ")}>
      <span className="nb-sbx-bar" style={{ width }}>
        {kinds.map((k) => <i key={k} className={`nb-kind-${k}`} style={{ flex: row.byKind[k] }} />)}
      </span>
      <span className="nb-sbx-tip" role="tooltip">
        <span className="nb-sbx-tip-h">{t("admin.sandbox-images.kindTip")}</span>
        {kinds.map((k) => <span key={k} className="nb-sbx-tip-row"><i className={`nb-kind-${k}`} />{t(`admin.sandbox-images.kindsCap.${k}`)}<b>{row.byKind[k]}</b></span>)}
      </span>
    </span>
  );
}

function Trend({ row }: { row: PackageRow }) {
  const { t } = useTranslation();
  if (row.new) return <span className="nb-sbx-new">{t("admin.sandbox-images.trendNew")}</span>;
  if (row.previousSignals === row.signals) return <span className="muted">—</span>;
  const pct = Math.round(((row.signals - row.previousSignals) / row.previousSignals) * 100);
  return pct > 0 ? <span className="ok-t">↑ {pct} %</span> : <span className="err-t">↓ {Math.abs(pct)} %</span>;
}

function StatusChip({ row }: { row: { status: PackageStatus; profile?: string; version?: string } }) {
  const { t } = useTranslation();
  const extra = row.status === "added" && row.profile ? ` · ${row.profile}${row.version ? ` ${row.version}` : ""}` : "";
  return <span className={`nb-sbx-st nb-sbx-st-${row.status}`}>{t(`admin.sandbox-images.statuses.${row.status}`)}{extra}</span>;
}

function PackagePanel({ row, period, mapping, onClose }: { row: PackageRow; period: Period; mapping: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = intlLocale(i18n.language);
  const qc = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState<"map" | "reject" | "added" | null>(mapping ? "map" : null);
  const path = `/admin/api/v1/sandbox/packages/${encodeURIComponent(row.ecosystem)}/${encodeURIComponent(row.name)}`;
  const card = useQuery({ queryKey: ["admin", "sandbox-package", row.ecosystem, row.name, period], queryFn: () => api.get<PackageCard>(`${path}?period=${period}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin", "sandbox-packages"] }); qc.invalidateQueries({ queryKey: ["admin", "sandbox-package"] }); };
  const setStatus = useMutation({
    mutationFn: (body: { status: PackageStatus; profile?: string; version?: string; note?: string }) => api.put(`${path}/status`, body),
    onSuccess: () => { setModal(null); refresh(); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const unmap = useMutation({
    mutationFn: (a: { ecosystem: string; name: string }) => api.del(`/admin/api/v1/sandbox/aliases/${a.ecosystem}/${encodeURIComponent(a.name)}`),
    onSuccess: refresh,
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const c = card.data;
  const maxDay = Math.max(1, ...(c?.daily ?? []).map((d) => d.signals));
  return (
    <aside className="nb-sbx-side" aria-label={row.name}>
      <div className="nb-sbx-side-h">
        <span className="small muted">{t(`admin.sandbox-images.ecosystems.${row.ecosystem}`)}</span> <b className="mono">{row.name}</b>
        <StatusChip row={c ?? row} />
        {row.lookalike && <span className="nb-sbx-look">{t("admin.sandbox-images.lookalike", { name: row.lookalike })}</span>}
        <button className="btn ghost sm" style={{ marginLeft: "auto" }} aria-label={t("common.close")} onClick={onClose}><Icon name="x" /></button>
      </div>
      {card.isLoading && <p className="muted">{t("common.loading")}</p>}
      {card.isError && <div className="err-text">{errorText(t, card.error)}</div>}
      {c && (
        <>
          <div className="kpi">
            <div><b>{c.users}</b><span>{t("admin.sandbox-images.kpiUsers", { count: c.users })}</span></div>
            <div><b>{c.signals}</b><span>{t("admin.sandbox-images.kpiSignals", { agent: c.bySource.agent ?? 0, auto: c.bySource.auto ?? 0 })}</span></div>
            <div><b>{Object.entries(c.byProfile).map(([, n]) => n).join(" / ") || "—"}</b><span>{Object.keys(c.byProfile).join(" / ")}</span></div>
          </div>
          <h4 className="nb-sbx-h4">{t("admin.sandbox-images.daily")}</h4>
          <div className="nb-sbx-cols" role="img" aria-label={t("admin.sandbox-images.daily")}>
            {c.daily.map((d) => <i key={d.day} title={`${d.day}: ${d.signals}`} style={{ height: `${(d.signals / maxDay) * 100}%` }} />)}
          </div>
          <h4 className="nb-sbx-h4">{t("admin.sandbox-images.reasons")}</h4>
          {c.reasons.length === 0 && <p className="small muted">{t("admin.sandbox-images.noReasons")}</p>}
          {c.reasons.map((r, i) => (
            <div key={i} className="nb-sbx-reason">{r.text}<div className="small muted">{relativeTime(r.at, locale, new Date(card.dataUpdatedAt))} · {r.profile}</div></div>
          ))}
          <h4 className="nb-sbx-h4">{t("admin.sandbox-images.aliases")}</h4>
          <div className="nb-sbx-aliases">
            {c.aliases.map((a) => (
              <span key={`${a.ecosystem}/${a.name}`} className="chip">
                <span className="mono">{a.name}</span>
                {a.builtin ? <span className="muted small"> · {t("admin.sandbox-images.builtinAlias")}</span>
                  : <button className="btn ghost sm" aria-label={t("common.delete")} onClick={() => unmap.mutate(a)}><Icon name="x" size={12} /></button>}
              </span>
            ))}
            <button className="btn ghost sm" onClick={() => setModal("map")}><Icon name="plus" />{t("admin.sandbox-images.mapModule")}</button>
          </div>
          <h4 className="nb-sbx-h4">{t("admin.sandbox-images.statusTitle")}</h4>
          <div className="nb-sbx-actions">
            <button className="btn primary sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ status: "planned" })}>{t("admin.sandbox-images.plan")}</button>
            <button className="btn sm" onClick={() => setModal("reject")}>{t("admin.sandbox-images.reject")}</button>
            <button className="btn sm" onClick={() => setModal("added")}>{t("admin.sandbox-images.markAdded")}</button>
          </div>
          <div className="hint">{t("admin.sandbox-images.statusHint")}</div>
          {c.history.map((h, i) => (
            <div key={i} className="small muted">{dateTime(h.at, locale)} · {t(`admin.sandbox-images.statuses.${h.status}`)}{h.profile ? ` · ${h.profile}` : ""}{h.note ? ` — ${h.note}` : ""}{h.by === "system" ? ` · ${t("admin.sandbox-images.bySystem")}` : ""}</div>
          ))}
        </>
      )}
      {modal === "reject" && <RejectModal name={row.name} pending={setStatus.isPending} onClose={() => setModal(null)} onSave={(note) => setStatus.mutate({ status: "rejected", note })} />}
      {modal === "added" && <AddedModal name={row.name} pending={setStatus.isPending} onClose={() => setModal(null)} onSave={(profile, version) => setStatus.mutate({ status: "added", profile, version })} />}
      {modal === "map" && <MapModal row={row} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />}
    </aside>
  );
}

function RejectModal({ name, pending, onClose, onSave }: { name: string; pending: boolean; onClose: () => void; onSave: (note: string) => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  return (
    <Modal title={t("admin.sandbox-images.rejectTitle", { name })} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn danger" disabled={!note.trim() || pending} onClick={() => onSave(note.trim())}>{t("admin.sandbox-images.reject")}</button>
    </>}>
      <div className="field"><label htmlFor="sbx-note">{t("admin.sandbox-images.rejectReason")}</label>
        <textarea id="sbx-note" className="inp" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="hint">{t("admin.sandbox-images.rejectHint")}</div></div>
    </Modal>
  );
}

function AddedModal({ name, pending, onClose, onSave }: { name: string; pending: boolean; onClose: () => void; onSave: (profile: string, version: string) => void }) {
  const { t } = useTranslation();
  const profiles = useSandboxProfiles();
  const [profile, setProfile] = useState("");
  const [version, setVersion] = useState("");
  return (
    <Modal title={t("admin.sandbox-images.addedTitle", { name })} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!profile || pending} onClick={() => onSave(profile, version.trim())}>{t("common.save")}</button>
    </>}>
      <div className="form-grid">
        <div className="field"><label htmlFor="sbx-prof">{t("admin.sandbox-images.profile")}</label>
          <select id="sbx-prof" className="inp" value={profile} onChange={(e) => setProfile(e.target.value)}>
            <option value="">—</option>
            {(profiles.data?.profiles ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="sbx-ver">{t("admin.sandbox-images.version")}</label>
          <input id="sbx-ver" className="inp mono" value={version} placeholder={profiles.data?.currentVersion} onChange={(e) => setVersion(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function MapModal({ row, onClose, onDone }: { row: PackageRow; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const fromModule = row.ecosystem === "python-module" || row.ecosystem === "command";
  const [f, setF] = useState<{ ecosystem: string; name: string; packageEcosystem: string; packageName: string }>({
    ecosystem: fromModule ? row.ecosystem : "python-module", name: fromModule ? row.name : "",
    packageEcosystem: fromModule ? (row.ecosystem === "command" ? "apt" : "pypi") : row.ecosystem, packageName: fromModule ? "" : row.name,
  });
  const save = useMutation({ mutationFn: () => api.post("/admin/api/v1/sandbox/aliases", f), onSuccess: onDone });
  return (
    <Modal title={t("admin.sandbox-images.mapModule")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!f.name || !f.packageName || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      <div className="form-grid">
        <div className="field"><label htmlFor="sbx-me">{t("admin.sandbox-images.moduleKind")}</label>
          <select id="sbx-me" className="inp" value={f.ecosystem} onChange={(e) => setF({ ...f, ecosystem: e.target.value })}>
            <option value="python-module">{t("admin.sandbox-images.ecosystems.python-module")}</option>
            <option value="command">{t("admin.sandbox-images.ecosystems.command")}</option>
          </select></div>
        <div className="field"><label htmlFor="sbx-mn">{t("admin.sandbox-images.moduleName")}</label>
          <input id="sbx-mn" className="inp mono" value={f.name} placeholder="cv2" onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="sbx-pe">{t("admin.sandbox-images.ecosystem")}</label>
          <select id="sbx-pe" className="inp" value={f.packageEcosystem} onChange={(e) => setF({ ...f, packageEcosystem: e.target.value })}>
            {(["pypi", "apt", "binary"] as const).map((e) => <option key={e} value={e}>{t(`admin.sandbox-images.ecosystems.${e}`)}</option>)}
          </select></div>
        <div className="field"><label htmlFor="sbx-pn">{t("admin.sandbox-images.packageName")}</label>
          <input id="sbx-pn" className="inp mono" value={f.packageName} placeholder="opencv-python" onChange={(e) => setF({ ...f, packageName: e.target.value })} /></div>
      </div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

// ─── Profiles (design §3.4, §3.6) ───────────────────────────────────

function Profiles() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [create, setCreate] = useState(false);
  const [inUse, setInUse] = useState<SandboxProfile | null>(null);
  const key = adminKeys.sandboxProfiles;
  // a custom image is checked within minutes: follow its state
  const q = useSandboxProfiles(true);
  const assign = useMutation({
    mutationFn: (body: Record<string, string>) => api.put("/admin/api/v1/sandbox/assignments", body),
    onSuccess: () => { toast({ kind: "ok", title: t("admin.sandbox-images.assignSaved") }); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  if (q.isLoading) return <p className="muted">{t("common.loading")}</p>;
  if (q.isError || !q.data) return <div className="llmerr" role="alert"><span>{errorText(t, q.error)}</span><button className="btn sm" onClick={() => q.refetch()}>{t("llm.retry")}</button></div>;
  const d = q.data;
  const ready = d.profiles.filter((p) => p.state === "ready" || !!p.imageDigest);
  return (
    <>
      <div className="nb-sbx-assign">
        <b>{t("admin.sandbox-images.assignment")}</b>
        {(["personal", "group"] as const).map((target) => (
          <div key={target} className="nb-sbx-assign-row">
            <label htmlFor={`sbx-a-${target}`}>{t(`admin.sandbox-images.assign.${target}`)}</label>
            <select id={`sbx-a-${target}`} className="inp" value={d.assignments[target]} disabled={assign.isPending}
              onChange={(e) => assign.mutate({ [target]: e.target.value })}>
              {ready.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            {d.assignments[target] === d.assignments.defaults[target] && <span className="small muted">{t("admin.sandbox-images.standDefault")}</span>}
          </div>
        ))}
        <div className="small muted">{t("admin.sandbox-images.assignService", { profile: d.assignments.defaults.service })}</div>
      </div>
      <div className="nb-sbx-new-row">
        {d.customImages
          ? <button className="btn primary sm" onClick={() => setCreate(true)}><Icon name="plus" />{t("admin.sandbox-images.newProfile")}</button>
          : <span className="small muted">{t("admin.sandbox-images.customDisabled")}</span>}
      </div>
      {d.profiles.map((p) => <ProfileCard key={p.name} p={p} current={d.currentVersion} onInUse={setInUse} />)}
      <p className="small muted">{t("admin.sandbox-images.profilesHint")}</p>
      {create && <NewProfileModal prefixes={d.prefixes} onClose={() => setCreate(false)} />}
      {inUse && (
        <Modal title={t("admin.sandbox-images.inUseTitle", { name: inUse.name })} onClose={() => setInUse(null)}
          footer={<button className="btn primary" onClick={() => setInUse(null)}>{t("common.done")}</button>}>
          <p>{t("admin.sandbox-images.inUse")}</p>
          <ul>
            {inUse.assignedTo.personal && <li>{t("admin.sandbox-images.assign.personal")}</li>}
            {inUse.assignedTo.group && <li>{t("admin.sandbox-images.assign.group")}</li>}
            {inUse.assignedTo.services.map((s) => <li key={s}><a href={adminPath("service-agents")}>{s}</a></li>)}
          </ul>
        </Modal>
      )}
    </>
  );
}

function ProfileCard({ p, current, onInUse }: { p: SandboxProfile; current: string; onInUse: (p: SandboxProfile) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: adminKeys.sandboxProfiles });
  const path = `/admin/api/v1/sandbox/profiles/${encodeURIComponent(p.name)}`;
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const refresh = useMutation({ mutationFn: () => api.post(`${path}/refresh`), onSuccess: done, onError: fail });
  const del = useMutation({
    mutationFn: () => api.del(path), onSuccess: done,
    onError: (e) => (e instanceof ApiError && e.code === "sandbox_profile_in_use" ? onInUse(p) : fail(e)),
  });
  const describe = useMutation({ mutationFn: (description: string) => api.patch(path, { description }),
    onSuccess: () => { setEditing(null); done(); }, onError: fail });
  const custom = p.kind === "custom";
  const inv = p.inventory;
  const behind = custom && p.baseVersion && p.baseVersion !== current;
  const assigned = [p.assignedTo.personal && t("admin.sandbox-images.assign.personal"), p.assignedTo.group && t("admin.sandbox-images.assign.group")].filter(Boolean) as string[];
  // a custom image lists what the check found: search by name looks through all of it (design §3.4)
  const needle = query.trim().toLowerCase();
  const rows = needle ? profileRows(inv, true).filter((r) => r.name.toLowerCase().includes(needle)) : profileRows(inv, full);
  return (
    <section className="nb-sbx-card">
      <div className="nb-sbx-card-h">
        <span className="chip mono">{p.name}</span>
        <span className={`nb-sbx-kind${custom ? " custom" : ""}`}>{t(custom ? "admin.sandbox-images.kindCustom" : "admin.sandbox-images.kindBuiltin")}</span>
        <span className={`nb-sbx-pst nb-sbx-pst-${p.state}`}>{p.state === "checking" && <span className="spin" aria-hidden="true" />}{t(`admin.sandbox-images.states.${p.state}`)}</span>
        {custom && <span className="nb-sbx-look"><Icon name="shield" size={12} /> {t("admin.sandbox-images.notScanned")}</span>}
      </div>
      <div className="nb-sbx-meta">
        <span className="mono">{p.imageRef}</span>
        {p.imageDigest && <span className="mono" title={p.imageDigest}>{p.imageDigest.slice(0, 11)}…{p.imageDigest.slice(-4)}</span>}
        {custom ? (p.baseVersion && <span className={behind ? "nb-sbx-warn" : undefined}>
          {behind ? t("admin.sandbox-images.baseBehind", { base: p.baseVersion, current }) : t("admin.sandbox-images.baseOn", { base: p.baseVersion })}</span>)
          : <span>{t("admin.sandbox-images.nabuVersion", { version: p.baseVersion || current })}</span>}
        {p.nodesTotal > 0 && <span>{t("admin.sandbox-images.nodes", { ready: p.nodesReady, total: p.nodesTotal })}</span>}
      </div>
      {p.error && (
        <div className="llmerr" role="alert"><span>{t(`errors.${p.error}`, { defaultValue: p.error })}{p.imageDigest && p.state === "ready" ? ` ${t("admin.sandbox-images.prevDigest", { digest: p.imageDigest.slice(0, 19) })}` : ""}</span>
          {custom && <button className="btn sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>{t("admin.sandbox-images.checkAgain")}</button>}</div>
      )}
      <div className="small t2">{t("admin.sandbox-images.assigned")}</div>
      <div className="nb-sbx-assigned">
        {assigned.map((a) => <span key={a} className="chip">{a}</span>)}
        {p.assignedTo.services.map((s) => <a key={s} className="chip" href={adminPath("service-agents")}>{s}</a>)}
        {assigned.length === 0 && p.assignedTo.services.length === 0 && <span className="small muted">{t("admin.sandbox-images.notAssigned")}</span>}
      </div>
      {custom && (
        <div className="field">
          <div className="small t2">{t("admin.sandbox-images.agentDescription")}{" "}
            {editing === null && <button className="btn ghost sm" onClick={() => setEditing(p.description)}>{t("common.edit")}</button>}</div>
          {editing === null ? <div className="small">{p.description || "—"}</div> : (
            <>
              <textarea className="inp" rows={3} maxLength={1000} value={editing} onChange={(e) => setEditing(e.target.value)} />
              <div className="nb-sbx-actions" style={{ marginTop: 6 }}>
                <button className="btn ghost sm" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
                <button className="btn primary sm" disabled={describe.isPending} onClick={() => describe.mutate(editing)}>{t("common.save")}</button>
              </div>
            </>
          )}
        </div>
      )}
      {inv?.includes && !full && <div className="small muted">{t("admin.sandbox-images.includes", { name: inv.includes })}</div>}
      {custom && inv && (
        <input className="inp nb-sbx-invsearch" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.sandbox-images.invSearch")} aria-label={t("admin.sandbox-images.invSearch")} />
      )}
      {needle && rows.length === 0 && <div className="small muted">{t("admin.sandbox-images.invNothing")}</div>}
      {rows.length > 0 && (
        <table className="t nb-sbx-inv">
          <thead><tr><th>{t("admin.sandbox-images.invGroup")}</th><th>{t("admin.sandbox-images.invTool")}</th><th>{t("admin.sandbox-images.invVersion")}</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td>{r.group}</td><td className="mono">{r.name}</td><td className="mono t2">{r.version || "—"}</td></tr>)}</tbody>
        </table>
      )}
      <div className="nb-sbx-actions" style={{ marginTop: 8 }}>
        {custom && <button className="btn sm" disabled={refresh.isPending || !!p.pendingRef} onClick={() => refresh.mutate()}>{t("admin.sandbox-images.refreshImage")}</button>}
        {inv && <button className="btn ghost sm" onClick={() => setFull(!full)}>{t(full ? "admin.sandbox-images.showLess" : "admin.sandbox-images.showAll")}</button>}
        {custom && <button className="btn ghost sm danger-t" disabled={del.isPending} onClick={() => del.mutate()}>{t("common.delete")}</button>}
      </div>
    </section>
  );
}

/** The rows of the contents of a profile: the tools of a built-in one, then
 * Python and system packages; short — what the profile adds. */
function profileRows(inv: SandboxProfile["inventory"], full: boolean) {
  if (!inv) return [];
  const rows: { group: string; name: string; version?: string }[] = [];
  for (const tl of inv.tools ?? []) rows.push(tl);
  for (const p of inv.python ?? []) rows.push({ group: "Python", name: p.name, version: p.version });
  if (full) for (const p of inv.system ?? []) rows.push({ group: "Debian", name: p.name, version: p.version });
  if (!inv.tools?.length && inv.kind === "custom") for (const c of (inv.commands ?? []).slice(0, full ? 5000 : 0)) rows.push({ group: "PATH", name: c });
  return full ? rows : rows.slice(0, 12);
}

function NewProfileModal({ prefixes, onClose }: { prefixes: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", image: prefixes[0] ?? "", description: "" });
  const save = useMutation({
    mutationFn: () => api.post("/admin/api/v1/sandbox/profiles", f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: adminKeys.sandboxProfiles }); onClose(); },
  });
  return (
    <Modal title={t("admin.sandbox-images.newProfile")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!f.name || !f.image || save.isPending} onClick={() => save.mutate()}>{t("admin.sandbox-images.createAndCheck")}</button>
    </>}>
      <div className="field"><label htmlFor="sbx-n">{t("admin.sandbox-images.name")}</label>
        <input id="sbx-n" className="inp mono" value={f.name} placeholder="company-tools" onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase() })} /></div>
      <div className="field"><label htmlFor="sbx-i">{t("admin.sandbox-images.image")}</label>
        <input id="sbx-i" className="inp mono" value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} />
        <div className="hint">{t("admin.sandbox-images.allowedPrefixes", { prefixes: prefixes.join(", ") })}</div></div>
      <div className="field"><label htmlFor="sbx-d">{t("admin.sandbox-images.agentDescription")}</label>
        <textarea id="sbx-d" className="inp" rows={3} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="hint">{t("admin.sandbox-images.descriptionHint")}</div></div>
      <div className="nb-sbx-req">{t("admin.sandbox-images.requirements")}</div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}
