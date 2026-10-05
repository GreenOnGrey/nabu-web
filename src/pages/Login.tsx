import { apiUrl } from "../api/base";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { PublicConfig } from "../api/types";
import { GitHubIcon, Icon } from "../components/Icon";
import { LANGUAGES, LANGUAGE_NAMES, setDocumentLanguage } from "../lib/i18n";

/** Sign-in (design §3.1): the dark screen with the logo, NABU and the motto
 * (not translated), one button for the provider of the deployment. */
export function LoginPage({ config }: { config: PublicConfig }) {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const error = params.get("error");
  const github = config.authProvider === "github";
  return (
    <div className="login nb">
      <div className="box">
        <img src="/logo.jpg" alt={t("login.logoAlt")} />
        <h1>NABU</h1>
        <div className="tag">Building AI future together</div>
        <a className="btn primary" href={apiUrl("/auth/login")}>
          {github ? <GitHubIcon /> : <Icon name="shield" />}
          {t("login.signIn", { provider: config.providerLabel })}
        </a>
        <div className="sub">
          {github && config.allowedOrg ? t("login.orgOnly", { org: config.allowedOrg }) : t("login.corporate")}
        </div>
        {error && <div className="err-text" role="alert">{t(`login.errors.${error}`, { defaultValue: t("login.errors.failed") })}</div>}
        <div className="chips">
          {LANGUAGES.map((l) => (
            <button key={l} lang={l} className={`chip${i18n.language === l ? " on" : ""}`}
              onClick={() => { i18n.changeLanguage(l); setDocumentLanguage(l); }}>
              {LANGUAGE_NAMES[l]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
