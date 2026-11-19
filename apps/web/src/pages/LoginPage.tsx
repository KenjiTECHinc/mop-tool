import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { ApiClientError, api } from "../api/client.ts";
import { setLanguage } from "../i18n/index.ts";
import { Alert } from "../components/atoms/Alert.tsx";
import { Button } from "../components/atoms/Button.tsx";
import { TextField } from "../components/atoms/TextField.tsx";
import { AuthTemplate } from "../components/templates/AuthTemplate.tsx";
import { useSession } from "../context/SessionContext.tsx";

export function LoginPage() {
  const { t } = useTranslation();
  const { me, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [error, setError] = useState("");
  if (me && !me.user.mustChangePassword) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (me?.user.mustChangePassword) {
        await api.changePassword(password);
        await refresh();
        return;
      }
      if (challengeId) {
        const result = await api.verifyMfa(challengeId, code);
        await refresh();
        if (!result.passwordChangeRequired) setChallengeId("");
        return;
      }
      const result = await api.login(email, password);
      if (result.mfaRequired && result.challengeId) {
        setChallengeId(result.challengeId);
        return;
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.code : "INTERNAL");
    }
  }

  const sentence = me?.user.mustChangePassword ? t("login.newPassword") : challengeId ? t("login.mfa") : t("login.sentence");

  return (
    <AuthTemplate title={t("app.name")} sentence={sentence} onLanguage={(language) => void setLanguage(language)}>
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        {me?.user.mustChangePassword ? (
          <TextField type="password" required minLength={12} aria-label={t("login.password")} placeholder={t("login.password")} value={password} onChange={(event) => setPassword(event.target.value)} />
        ) : challengeId ? (
          <TextField inputMode="numeric" required aria-label={t("login.code")} placeholder={t("login.code")} value={code} onChange={(event) => setCode(event.target.value)} />
        ) : (
          <>
            <TextField type="email" required aria-label={t("login.email")} placeholder={t("login.email")} value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextField type="password" required aria-label={t("login.password")} placeholder={t("login.password")} value={password} onChange={(event) => setPassword(event.target.value)} />
          </>
        )}
        {error ? <Alert title={t(`error.${error}`, { defaultValue: t("error.generic") })} /> : null}
        <Button type="submit">{me?.user.mustChangePassword ? t("login.change") : t("login.signIn")}</Button>
      </form>
    </AuthTemplate>
  );
}
