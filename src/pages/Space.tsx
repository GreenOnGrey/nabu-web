import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiUrl } from "../api/base";
import { api, request } from "../api/client";
import { keys } from "../api/queries";
import type { List, SpaceFile, SpaceInfo } from "../api/types";
import { errorText } from "../lib/errors";
import { intlLocale } from "../lib/i18n";
import { bytes, dateTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, useToast } from "../components/ui";

/** The personal space (R31, design §3.4): state, used space, upload; files
 * with path, size, when and by whom changed, download. */
export function SpacePage() {
  const { t, i18n } = useTranslation();
  const lng = intlLocale(i18n.language);
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // FTR.NAB.CMN-0002 R8: letters link to files of the space that were too big to attach
  const [params] = useSearchParams();
  const linked = params.get("path");
  const info = useQuery({ queryKey: keys.space, queryFn: () => api.get<SpaceInfo>("/api/v1/space") });
  const files = useInfiniteQuery({
    queryKey: keys.files,
    initialPageParam: "",
    queryFn: ({ pageParam }) => api.get<List<SpaceFile>>(`/api/v1/space/files?limit=200${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const del = useMutation({
    mutationFn: (p: string) => api.del(`/api/v1/space/files?path=${encodeURIComponent(p)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.files }),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    for (const f of Array.from(list)) {
      try {
        await request("PUT", `/api/v1/space/files?path=${encodeURIComponent("uploads/" + f.name)}`, f);
      } catch (e) {
        toast({ kind: "error", title: errorText(t, e), text: f.name });
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    qc.invalidateQueries({ queryKey: keys.files });
    qc.invalidateQueries({ queryKey: keys.space });
  };
  const s = info.data;
  const items = files.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{t("space.title")}</h1>
          <p className="lead">{t("space.lead")}</p>
        </div>
        <button className="btn primary sm" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} />{t("space.upload")}</button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {linked && (
        <div className="hintbox"><Icon name="files" />
          <span>{t("space.linked")} <span className="mono">{linked}</span>{" "}
            <a className="btn sm" href={apiUrl(`/api/v1/space/files/content?path=${encodeURIComponent(linked)}`)}><Icon name="download" size={14} />{t("space.download")}</a></span>
        </div>
      )}
      {s && (
        <div className="row" style={{ gap: 24, marginBottom: 18, alignItems: "center" }}>
          {s.enabled ? <span className={`statebadge ${s.state}`}>{t(`space.state.${s.state}`)}</span> : <span className="small muted">{t("space.disabled")}</span>}
          <span className="small t2">{t("space.used", { used: bytes(s.usedBytes, lng), quota: bytes(s.quotaBytes, lng) })}</span>
          <span className="quota" aria-hidden><i style={{ width: `${Math.min(100, (s.usedBytes / Math.max(1, s.quotaBytes)) * 100)}%` }} /></span>
        </div>
      )}
      {items.length === 0 && !files.isLoading && <Empty icon="box" title={t("space.empty")}>{t("space.emptyHint")}</Empty>}
      {items.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="t">
            <thead><tr><th>{t("space.cols.path")}</th><th>{t("space.cols.size")}</th><th>{t("space.cols.changed")}</th><th /></tr></thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.path}>
                  <td className="mono">{f.path}</td>
                  <td>{bytes(f.size, lng)}</td>
                  <td>{dateTime(f.modifiedAt, lng)} · {f.modifiedBy === "agent" ? t("space.byAgent") : t("space.byUser")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <a className="btn sm" href={apiUrl(`/api/v1/space/files/content?path=${encodeURIComponent(f.path)}`)}><Icon name="download" size={14} />{t("space.download")}</a>{" "}
                    <button className="iconbtn" aria-label={t("common.delete")} onClick={() => del.mutate(f.path)}><Icon name="trash" size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {files.hasNextPage && <button className="btn ghost sm" onClick={() => files.fetchNextPage()}>{t("common.more")}</button>}
    </div>
  );
}
