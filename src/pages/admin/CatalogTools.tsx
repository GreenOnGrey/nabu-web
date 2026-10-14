import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Icon, Switch } from "@green-on-grey/ui-kit";
import type { AdminCatalogItem } from "../../api/types";
import { ApiError } from "../../api/client";
import { errorText } from "../../lib/errors";
import { allowedOf, applyReadOnly, isFileArg, isReadOnly, sortTools, toggleFileArg, toggleTool, type ToolChoice } from "./catalogTools";

const SEARCH_FROM = 8;

/** What the block edits: the chosen tools, the old switch "Read-only" of an
 * item without a check, the file limit in megabytes. */
export interface ToolsValue {
  choice: ToolChoice;
  readOnly: boolean;
  fileMax: string;
}

/** The check of the item from the block. */
export interface ToolsCheck {
  run: () => void;
  saveAndRun: () => void;
  pending: boolean;
  error: unknown;
}

/** The field of the block an error of saving points at (design §3.2). */
function invalidField(err: unknown): "tools" | "fileMax" | null {
  if (!(err instanceof ApiError)) return null;
  if (err.code === "catalog_file_max_invalid") return "fileMax";
  if (err.code === "catalog_tool_unknown" || err.code === "catalog_file_arg_invalid") return "tools";
  return null;
}

/** The block "Tools" of the form of an MCP item (FTR.NAB.CMN-0006 design §3.2):
 * the tools the agent sees, "Read-only" as a quick choice, file arguments and
 * the file limit. Without a check there is nothing to choose from: a plate
 * offers to save and check, and the old switch "Read-only" stays. */
export function ToolsBlock({ item, value, onChange, check, saveError }: {
  item: AdminCatalogItem | null;
  value: ToolsValue;
  onChange: (v: ToolsValue) => void;
  check: ToolsCheck;
  saveError: unknown;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const tools = item?.tools ?? [];
  const { choice } = value;
  const setChoice = (c: ToolChoice) => onChange({ ...value, choice: c });
  const invalid = invalidField(saveError);
  const needsConnection = check.error instanceof ApiError && check.error.code === "catalog_check_needs_connection";
  const checkedAt = item?.checkedAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(new Date(item.checkedAt))
    : null;
  const header = (
    <div className="ctools-hd">
      <b>{t("admin.catalog.toolsBlock")}</b>
      {tools.length > 0 && <span className="small muted">{t("admin.catalog.toolsAllowed", { allowed: allowedOf(tools, choice.allowed).length, total: tools.length })}</span>}
      <span className="ctools-grow" />
      {checkedAt && <span className="small muted">{t("admin.catalog.checkedAt", { time: checkedAt })}</span>}
      {item && (
        <button className="btn sm" disabled={check.pending || needsConnection} onClick={check.run}>
          <Icon name="refresh" size={14} />{t("admin.catalog.check")}
        </button>
      )}
    </div>
  );

  if (needsConnection) {
    return (
      <div className="field ctools">
        {header}
        <div className="ctools-plate"><span className="ctools-grow">{t("admin.catalog.checkNeedsConnection")}</span>
          <Link className="btn sm" to="/connections">{t("admin.catalog.openConnections")}</Link></div>
      </div>
    );
  }
  if (tools.length === 0) {
    return (
      <div className="field ctools">
        {header}
        <div className="ctools-ro"><Switch on={value.readOnly} onChange={(on) => onChange({ ...value, readOnly: on })} label={t("admin.catalog.readOnly")} /></div>
        <div className="ctools-plate"><span className="ctools-grow">{t("admin.catalog.checkFirst")}</span>
          <button className="btn sm" disabled={check.pending} onClick={check.saveAndRun}>{t("admin.catalog.saveAndCheck")}</button></div>
        {check.error ? <div className="err-text ctools-err">{errorText(t, check.error)}</div> : null}
      </div>
    );
  }

  const shown = sortTools(tools, choice.allowed).filter((tl) => !query || tl.name.toLowerCase().includes(query.toLowerCase()));
  const anyFile = choice.fileArgs.length > 0;
  return (
    <div className={`field ctools${check.pending ? " busy" : ""}${invalid === "tools" ? " invalid" : ""}`}>
      {header}
      {check.error ? <div className="err-text ctools-err">{errorText(t, check.error)}</div> : null}
      <div className="ctools-ro">
        <Switch on={isReadOnly(tools, choice.allowed)} onChange={(on) => setChoice(applyReadOnly(choice, tools, on))} label={t("admin.catalog.readOnly")} />
        <div className="hint">{t("admin.catalog.toolsHint")}</div>
      </div>
      {tools.length > SEARCH_FROM && (
        <div className="ctools-search"><input className="inp" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("admin.catalog.toolsSearch")} aria-label={t("admin.catalog.toolsSearch")} /></div>
      )}
      <ul className="ctools-list">
        {shown.map((tl) => {
          const on = choice.allowed.includes(tl.name);
          const args = tl.stringArgs ?? [];
          const hasFile = choice.fileArgs.some((f) => f.tool === tl.name);
          const id = `ct-${tl.name}`;
          return (
            <li key={tl.name} className={`ctools-tool${on ? "" : " off"}`}>
              <input id={id} type="checkbox" checked={on} onChange={(e) => setChoice(toggleTool(choice, tl.name, e.target.checked))} />
              <div className="ctools-main">
                <label htmlFor={id} className="ctools-name mono">
                  {tl.name}
                  {!tl.readOnly && <span className="ctools-lb chg">{t("admin.catalog.toolChanges")}</span>}
                  {item?.newTools?.includes(tl.name) && !on && <span className="ctools-lb new">{t("admin.catalog.toolNew")}</span>}
                  {hasFile && <span className="ctools-lb file"><Icon name="files" size={11} />{t("admin.catalog.fileShort")}</span>}
                </label>
                {tl.description && <div className="ctools-desc" title={tl.description}>{tl.description}</div>}
                {on && args.length > 0 && open === tl.name && (
                  <div className="ctools-args">
                    {args.map((a) => (
                      <div key={a} className="ctools-arg">
                        <span className="mono ctools-argname">{a}</span>
                        <Switch on={isFileArg(choice, tl.name, a)} onChange={(v) => setChoice(toggleFileArg(choice, tl.name, a, v))} label={t("admin.catalog.fileArg")} />
                      </div>
                    ))}
                    <div className="hint">{t("admin.catalog.fileArgHint")}</div>
                  </div>
                )}
              </div>
              {on && args.length > 0 ? (
                <button className="ctools-argsbtn" aria-expanded={open === tl.name} onClick={() => setOpen(open === tl.name ? null : tl.name)}>
                  {t("admin.catalog.toolArgs")} {open === tl.name ? "▴" : "▾"}
                </button>
              ) : <span />}
            </li>
          );
        })}
      </ul>
      {anyFile && (
        <div className="ctools-fmax">
          <label htmlFor="ct-fmax" className="small">{t("admin.catalog.fileMax")}</label>
          <input id="ct-fmax" className={`inp ctools-fmaxinp${invalid === "fileMax" ? " ctools-bad" : ""}`} inputMode="decimal"
            aria-invalid={invalid === "fileMax"} value={value.fileMax} onChange={(e) => onChange({ ...value, fileMax: e.target.value })} />
          <span className="hint">{t("admin.catalog.fileMaxHint")}</span>
        </div>
      )}
    </div>
  );
}
