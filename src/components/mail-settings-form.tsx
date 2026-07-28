"use client";

import {
  CheckCircle2,
  CircleAlert,
  KeyRound,
  MailCheck,
  Send,
  ServerCog,
  ShieldCheck,
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
  legacyEnvironment: boolean;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  domain: string | null;
  keyLastFour: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string | null;
  smtpPasswordConfigured: boolean;
  smtpAuthConfigured: boolean;
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
  const [provider, setProvider] = useState<"resend" | "smtp">(
    settings.provider,
  );

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const apiKey = String(form.get("apiKey") ?? "").trim();
    const smtpPassword = String(form.get("smtpPassword") ?? "");
    const smtpPort = String(form.get("smtpPort") ?? "").trim();
    const body = {
      provider,
      enabled: form.get("enabled") === "on",
      fromName: form.get("fromName") || null,
      fromEmail: form.get("fromEmail") || null,
      replyTo: form.get("replyTo") || null,
      domain:
        provider === "resend"
          ? form.get("domain") || null
          : settings.domain,
      smtpHost:
        provider === "smtp"
          ? form.get("smtpHost") || null
          : settings.smtpHost,
      smtpPort:
        provider === "smtp"
          ? smtpPort
            ? Number(smtpPort)
            : null
          : settings.smtpPort,
      smtpSecure:
        provider === "smtp"
          ? form.get("smtpSecure") === "on"
          : settings.smtpSecure,
      smtpUsername:
        provider === "smtp"
          ? form.get("smtpUsername") || null
          : settings.smtpUsername,
      clearApiKey: !apiKey && form.get("clearApiKey") === "on",
      clearSmtpPassword:
        !smtpPassword && form.get("clearSmtpPassword") === "on",
      ...(apiKey ? { apiKey } : {}),
      ...(smtpPassword ? { smtpPassword } : {}),
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
                {provider === "smtp"
                  ? "SMTP · relais de messagerie personnalisé"
                  : "Resend · courrier transactionnel de l'association"}
              </p>
            </div>
          </div>
          <MailStatus settings={settings} />
        </div>

        <form onSubmit={save} className="space-y-6 p-5 sm:p-6">
          {settings.legacyEnvironment && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
              <CircleAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <div>
                <p className="font-bold text-brand-950">
                  Ancienne configuration détectée
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enregistrez ce formulaire pour la migrer vers Configuration.
                  Elle ne dépendra ensuite plus du conteneur ni du fichier
                  d&apos;environnement.
                </p>
              </div>
            </div>
          )}

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

          <div>
            <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
              Fournisseur
            </p>
            <Field label="Service d'envoi" htmlFor="mail-provider">
              <Select
                id="mail-provider"
                name="provider"
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as "resend" | "smtp")
                }
              >
                <option value="resend">Resend</option>
                <option value="smtp">Serveur SMTP</option>
              </Select>
            </Field>
          </div>

          {provider === "resend" ? (
            <div className="grid gap-4 rounded-2xl border-2 border-brand-100 bg-brand-50/70 p-4 sm:grid-cols-2">
              <Field
                label="Domaine d'envoi"
                htmlFor="mail-domain"
                hint="Le domaine validé dans votre compte Resend."
              >
                <Input
                  id="mail-domain"
                  name="domain"
                  defaultValue={settings.domain ?? ""}
                  placeholder="apel-ndf.fr"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Clé API Resend"
                htmlFor="mail-api-key"
                hint={
                  settings.keyLastFour
                    ? `Clé enregistrée : •••• ${settings.keyLastFour}. Laissez vide pour la conserver.`
                    : "Elle sera chiffrée et ne sera plus jamais affichée."
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
                {settings.keyLastFour && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-coral-700">
                    <input
                      type="checkbox"
                      name="clearApiKey"
                      className="h-4 w-4 rounded border-2 border-coral-300 accent-[#d95d45]"
                    />
                    Supprimer la clé enregistrée
                  </label>
                )}
              </Field>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border-2 border-brand-100 bg-brand-50/70 p-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                <Field label="Serveur SMTP" htmlFor="smtp-host">
                  <Input
                    id="smtp-host"
                    name="smtpHost"
                    defaultValue={settings.smtpHost ?? ""}
                    placeholder="smtp.resend.com"
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field label="Port" htmlFor="smtp-port">
                  <Input
                    id="smtp-port"
                    name="smtpPort"
                    type="number"
                    min={1}
                    max={65535}
                    defaultValue={settings.smtpPort ?? 587}
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Identifiant SMTP"
                  htmlFor="smtp-username"
                  hint="Laissez les deux champs vides si le relais n'exige pas d'authentification."
                >
                  <Input
                    id="smtp-username"
                    name="smtpUsername"
                    defaultValue={settings.smtpUsername ?? ""}
                    placeholder="Identifiant"
                    autoComplete="username"
                  />
                </Field>
                <Field
                  label="Mot de passe SMTP"
                  htmlFor="smtp-password"
                  hint={
                    settings.smtpPasswordConfigured
                      ? "Un mot de passe est enregistré. Laissez vide pour le conserver."
                      : "Le mot de passe sera stocké chiffré."
                  }
                >
                  <div className="relative">
                    <KeyRound
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    />
                    <Input
                      id="smtp-password"
                      name="smtpPassword"
                      type="password"
                      className="pl-10"
                      placeholder={
                        settings.smtpPasswordConfigured
                          ? "Conserver le mot de passe"
                          : "Mot de passe"
                      }
                      autoComplete="new-password"
                    />
                  </div>
                  {settings.smtpPasswordConfigured && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-coral-700">
                      <input
                        type="checkbox"
                        name="clearSmtpPassword"
                        className="h-4 w-4 rounded border-2 border-coral-300 accent-[#d95d45]"
                      />
                      Supprimer le mot de passe enregistré
                    </label>
                  )}
                </Field>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-white bg-white p-4">
                <input
                  type="checkbox"
                  name="smtpSecure"
                  defaultChecked={settings.smtpSecure}
                  className="mt-0.5 h-5 w-5 rounded border-2 border-slate-300 accent-[#0873ab]"
                />
                <span>
                  <span className="block font-bold text-brand-950">
                    TLS dès la connexion
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">
                    À activer habituellement sur le port 465. Sur le port 587,
                    STARTTLS sera négocié automatiquement.
                  </span>
                </span>
              </label>
            </div>
          )}

          <div>
            <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
              Expéditeur
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
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
                  placeholder="contact@apel-ndf.fr"
                  autoComplete="email"
                  required
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
            </div>
          </div>

          {settings.configurationError && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-coral-200 bg-coral-50 p-4 text-sm font-semibold text-coral-800">
              <CircleAlert
                className="mt-0.5 h-5 w-5 shrink-0"
                aria-hidden="true"
              />
              {settings.configurationError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t-2 border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4 text-sea-600" aria-hidden="true" />
              Les identifiants sont chiffrés avant leur stockage.
            </p>
            <Button type="submit" loading={saving} icon={MailCheck}>
              Enregistrer la configuration
            </Button>
          </div>
        </form>
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
              disabled={Boolean(settings.configurationError)}
            >
              Envoyer un e-mail de test
            </Button>
          </form>
          {settings.configurationError && (
            <p className="mt-3 text-sm font-semibold text-coral-700">
              Enregistrez une configuration complète avant d&apos;envoyer un
              test.
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
                    : "Vérifiez que le relais autorise l'expéditeur et configurez les enregistrements DNS de votre domaine pour assurer la distribution des messages."
                  : "Validez le domaine dans Resend, puis ajoutez les enregistrements DNS SPF et DKIM fournis. L'adresse d'expédition doit utiliser ce domaine."}
              </p>
            </div>
          </div>
        </div>
      </div>
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
