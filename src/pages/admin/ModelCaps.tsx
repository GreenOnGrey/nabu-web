import { useTranslation } from "react-i18next";
import { Icon } from "@green-on-grey/ui-kit";
import { tokens } from "@green-on-grey/ui-kit/chat";
import type { ModelDef } from "../../api/types";

/** The capabilities of a model as chips (FTR.NAB.CHAT-0001 R8, design §1). */
export function ModelCaps({ m }: { m: ModelDef }) {
  const { t, i18n } = useTranslation();
  return (
    <span className="caps">
      {m.embeddings ? <span className="mcap">{t("models.cap.embeddings")}</span> : <>
        {m.input?.includes("image") && <span className="mcap"><Icon name="image" size={11} />{t("models.cap.image")}</span>}
        {m.reasoning && <span className="mcap"><Icon name="brain" size={11} />{t("models.cap.reasoning")}</span>}
        {m.tools === false && <span className="mcap err">{t("models.cap.noTools")}</span>}
      </>}
      {m.contextWindow > 0 && <span className="mcap">{tokens(m.contextWindow, i18n.language)}</span>}
      {m.gone && <span className="mcap warn">{t("admin.models.gone")}</span>}
    </span>
  );
}
