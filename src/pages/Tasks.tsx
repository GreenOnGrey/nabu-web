import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { List, Task, TaskRun } from "../api/types";
import { errorText } from "../lib/errors";
import { intlLocale } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Modal, useToast } from "../components/ui";

const FILTERS = ["active", "done", "cancelled"] as const;

/** Scheduled tasks (R36, design §3.2a): created in the conversation with the
 * agent; here — the list with filters, the history of runs, cancel and resume. */
export function TasksPage() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("active");
  const [selected, setSelected] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Task | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const tasks = useQuery({ queryKey: keys.tasks(status), queryFn: () => api.get<List<Task>>(`/api/v1/tasks?status=${status}&limit=100`) });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "cancel" | "resume" }) => api.post<Task>(`/api/v1/tasks/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const lng = intlLocale(i18n.language);
  return (
    <div className="page">
      <h1>{t("tasks.title")}</h1>
      <div className="hintbox"><Icon name="spark" /><div>{t("tasks.hint")}<div className="small" style={{ marginTop: 4 }}><i>{t("tasks.example")}</i></div></div></div>
      <div className="mini-seg" style={{ display: "inline-flex", marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f} className={status === f ? "on" : ""} aria-pressed={status === f} onClick={() => setStatus(f)}>{t(`tasks.filters.${f}`)}</button>
        ))}
      </div>
      {tasks.data?.items.length === 0 && <Empty icon="clock" title={t("tasks.empty")}>{t("tasks.emptyHint")}</Empty>}
      {(tasks.data?.items.length ?? 0) > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="t">
            <thead><tr>
              <th>{t("tasks.cols.task")}</th><th>{t("tasks.cols.schedule")}</th><th>{t("tasks.cols.next")}</th>
              <th>{t("tasks.cols.last")}</th><th>{t("tasks.cols.channel")}</th><th />
            </tr></thead>
            <tbody>
              {tasks.data!.items.map((task) => (
                <TaskRow key={task.id} task={task} lng={lng} open={selected === task.id}
                  onToggle={() => setSelected(selected === task.id ? null : task.id)}
                  onCancel={() => setCancelling(task)} onResume={() => act.mutate({ id: task.id, action: "resume" })} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cancelling && (
        <Modal title={t("tasks.cancelTitle")} onClose={() => setCancelling(null)} footer={<>
          <button className="btn ghost" onClick={() => setCancelling(null)}>{t("common.back")}</button>
          <button className="btn danger" onClick={() => { act.mutate({ id: cancelling.id, action: "cancel" }); setCancelling(null); }}>{t("tasks.cancel")}</button>
        </>}>
          <p style={{ marginTop: 0 }}>{t("tasks.cancelText", { title: cancelling.title })}</p>
        </Modal>
      )}
    </div>
  );
}

function TaskRow({ task, lng, open, onToggle, onCancel, onResume }: {
  task: Task; lng: string; open: boolean; onToggle: () => void; onCancel: () => void; onResume: () => void;
}) {
  const { t } = useTranslation();
  const active = task.status === "active" || task.status === "paused";
  return (
    <>
      <tr>
        <td>
          <button className="linkbtn" onClick={onToggle} aria-expanded={open} style={{ border: 0, background: "none", padding: 0, textAlign: "left", color: "inherit", cursor: "pointer" }}>
            <b>{task.title}</b>
          </button>
          <div className="small muted">{task.instruction}</div>
        </td>
        <td>
          <span className="task-sched"><Icon name={task.schedule.kind === "cron" ? "repeat" : "clock"} size={14} />{scheduleText(t, task)}</span>
          <div className="small muted">{task.schedule.timezone}</div>
        </td>
        <td>
          {task.status === "paused" ? <span className="warn-t">{t("tasks.paused")}</span>
            : task.nextRunAt ? dateTime(task.nextRunAt, lng) : <span className="muted">—</span>}
        </td>
        <td>
          {task.lastRun ? (
            <>
              <span className={task.lastRun.status === "succeeded" ? "ok-t" : task.lastRun.status === "failed" ? "err-t" : "muted"}>
                {t(`tasks.run.${task.lastRun.status}`)}
              </span>
              <div className="small muted">{task.lastRun.error ?? task.lastRun.summary ?? ""}</div>
            </>
          ) : <span className="muted">—</span>}
          {task.status === "paused" && task.pauseReason && <div className="small err-t">{task.pauseReason}</div>}
        </td>
        <td>{t(`channels.${task.channel}`, { defaultValue: task.channel })}</td>
        <td style={{ whiteSpace: "nowrap" }}>
          {task.status === "paused" && <button className="btn sm" onClick={onResume}><Icon name="play" size={14} />{t("tasks.resume")}</button>}{" "}
          {active && <button className="btn sm danger" onClick={onCancel}>{t("tasks.cancel")}</button>}
        </td>
      </tr>
      {open && <tr><td colSpan={6}><Runs task={task} lng={lng} /></td></tr>}
    </>
  );
}

/** The schedule in the user's language for common forms, the server's text otherwise. */
function scheduleText(t: (k: string, o?: Record<string, unknown>) => string, task: Task): string {
  const s = task.schedule;
  if (s.kind === "once" && s.at) return t("tasks.once", { at: new Date(s.at).toLocaleString() });
  const m = /^(\d+) (\d+) \* \* (\*|\d|1-5)$/.exec(s.cron ?? "");
  if (m) {
    const time = `${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")}`;
    if (m[3] === "*") return t("tasks.daily", { time });
    if (m[3] === "1-5") return t("tasks.weekdays", { time });
    return t("tasks.weekly", { time, day: t(`days.${Number(m[3]) % 7}`) });
  }
  const every = /^\*\/(\d+) \* \* \* \*$/.exec(s.cron ?? "");
  if (every) return t("tasks.everyMinutes", { count: Number(every[1]) });
  return s.human;
}

function Runs({ task, lng }: { task: Task; lng: string }) {
  const { t } = useTranslation();
  const runs = useQuery({ queryKey: keys.taskRuns(task.id), queryFn: () => api.get<List<TaskRun>>(`/api/v1/tasks/${task.id}/runs?limit=20`) });
  if (runs.data?.items.length === 0) return <div className="small muted">{t("tasks.noRuns")}</div>;
  return (
    <div className="runs">
      {runs.data?.items.map((r) => (
        <div className="r" key={r.id}>
          <span>{dateTime(r.startedAt, lng)}</span>
          <span className={r.status === "succeeded" ? "ok-t" : r.status === "failed" ? "err-t" : "muted"}>{t(`tasks.run.${r.status}`)}</span>
          <span className="t2">{r.errorText ?? r.summary ?? ""}
            {r.deliveryNote === "channel_unavailable" && <span className="small warn-t"> · {t("tasks.channelUnavailable")}</span>}</span>
          {r.messageId ? <Link to="/" className="small">{t("tasks.openInChat")}</Link> : <span />}
        </div>
      ))}
    </div>
  );
}
