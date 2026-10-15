import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { keys } from "../../api/queries";
import type { CollectSettings, CommState, DigestSettings, MemoryTask } from "../../api/types";
import { errorText } from "../../lib/errors";
import { intlLocale } from "../../lib/i18n";
import { dateTime } from "../../lib/format";
import { Icon, Modal, Switch, useToast } from "@green-on-grey/ui-kit";
import { sourceTitle } from "./tags";

const INTERVALS = ["15m", "1h", "4h", "1d"] as const;
const CHANNELS = ["web", "telegram", "vkteams", "email"] as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

type Patch = { enabled?: boolean; settings?: Partial<CollectSettings & DigestSettings> };

/** The Memory tasks tab (R13, R14, R24, design §3.1): three prepared tasks as
 * cards with a switch and settings, and deleting everything collected. */
export function MemoryTasksTab({ state }: { state: CommState }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const tasks = useQuery({ queryKey: keys.memoryTasks, queryFn: () => api.get<{ items: MemoryTask[] }>("/api/v1/memory-tasks") });
  const [wizard, setWizard] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inv = () => {
    qc.invalidateQueries({ queryKey: keys.memoryTasks });
    qc.invalidateQueries({ queryKey: ["comm"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const patch = useMutation({
    mutationFn: ({ kind, body }: { kind: MemoryTask["kind"]; body: Patch }) => api.patch<MemoryTask>(`/api/v1/memory-tasks/${kind}`, body),
    onSuccess: inv, onError: fail,
  });
  const wipe = useMutation({
    mutationFn: () => api.del("/api/v1/comm", { confirm: "all" }),
    onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ["commitments"] }); setDeleting(false); }, onError: fail,
  });
  const by = (k: MemoryTask["kind"]) => tasks.data?.items.find((x) => x.kind === k);
  const collect = by("collect"), day = by("digest_day"), week = by("digest_week");
  const set = (kind: MemoryTask["kind"]) => (body: Patch) => patch.mutate({ kind, body });
  const connected = state.sources.filter((s) => s.connected);

  return (
    <>
      <div className="tcards">
        {collect && (
          <TaskCard task={collect} icon="repeat" title={t("comm.tasks.collect.title")} text={t("comm.tasks.collect.text")} busy={patch.isPending}
            onToggle={(on) => {
              if (!on) return set("collect")({ enabled: false });
              // the first switching on goes through the consent and the sources (design §3.2)
              if (!state.consentAt || collect.settings.sources.length === 0) return setWizard(true);
              set("collect")({ enabled: true });
            }}>
            {connected.length === 0 ? (
              <div className="nbar amber" style={{ marginBottom: 0 }}><Icon name="plug" /><span className="grow">{t("comm.tasks.collect.noSource")}</span><Link className="btn sm" to="/connections">{t("nav.connections")}</Link></div>
            ) : (
              <CollectSettingsForm state={state} value={collect.settings} disabled={patch.isPending} onChange={(settings) => set("collect")({ settings })} />
            )}
            {collect.enabled && state.collect.budgetUsedPct > 0 && (
              <div className="kvrow"><span className="muted">{t("comm.tasks.collect.budget")}</span>
                <span><div className="meter"><i className={state.collect.budgetUsedPct >= 90 ? "hot" : ""} style={{ width: `${Math.min(100, state.collect.budgetUsedPct)}%` }} /></div>
                  <span className="small muted">{t("comm.tasks.collect.budgetUsed", { pct: state.collect.budgetUsedPct })}</span></span></div>
            )}
          </TaskCard>
        )}
        {day && (
          <TaskCard task={day} icon="clock" title={t("comm.tasks.day.title")} text={t("comm.tasks.day.text")} busy={patch.isPending} onToggle={(on) => set("digest_day")({ enabled: on })}>
            <div className="kvrow"><span className="muted">{t("comm.tasks.days")}</span>
              <span className="chips">
                {DAYS.map((d) => {
                  const on = day.settings.days?.includes(d) ?? false;
                  return <button key={d} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} disabled={patch.isPending}
                    onClick={() => set("digest_day")({ settings: { days: on ? day.settings.days!.filter((x) => x !== d) : [...(day.settings.days ?? []), d] } })}>{t(`comm.tasks.dayShort.${d}`)}</button>;
                })}
              </span></div>
            <DigestFields value={day.settings} disabled={patch.isPending} onChange={(settings) => set("digest_day")({ settings })} />
          </TaskCard>
        )}
        {week && (
          <TaskCard task={week} icon="clock" title={t("comm.tasks.week.title")} text={t("comm.tasks.week.text")} busy={patch.isPending} onToggle={(on) => set("digest_week")({ enabled: on })}>
            <div className="kvrow"><span className="muted">{t("comm.tasks.weekday")}</span>
              <select className="sel" value={week.settings.weekday ?? 1} disabled={patch.isPending} onChange={(e) => set("digest_week")({ settings: { weekday: Number(e.target.value) } })} aria-label={t("comm.tasks.weekday")}>
                {DAYS.map((d) => <option key={d} value={d}>{t(`days.${d % 7}`)}</option>)}
              </select></div>
            <DigestFields value={week.settings} disabled={patch.isPending} onChange={(settings) => set("digest_week")({ settings })} />
          </TaskCard>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>{t("comm.tasks.hint")}</p>

      <div className="collected">
        <div className="grow"><b>{t("comm.tasks.collected")}</b>
          <div className="small t2">{t("comm.tasks.collectedText", { notes: state.counts.notes, commitments: state.counts.openCommitments, days: state.retentionDays })}</div></div>
        <button className="btn danger sm" disabled={state.counts.notes === 0 && !state.consentAt} onClick={() => setDeleting(true)}><Icon name="trash" size={15} />{t("comm.tasks.deleteAll")}</button>
      </div>

      {wizard && collect && <Wizard state={state} task={collect} onClose={() => setWizard(false)} onDone={() => { setWizard(false); inv(); }} />}
      {deleting && (
        <Modal title={t("comm.tasks.deleteAllTitle")} onClose={() => setDeleting(false)} footer={<>
          <button className="btn ghost" onClick={() => setDeleting(false)}>{t("common.cancel")}</button>
          <button className="btn danger" disabled={wipe.isPending} onClick={() => wipe.mutate()}>{t("comm.tasks.deleteAll")}</button>
        </>}>
          <p style={{ marginTop: 0 }}>{t("comm.tasks.deleteAllText", { notes: state.counts.notes, commitments: state.counts.openCommitments })}</p>
        </Modal>
      )}
    </>
  );
}

function TaskCard({ task, icon, title, text, busy, onToggle, children }: {
  task: MemoryTask; icon: "repeat" | "clock"; title: string; text: string; busy: boolean; onToggle: (on: boolean) => void; children: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  return (
    <section className={`tcard${task.enabled ? "" : " off"}`} aria-label={title}>
      <div className="hd"><Icon name={icon} /><b>{title}</b><Switch on={task.enabled} disabled={busy} onChange={onToggle} label={<span className="sr-only">{title}</span>} /></div>
      <p>{text}</p>
      {task.status === "paused" && (
        <div className="nbar amber"><Icon name="pause" /><span className="grow">{t(`comm.tasks.paused.${task.pauseKind ?? "failed"}`, { defaultValue: t("comm.tasks.paused.failed") })}</span>
          <Link className="btn sm" to="/tasks">{t("nav.tasks")}</Link></div>
      )}
      {children}
      {task.enabled && task.nextRunAt && <div className="kvrow"><span className="muted">{t("tasks.cols.next")}</span><span>{dateTime(task.nextRunAt, lng)}</span></div>}
    </section>
  );
}

function DigestFields({ value, disabled, onChange }: { value: DigestSettings; disabled: boolean; onChange: (s: Partial<DigestSettings>) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="kvrow"><span className="muted">{t("comm.tasks.time")}</span>
        <input type="time" className="inp time-inp" defaultValue={value.time} disabled={disabled} aria-label={t("comm.tasks.time")}
          onBlur={(e) => { if (e.target.value && e.target.value !== value.time) onChange({ time: e.target.value }); }} /></div>
      <div className="kvrow"><span className="muted">{t("tasks.cols.channel")}</span>
        <select className="sel" value={value.channel} disabled={disabled} onChange={(e) => onChange({ channel: e.target.value })} aria-label={t("tasks.cols.channel")}>
          {CHANNELS.map((c) => <option key={c} value={c}>{t(`channels.${c}`)}</option>)}
        </select></div>
    </>
  );
}

function CollectSettingsForm({ state, value, disabled, onChange }: {
  state: CommState; value: CollectSettings; disabled: boolean; onChange: (s: Partial<CollectSettings>) => void;
}) {
  const { t } = useTranslation();
  const has = (itemId: string, source: string) => value.sources.some((s) => s.itemId === itemId && s.source === source);
  return (
    <>
      <div className="kvrow top"><span className="muted">{t("comm.tasks.sources")}</span>
        <span className="stack">
          {state.sources.map((s) => (
            // a source chosen and then disconnected can still be switched off, or the collection never goes on
            <Switch key={s.itemId + s.source} on={has(s.itemId, s.source)} disabled={disabled || (!s.connected && !has(s.itemId, s.source))}
              label={<>{sourceTitle(t, s)}{!s.connected && <span className="small muted"> · {t("comm.tasks.notConnected")}</span>}</>}
              onChange={(on) => onChange({ sources: on ? [...value.sources, { itemId: s.itemId, source: s.source }] : value.sources.filter((x) => !(x.itemId === s.itemId && x.source === s.source)) })} />
          ))}
        </span></div>
      <div className="kvrow"><span className="muted">{t("comm.tasks.interval")}</span>
        <select className="sel" value={value.interval} disabled={disabled} onChange={(e) => onChange({ interval: e.target.value as CollectSettings["interval"] })} aria-label={t("comm.tasks.interval")}>
          {INTERVALS.map((i) => <option key={i} value={i}>{t(`comm.tasks.intervals.${i}`)}</option>)}
        </select></div>
      <div className="kvrow"><span className="muted">{t("comm.tasks.hours")}</span>
        <Switch on={value.roundTheClock} disabled={disabled} onChange={(on) => onChange({ roundTheClock: on })} label={t("comm.tasks.roundTheClock")} /></div>
      <Exclusions value={value.exclusions} disabled={disabled} onChange={(exclusions) => onChange({ exclusions })} />
    </>
  );
}

/** What is never collected for the user (R4): senders and folders. */
function Exclusions({ value, disabled, onChange }: { value: CollectSettings["exclusions"]; disabled: boolean; onChange: (v: CollectSettings["exclusions"]) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"senders" | "folders" | "chats">("senders");
  const all = (["senders", "folders", "chats"] as const).flatMap((k) => value[k].map((v) => ({ k, v })));
  return (
    <div className="kvrow top"><span className="muted">{t("comm.tasks.exclusions")}</span>
      <span className="stack">
        <span className="chips">
          {all.map(({ k, v }) => (
            <span className="chip" key={k + v}>{v}
              <button type="button" className="tg-x" disabled={disabled} aria-label={t("common.remove")} onClick={() => onChange({ ...value, [k]: value[k].filter((x) => x !== v) })}><Icon name="x" size={11} /></button>
            </span>
          ))}
        </span>
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v && !value[kind].includes(v)) onChange({ ...value, [kind]: [...value[kind], v] }); setText(""); }}>
          <select className="sel" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label={t("comm.tasks.exclusionKind")}>
            {(["senders", "folders", "chats"] as const).map((k) => <option key={k} value={k}>{t(`comm.tasks.exclusionKinds.${k}`)}</option>)}
          </select>
          <input className="inp" style={{ flex: 1, minWidth: 0 }} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder={t(`comm.tasks.exclusionHint.${kind}`)} aria-label={t("comm.tasks.exclusions")} />
          <button className="btn sm" disabled={disabled || !text.trim()} aria-label={t("comm.tasks.addExclusion")}><Icon name="plus" size={14} /></button>
        </form>
        <span className="small muted">{t("comm.tasks.neverCollected")}</span>
      </span></div>
  );
}

/** The first switching on of the collection (R21, design §3.2): the consent,
 * the sources and the exclusions, the schedule. */
function Wizard({ state, task, onClose, onDone }: { state: CommState; task: MemoryTask; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [step, setStep] = useState(state.consentAt ? 1 : 0);
  const [agreed, setAgreed] = useState(Boolean(state.consentAt));
  const connected = state.sources.filter((s) => s.connected);
  const [settings, setSettings] = useState<CollectSettings>({
    ...task.settings,
    sources: task.settings.sources.length > 0 ? task.settings.sources : connected.map((s) => ({ itemId: s.itemId, source: s.source })),
  });
  const [day, setDay] = useState(true);
  const [week, setWeek] = useState(false);
  const finish = useMutation({
    mutationFn: async () => {
      if (!state.consentAt) await api.put("/api/v1/comm/consent", { accepted: true });
      await api.patch("/api/v1/memory-tasks/collect", { enabled: true, settings });
      if (day) await api.patch("/api/v1/memory-tasks/digest_day", { enabled: true });
      if (week) await api.patch("/api/v1/memory-tasks/digest_week", { enabled: true });
    },
    onSuccess: onDone,
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const steps = ["consent", "sources", "schedule"] as const;
  const canNext = step === 0 ? agreed : step === 1 ? settings.sources.length > 0 : true;
  return (
    <Modal title={t("comm.wizard.title")} onClose={onClose} wide footer={<>
      <button className="btn ghost" onClick={step === 0 ? onClose : () => setStep(step - 1)}>{step === 0 ? t("common.cancel") : t("common.back")}</button>
      {step < 2 ? <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t("comm.wizard.next")}</button>
        : <button className="btn primary" disabled={finish.isPending} onClick={() => finish.mutate()}>{t("comm.wizard.enable")}</button>}
    </>}>
      <ol className="wsteps">{steps.map((s, i) => <li key={s} className={i === step ? "on" : i < step ? "past" : ""} aria-current={i === step ? "step" : undefined}>{t(`comm.wizard.steps.${s}`)}</li>)}</ol>
      {step === 0 && (
        <>
          <ul className="consent">
            <li><Icon name="mail" /><span><b>{t("comm.wizard.read.title")}</b> {t("comm.wizard.read.text")}</span></li>
            <li><Icon name="brain" /><span><b>{t("comm.wizard.stored.title")}</b> {t("comm.wizard.stored.text")}</span></li>
            <li><Icon name="lock" /><span><b>{t("comm.wizard.seen.title")}</b> {t("comm.wizard.seen.text")}</span></li>
            <li><Icon name="trash" /><span><b>{t("comm.wizard.remove.title")}</b> {t("comm.wizard.remove.text")}</span></li>
          </ul>
          <label className="ck"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>{t("comm.wizard.agree")}</span></label>
        </>
      )}
      {step === 1 && (
        <>
          <CollectSettingsFormSources state={state} value={settings} onChange={(p) => setSettings({ ...settings, ...p })} />
          <Exclusions value={settings.exclusions} disabled={false} onChange={(exclusions) => setSettings({ ...settings, exclusions })} />
          <p className="small t2">{t("comm.wizard.history")}</p>
        </>
      )}
      {step === 2 && (
        <>
          <div className="kvrow top"><span className="muted">{t("comm.tasks.interval")}</span>
            <span className="chips">{INTERVALS.map((i) => <button key={i} type="button" className={`chip${settings.interval === i ? " on" : ""}`} aria-pressed={settings.interval === i} onClick={() => setSettings({ ...settings, interval: i })}>{t(`comm.tasks.intervals.${i}`)}</button>)}</span></div>
          <div className="kvrow"><span className="muted">{t("comm.tasks.hours")}</span>
            <Switch on={settings.roundTheClock} onChange={(on) => setSettings({ ...settings, roundTheClock: on })} label={t("comm.tasks.roundTheClock")} /></div>
          <div className="kvrow top"><span className="muted">{t("comm.wizard.digests")}</span>
            <span className="stack">
              <Switch on={day} onChange={setDay} label={t("comm.wizard.digestDay")} />
              <Switch on={week} onChange={setWeek} label={t("comm.wizard.digestWeek")} />
              <span className="small muted">{t("comm.wizard.digestHint")}</span>
            </span></div>
        </>
      )}
    </Modal>
  );
}

function CollectSettingsFormSources({ state, value, onChange }: { state: CommState; value: CollectSettings; onChange: (s: Partial<CollectSettings>) => void }) {
  const { t } = useTranslation();
  const has = (itemId: string, source: string) => value.sources.some((s) => s.itemId === itemId && s.source === source);
  return (
    <div className="kvrow top"><span className="muted">{t("comm.tasks.sources")}</span>
      <span className="stack">
        {state.sources.map((s) => (
          <Switch key={s.itemId + s.source} on={has(s.itemId, s.source)} disabled={!s.connected && !has(s.itemId, s.source)}
            label={<>{sourceTitle(t, s)}{!s.connected && <span className="small muted"> · {t("comm.tasks.notConnected")}</span>}</>}
            onChange={(on) => onChange({ sources: on ? [...value.sources, { itemId: s.itemId, source: s.source }] : value.sources.filter((x) => !(x.itemId === s.itemId && x.source === s.source)) })} />
        ))}
        {state.sources.length === 0 && <span className="small muted">{t("comm.tasks.collect.noSource")}</span>}
      </span></div>
  );
}
