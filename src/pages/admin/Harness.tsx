import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Harness } from "../../api/types";

/** Harnesses (R20, tech §4): installed harnesses with version and state; Pi in this release. */
export function HarnessAdmin() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: ["admin", "harnesses"], queryFn: () => api.get<{ items: Harness[] }>("/admin/api/v1/harnesses") });
  return (
    <>
      <h2 style={{ marginTop: 0 }}>{t("admin.harness.title")}</h2>
      <p className="t2">{t("admin.harness.lead")}</p>
      <table className="t">
        <thead><tr><th>{t("admin.harness.name")}</th><th>{t("admin.harness.version")}</th><th>{t("admin.harness.state")}</th></tr></thead>
        <tbody>
          {list.data?.items.map((h) => (
            <tr key={h.name}><td><b>{h.name === "pi" ? "Pi" : h.name}</b></td><td className="mono">{h.version}</td>
              <td><span className={`st ${h.status === "ok" ? "ok" : "review"}`}>{t(`admin.harness.states.${h.status}`, { defaultValue: h.status })}</span></td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
