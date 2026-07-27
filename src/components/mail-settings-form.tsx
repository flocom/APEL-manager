"use client";

import {
  CheckCircle2,
  CircleAlert,
  KeyRound,
  MailCheck,
  Send,
  ServerCog,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/dates";

export interface MailSettingsView {
  enabled: boolean;
  provider: "resend" | "smtp";
  environmentManaged: boolean;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  domain: string | null;
  keyLastFour: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpAuthConfigured: boolean;
  smtpFrom: string | null;
  configurationError: string | null;
  lastTestedAt: string | null;
  lastTestStatus: "untested" | "success" | "failed";
}

export function MailSettingsForm({
  settings,
}: {
  settings: MailSettingsView;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const apiKey = String(form.get("apiKey") ?? "").trim();
    const body = {
      provider: "resend",
      enabled: form.get("enabled") === "on",
      fromName: form.get("fromName") || null,
      fromEmail: form.get("fromEmail") || null,
      replyTo: form.get("replyTo") || null,
      domain: form.get("domain") || null,
      ...(apiKey ? { apiKey } : {}),
    };

    try {
      await api("/api/settings/mail", { method: "PATCH", body });
      toast("Configuration e-mail enregistrée.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTesting(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/settings/mail", {
        body: {
          action: "test",
          testEmail: form.get("testEmail"),
        },
      });
      toast("E-mail de test envoyé.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-100 bg-brand-50 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-700 text-white">
              <ServerCog className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold text-brand-950">
                Serveur d&apos;envoi
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {settings.provider === "smtp"
                  ? "SMTP · configuration Docker / serveur"
                  : "Resend · courrier transactionnel de l'association"}
              </p>
            </div>
          </div>
          <MailStatus settings={settings} />
        </div>

        {settings.environmentManaged ? (
          <SmtpEnvironmentSettings settings={settings} />
        ) : (
          <form onSubmit={save} className="space-y-6 p-5 sm:p-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-sea-200 bg-sea-50 p-4">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings.enabled}
              className="mt-0.5 h-5 w-5 rounded border-2 border-slate-300 accent-[#0873ab]"
            />
            <span>
              <span className="block font-bold text-brand-950">
                Activer l&apos;envoi d&apos;e-mails
              </span>
              <span className="mt-1 block text-sm leading-5 text-slate-600">
                Les confirmations, rappels et messages utiliseront cette
                configuration.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fournisseur" htmlFor="mail-provider">
              <Select
                id="mail-provider"
                name="provider"
                defaultValue={settings.provider}
                disabled
              >
                <option value="resend">Resend</option>
              </Select>
            </Field>
            <Field
              label="Domaine d'envoi"
              htmlFor="mail-domain"
              hint="À renseigner lorsque le nom de domaine sera configuré dans Resend."
            >
              <Input
                id="mail-domain"
                name="domain"
                defaultValue={settings.domain ?? ""}
                placeholder="apel-notredamedesflots.fr"
                autoComplete="off"
              />
            </Field>
            <Field label="Nom de l'expéditeur" htmlFor="mail-from-name">
              <Input
                id="mail-from-name"
                name="fromName"
                defaultValue={
                  settings.fromName ?? "APEL Notre Dame des Flots"
                }
                placeholder="APEL Notre Dame des Flots"
              />
            </Field>
            <Field
              label="Adresse d'expédition"
              htmlFor="mail-from-email"
              hint="Cette adresse devra appartenir au domaine validé."
            >
              <Input
                id="mail-from-email"
                name="fromEmail"
                type="email"
                defaultValue={settings.fromEmail ?? ""}
                placeholder="contact@apel-notredamedesflots.fr"
                autoComplete="email"
              />
            </Field>
            <Field
              label="Adresse de réponse"
              htmlFor="mail-reply-to"
              className="sm:col-span-2"
            >
              <Input
                id="mail-reply-to"
                name="replyTo"
                type="email"
                defaultValue={settings.replyTo ?? ""}
                placeholder="bureau@apel-notredamedesflots.fr"
                autoComplete="email"
              />
            </Field>
            <Field
              label="Clé API Resend"
              htmlFor="mail-api-key"
              className="sm:col-span-2"
              hint={
                settings.keyLastFour
                  ? `Une clé est déjà enregistrée et se termine par •••• ${settings.keyLastFour}. Laissez vide pour la conserver.`
                  : "La clé sera chiffrée côté serveur et ne sera plus affichée."
              }
            >
              <div className="relative">
                <KeyRound
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <Input
                  id="mail-api-key"
                  name="apiKey"
                  type="password"
                  className="pl-10"
                  placeholder={
                    settings.keyLastFour
                      ? "Conserver la clé actuelle"
                      : "re_…"
                  }
                  autoComplete="new-password"
                />
              </div>
            </Field>
          </div>

          <div className="flex justify-end border-t-2 border-slate-100 pt-5">
            <Button type="submit" loading={saving} icon={MailCheck}>
              Enregistrer la configuration
            </Button>
          </div>
          </form>
        )}
      </Card>

      <div className="space-y-6">
        <Card className="p-5 sm:p-6">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-sea-600 text-white">
            <Send className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-slate-950">
            Vérifier la configuration
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {settings.provider === "smtp"
              ? "Vérifiez que le serveur SMTP accepte correctement les messages."
              : "Envoyez un message réel avant d'activer les notifications."}
          </p>
          <form onSubmit={sendTest} className="mt-5 space-y-4">
            <Field label="Destinataire du test" htmlFor="testEmail">
              <Input
                id="testEmail"
                name="testEmail"
                type="email"
                required
                placeholder="votre-adresse@exemple.fr"
                autoComplete="email"
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              loading={testing}
              icon={Send}
              className="w-full"
              disabled={settings.provider === "smtp" && !settings.enabled}
            >
              Envoyer un e-mail de test
            </Button>
          </form>
          {!settings.enabled && settings.configurationError && (
            <p className="mt-3 text-sm font-semibold text-coral-700">
              Corrigez la configuration SMTP avant d&apos;envoyer un test.
            </p>
          )}
        </Card>

        <div className="rounded-2xl border-2 border-sand-200 bg-sand-50 p-5">
          <div className="flex items-start gap-3">
            <CircleAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-sand-700"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-bold text-brand-950">
                {settings.provider === "smtp"
                  ? "Configuration du relais"
                  : "Avant la mise en production"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {settings.provider === "smtp"
                  ? settings.smtpHost?.toLowerCase().includes("mailpit")
                    ? "Mailpit capture les messages dans Docker sans les distribuer sur Internet. Utilisez son interface web pour consulter les e-mails de test."
                    : "Le transport est défini par les variables d'environnement. Vérifiez que le relais autorise l'expéditeur et configurez les enregistrements DNS de votre domaine pour la distribution publique."
                  : "Validez le domaine dans Resend, puis ajoutez les enregistrements DNS SPF et DKIM fournis. L'adresse d'expédition doit utiliser ce domaine."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SmtpEnvironmentSettings({
  settings,
}: {
  settings: MailSettingsView;
}) {
  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div
        className={
          settings.configurationError
            ? "rounded-xl border-2 border-coral-200 bg-coral-50 p-4"
            : "rounded-xl border-2 border-sea-200 bg-sea-50 p-4"
        }
      >
        <p className="font-bold text-brand-950">
          Configuration gérée par l&apos;environnement
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Les paramètres SMTP sont injectés au démarrage du conteneur. Pour les
          modifier, mettez à jour les variables <code>SMTP_*</code>, puis
          redémarrez le service.
        </p>
        {settings.configurationError && (
          <p className="mt-2 text-sm font-semibold text-coral-700">
            {settings.configurationError}
          </p>
        )}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <SmtpSetting
          label="Serveur"
          value={
            settings.smtpHost
              ? `${settings.smtpHost}:${settings.smtpPort ?? "—"}`
              : "Non configuré"
          }
        />
        <SmtpSetting
          label="Sécurité"
          value={
            settings.smtpSecure
              ? "TLS dès la connexion"
              : "SMTP / STARTTLS si disponible"
          }
        />
        <SmtpSetting
          label="Authentification"
          value={
            settings.smtpAuthConfigured
              ? "Identifiants configurés"
              : "Sans authentification"
          }
        />
        <SmtpSetting
          label="Expéditeur"
          value={settings.smtpFrom ?? "Non configuré"}
        />
      </dl>

      <p className="border-t-2 border-slate-100 pt-4 text-sm leading-6 text-slate-500">
        Aucun identifiant ni mot de passe SMTP n&apos;est exposé dans cette
        interface.
      </p>
    </div>
  );
}

function SmtpSetting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-slate-100 bg-slate-50 p-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function MailStatus({ settings }: { settings: MailSettingsView }) {
  if (!settings.enabled) {
    return <Badge color="slate">Désactivé</Badge>;
  }
  if (settings.lastTestStatus === "success") {
    return (
      <div className="text-right">
        <Badge color="sea" icon={CheckCircle2}>
          Opérationnel
        </Badge>
        {settings.lastTestedAt && (
          <p className="mt-1 text-xs text-slate-500">
            Testé {formatDateTime(settings.lastTestedAt)}
          </p>
        )}
      </div>
    );
  }
  if (settings.lastTestStatus === "failed") {
    return <Badge color="coral">Test en échec</Badge>;
  }
  return <Badge color="amber">À tester</Badge>;
}
