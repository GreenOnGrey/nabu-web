import { apiUrl } from "../api/base";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GitHubIcon, Icon } from "@green-on-grey/ui-kit";
import { LoginScreen } from "@green-on-grey/ui-kit/login";
import type { PublicConfig } from "../api/types";
import { LANGUAGES, LANGUAGE_NAMES, setDocumentLanguage } from "../lib/i18n";

/** Sign-in (design §3.1): the dark screen with the logo, NABU and the motto
 * (not translated), one button for the provider of the deployment. The screen
 * is the one of the kit (FTR.NAB.CMN-0005 R6). */
export function LoginPage({ config }: { config: PublicConfig }) {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const error = params.get("error");
  const github = config.authProvider === "github";
  return (
    <LoginScreen logo="/logo.jpg" logoAlt={t("login.logoAlt")} name="NABU" tagline="Building AI future together"
      signIn={{ href: apiUrl("/auth/login"), icon: github ? <GitHubIcon /> : <Icon name="shield" />, label: t("login.signIn", { provider: config.providerLabel }) }}
      note={github && config.allowedOrg ? t("login.orgOnly", { org: config.allowedOrg }) : t("login.corporate")}
      error={error ? t(`login.errors.${error}`, { defaultValue: t("login.errors.failed") }) : undefined}
      languages={LANGUAGES.map((l) => ({ code: l, label: LANGUAGE_NAMES[l], active: i18n.language === l }))}
      onLanguage={(l) => { i18n.changeLanguage(l); setDocumentLanguage(l); }} />
  );
}
