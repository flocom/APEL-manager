"use client";

import {
  BellRing,
  Bot,
  Building2,
  CircleAlert,
  Coins,
  Inbox,
  KeyRound,
  MessageCircle,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LogoUploadField } from "@/components/logo-upload-field";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import {
  MEMBERSHIP_FEE_BASIS_SUFFIX,
  SIGNUP_NOTICE_MODE_LABELS,
  type MembershipFeeBasis,
  type SignupNoticeMode,
} from "@/lib/validation";
import { checkWhatsappUrl, estInvitationGroupe } from "@/lib/whatsapp";

export interface AssociationSettingsView {
  associationName: string;
  schoolName: string;
  contactEmail: string | null;
  rna: string;
  headquarters: string;
  logoUrl: string | null;
  taskReminderWindowDays: number;
  volunteerReminderWindowDays: number;
  telegramEnabled: boolean;
  telegramTokenConfigured: boolean;
  telegramTokenLastFour: string | null;
  telegramBotUsername: string | null;
  telegramTokenVerifiedAt: Date | null;
  telegramReady: boolean;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string | null;
  recaptchaSecretConfigured: boolean;
  recaptchaMinScore: number;
  recaptchaReady: boolean;
  whatsappGroupUrl: string | null;
  membershipFeeCents: number | null;
  membershipFeeBasis: MembershipFeeBasis;
  membershipFeeNote: string;
  signupNoticeMode: SignupNoticeMode;
  legacyEnvironment: boolean;
}

/**
 * Le tarif affiché circule en centimes et se saisit en euros. La conversion
 * tient en deux fonctions plutôt qu’en une expression recopiée : c’est le genre
 * d’arrondi qu’on n’a pas envie de déboguer sur une facture.
 */
function centsVersEuros(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function eurosVersCents(saisie: string): number | null {
  const propre = saisie.trim().replace(",", ".");
  if (!propre) return null;
  const montant = Number(propre);
  return Number.isFinite(montant) ? Math.round(montant * 100) : null;
}

export function AssociationSettingsForm({
  settings,
}: {
  settings: AssociationSettingsView;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState(
    settings.whatsappGroupUrl ?? "",
  );
  const [erreurWhatsapp, setErreurWhatsapp] = useState<string | null>(null);
  const [cotisation, setCotisation] = useState(
    centsVersEuros(settings.membershipFeeCents),
  );
  const [baseCotisation, setBaseCotisation] = useState<MembershipFeeBasis>(
    settings.membershipFeeBasis,
  );
  const [noteCotisation, setNoteCotisation] = useState(
    settings.membershipFeeNote,
  );
  const [avisInscription, setAvisInscription] = useState<SignupNoticeMode>(
    settings.signupNoticeMode,
  );
  const cotisationCents = eurosVersCents(cotisation);
  const verdictWhatsapp = checkWhatsappUrl(whatsappGroupUrl);
  // Prévient sans bloquer : un lien raccourci ou une redirection maison reste
  // acceptable, mais l'administrateur doit voir qu'il n'a pas collé l'invitation.
  const whatsappInhabituel =
    verdictWhatsapp.ok &&
    verdictWhatsapp.url !== null &&
    !estInvitationGroupe(verdictWhatsapp.url);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const telegramBotToken = String(
      form.get("telegramBotToken") ?? "",
    ).trim();
    const recaptchaSecret = String(form.get("recaptchaSecret") ?? "").trim();

    // Contrôlé ici en plus du serveur : handleApiError réduit toute erreur zod
    // à « Données invalides », le message utile ne serait jamais lu.
    const whatsapp = checkWhatsappUrl(whatsappGroupUrl);
    if (!whatsapp.ok) {
      setErreurWhatsapp(whatsapp.message);
      setSaving(false);
      document.getElementById("whatsapp-group-url")?.focus();
      return;
    }

    try {
      await api("/api/settings/association", {
        method: "PATCH",
        body: {
          associationName: form.get("associationName"),
          schoolName: form.get("schoolName"),
          contactEmail: form.get("contactEmail") || null,
          rna: form.get("rna"),
          headquarters: form.get("headquarters"),
          membershipFeeCents: cotisationCents,
          membershipFeeBasis: baseCotisation,
          membershipFeeNote: noteCotisation,
          signupNoticeMode: avisInscription,
          logoUrl: form.get("logoUrl") || null,
          taskReminderWindowDays: Number(
            form.get("taskReminderWindowDays"),
          ),
          volunteerReminderWindowDays: Number(
            form.get("volunteerReminderWindowDays"),
          ),
          telegramEnabled: form.get("telegramEnabled") === "on",
          clearTelegramBotToken:
            !telegramBotToken &&
            form.get("clearTelegramBotToken") === "on",
          ...(telegramBotToken ? { telegramBotToken } : {}),
          recaptchaEnabled: form.get("recaptchaEnabled") === "on",
          recaptchaSiteKey: form.get("recaptchaSiteKey") || null,
          recaptchaMinScore: Number(form.get("recaptchaMinScore")),
          whatsappGroupUrl: whatsapp.url,
          clearRecaptchaSecret:
            !recaptchaSecret && form.get("clearRecaptchaSecret") === "on",
          ...(recaptchaSecret ? { recaptchaSecret } : {}),
        },
      });
      toast("Réglages de l’association enregistrés.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-sea-500" aria-hidden="true" />
      <form onSubmit={save}>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-100 bg-brand-50 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-950 text-white">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
                Réglages généraux
              </p>
              <h2 className="mt-1 text-xl font-bold text-brand-950">
                Identité et notifications
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Ces modifications s&apos;appliquent sans reconstruire le site.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-sea-200 bg-white px-3 py-1.5 text-xs font-bold text-sea-800">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Stocké dans l&apos;application
          </span>
        </div>

        <div className="space-y-8 p-5 sm:p-6">
          {settings.legacyEnvironment && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
              <CircleAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <div>
                <p className="font-bold text-brand-950">
                  Anciennes valeurs détectées
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enregistrez ce formulaire une fois pour les importer et ne
                  plus dépendre des variables de déploiement.
                </p>
              </div>
            </div>
          )}

          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-100 text-brand-800">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-bold text-brand-950">
                  Identité de l&apos;association
                </h3>
                <p className="text-sm text-slate-500">
                  Affichée dans le site, les documents et les messages.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom de l'association" htmlFor="association-name">
                <Input
                  id="association-name"
                  name="associationName"
                  defaultValue={settings.associationName}
                  required
                />
              </Field>
              <Field label="Établissement" htmlFor="school-name">
                <Input
                  id="school-name"
                  name="schoolName"
                  defaultValue={settings.schoolName}
                  required
                />
              </Field>
              <Field label="E-mail de contact" htmlFor="contact-email">
                <Input
                  id="contact-email"
                  name="contactEmail"
                  type="email"
                  defaultValue={settings.contactEmail ?? ""}
                  placeholder="contact@votre-domaine.fr"
                  autoComplete="email"
                />
              </Field>
              <Field
                label="Numéro RNA"
                htmlFor="association-rna"
                hint="Identifiant officiel au Répertoire national des associations."
              >
                <Input
                  id="association-rna"
                  name="rna"
                  defaultValue={settings.rna}
                  pattern="W[0-9]{9}"
                  required
                />
              </Field>
              <Field
                label="Siège social"
                htmlFor="association-headquarters"
                hint="L’adresse déclarée en préfecture. Elle identifie l’association sur les procès-verbaux d’assemblée générale et les attestations."
                className="sm:col-span-2"
              >
                <Input
                  id="association-headquarters"
                  name="headquarters"
                  defaultValue={settings.headquarters}
                  placeholder="12 rue de l’École, 29200 Brest"
                  autoComplete="off"
                />
              </Field>
              <LogoUploadField name="logoUrl" defaultValue={settings.logoUrl} />
            </div>
          </section>

          <section className="border-t-2 border-slate-100 pt-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-100 text-brand-800">
                <Coins className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-bold text-brand-950">La cotisation</h3>
                <p className="text-sm text-slate-500">
                  Ce qu’un parent lit sur la page « Rejoindre l’association »
                  avant d’écrire.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Montant annuel"
                htmlFor="membership-fee"
                hint="En euros. Laissez vide pour ne rien publier : la page renverra au bureau, comme aujourd’hui."
              >
                <Input
                  id="membership-fee"
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  inputMode="decimal"
                  value={cotisation}
                  onChange={(e) => setCotisation(e.target.value)}
                  placeholder="18.00"
                />
              </Field>
              <Field
                label="Ce que couvre la cotisation"
                htmlFor="membership-fee-basis"
                hint="Relève de vos statuts. Sans précision, la page n’affirme rien sur ce point."
              >
                <Select
                  id="membership-fee-basis"
                  value={baseCotisation}
                  onChange={(e) =>
                    setBaseCotisation(e.target.value as MembershipFeeBasis)
                  }
                >
                  <option value="non_precise">Sans précision</option>
                  <option value="famille">Une cotisation par famille</option>
                  <option value="enfant">Une cotisation par enfant</option>
                </Select>
              </Field>
              <Field
                label="Comment régler"
                htmlFor="membership-fee-note"
                hint="Une phrase, écrite par vous : c’est la seule façon de couvrir un chèque remis en classe comme un prélèvement sur la facture de scolarité."
                className="sm:col-span-2"
              >
                <Input
                  id="membership-fee-note"
                  value={noteCotisation}
                  onChange={(e) => setNoteCotisation(e.target.value)}
                  maxLength={300}
                  placeholder="Par chèque à l’ordre de l’association, remis au secrétariat."
                  autoComplete="off"
                />
              </Field>
            </div>

            {/* L’aperçu n’est pas un ornement : le seul moyen de vérifier qu’on
                n’a pas saisi 1800 pour 18 €, c’est de lire la phrase publiée. */}
            <div className="mt-4 rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                Ce que verront les parents
              </p>
              {cotisationCents === null ? (
                <p className="mt-1.5 text-sm font-medium leading-6 text-slate-600">
                  « Le montant et la façon de régler sont fixés par
                  l’association pour l’année en cours : écrivez-nous, on vous le
                  dit. »
                </p>
              ) : (
                <>
                  <p className="mt-1.5 text-lg font-black tracking-[-0.02em] text-brand-950">
                    {(cotisationCents / 100).toLocaleString("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    })}{" "}
                    {MEMBERSHIP_FEE_BASIS_SUFFIX[baseCotisation]}
                  </p>
                  {noteCotisation.trim() && (
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                      {noteCotisation.trim()}
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="border-t-2 border-slate-100 pt-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sea-100 text-sea-800">
                <Inbox className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-bold text-brand-950">
                  Avis d’inscription
                </h3>
                <p className="text-sm text-slate-500">
                  Ce que reçoit l’adresse de contact quand quelqu’un s’inscrit
                  depuis le site.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Quand prévenir"
                htmlFor="signup-notice-mode"
                hint="Le récapitulatif, retenu par défaut, part une fois par jour avec les autres tâches planifiées."
              >
                <Select
                  id="signup-notice-mode"
                  value={avisInscription}
                  onChange={(e) =>
                    setAvisInscription(e.target.value as SignupNoticeMode)
                  }
                >
                  {(
                    Object.keys(SIGNUP_NOTICE_MODE_LABELS) as SignupNoticeMode[]
                  ).map((mode) => (
                    <option key={mode} value={mode}>
                      {SIGNUP_NOTICE_MODE_LABELS[mode]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* La vraie raison de ce réglage : le quota. Le dire ici, où le choix
                se fait, plutôt que de laisser découvrir la panne le jour d'une
                grosse opération. */}
            <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-sand-100 px-4 py-3 text-sm font-semibold leading-6 text-sand-900">
              <CircleAlert
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Le palier gratuit de Resend est limité à{" "}
                <strong>100 e-mails par jour</strong>. Chaque inscription en
                consomme déjà un pour la confirmation envoyée au bénévole : sur
                une grosse opération, un avis à l’unité double la note et peut
                épuiser le quota — ce sont alors les confirmations qui sautent.
                Le récapitulatif n’en coûte qu’un seul par jour.
              </span>
            </p>
          </section>

          <section className="border-t-2 border-slate-100 pt-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sand-100 text-sand-800">
                <BellRing className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-bold text-brand-950">
                  Fenêtres de rappel
                </h3>
                <p className="text-sm text-slate-500">
                  Définissez quand les notifications doivent commencer.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Tâches à traiter"
                htmlFor="task-reminder-window"
                hint="Nombre de jours avant la date de début de traitement calculée."
              >
                <Input
                  id="task-reminder-window"
                  name="taskReminderWindowDays"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={settings.taskReminderWindowDays}
                  required
                />
              </Field>
              <Field
                label="Créneaux bénévoles"
                htmlFor="volunteer-reminder-window"
                hint="Nombre de jours avant le créneau pour prévenir les inscrits."
              >
                <Input
                  id="volunteer-reminder-window"
                  name="volunteerReminderWindowDays"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={settings.volunteerReminderWindowDays}
                  required
                />
              </Field>
            </div>
          </section>

          <section className="border-t-2 border-slate-100 pt-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sea-100 text-sea-800">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-bold text-brand-950">Telegram</h3>
                <p className="text-sm text-slate-500">
                  Notifications privées aux membres ayant renseigné leur chat.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[.75fr_1.25fr]">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-sea-200 bg-sea-50 p-4">
                <input
                  type="checkbox"
                  name="telegramEnabled"
                  defaultChecked={settings.telegramEnabled}
                  className="mt-0.5 h-5 w-5 rounded border-2 border-slate-300 accent-[#0873ab]"
                />
                <span>
                  <span className="block font-bold text-brand-950">
                    Activer Telegram
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">
                    Le canal e-mail reste indépendant. Le champ « Chat ID » des
                    comptes n’apparaît qu’une fois le token confirmé par
                    Telegram.
                  </span>
                </span>
              </label>
              <Field
                label="Token du bot"
                htmlFor="telegram-token"
                hint={
                  settings.telegramTokenLastFour
                    ? `Token enregistré : •••• ${settings.telegramTokenLastFour}. Laissez vide pour le conserver.`
                    : "Fourni par BotFather, puis stocké chiffré."
                }
              >
                <div className="relative">
                  <KeyRound
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <Input
                    id="telegram-token"
                    name="telegramBotToken"
                    type="password"
                    className="pl-10"
                    placeholder={
                      settings.telegramTokenConfigured
                        ? "Conserver le token actuel"
                        : "123456:AA…"
                    }
                    autoComplete="new-password"
                  />
                </div>
                {settings.telegramTokenConfigured && (
                  <p
                    className={`mt-2 text-sm font-semibold ${
                      settings.telegramReady
                        ? "text-sea-800"
                        : "text-coral-700"
                    }`}
                  >
                    {settings.telegramReady
                      ? `Bot confirmé par Telegram${
                          settings.telegramBotUsername
                            ? ` : @${settings.telegramBotUsername}`
                            : ""
                        }. Le canal est ouvert aux membres.`
                      : settings.telegramEnabled
                      ? "Token pas encore confirmé par Telegram : enregistrez les réglages pour le vérifier."
                      : "Telegram est désactivé : le canal n’est proposé à personne."}
                  </p>
                )}
                {settings.telegramTokenConfigured && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-coral-700">
                    <input
                      type="checkbox"
                      name="clearTelegramBotToken"
                      className="h-4 w-4 rounded border-2 border-coral-300 accent-[#d95d45]"
                    />
                    Supprimer le token enregistré
                  </label>
                )}
              </Field>
            </div>
          </section>

          <section className="border-t-2 border-slate-100 pt-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sea-100 text-sea-800">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-bold text-brand-950">Groupe WhatsApp</h3>
                <p className="text-sm text-slate-500">
                  Annoncé aux familles sur la page « Rejoindre l’association »
                  et dans le pied de page du site public.
                </p>
              </div>
            </div>
            <Field
              label="Lien du groupe WhatsApp"
              htmlFor="whatsapp-group-url"
              hint="Dans WhatsApp : ouvrez le groupe › Infos du groupe › Inviter via un lien › Copier le lien. Ce lien est publié tel quel : toute personne qui trouve la page peut entrer dans le groupe. Laissez vide pour ne rien afficher."
            >
              <Input
                id="whatsapp-group-url"
                name="whatsappGroupUrl"
                type="url"
                inputMode="url"
                autoComplete="off"
                value={whatsappGroupUrl}
                onChange={(event) => {
                  setWhatsappGroupUrl(event.target.value);
                  setErreurWhatsapp(null);
                }}
                onBlur={() => {
                  const verdict = checkWhatsappUrl(whatsappGroupUrl);
                  setErreurWhatsapp(verdict.ok ? null : verdict.message);
                }}
                aria-invalid={erreurWhatsapp ? true : undefined}
                aria-describedby="whatsapp-group-url-etat"
                placeholder="https://chat.whatsapp.com/…"
              />
              <p
                id="whatsapp-group-url-etat"
                role={erreurWhatsapp ? "alert" : undefined}
                className={`mt-2 text-xs leading-5 ${
                  erreurWhatsapp
                    ? "font-semibold text-coral-700"
                    : "text-slate-500"
                }`}
              >
                {erreurWhatsapp ??
                  (whatsappInhabituel
                    ? "Ce lien ne ressemble pas à une invitation de groupe WhatsApp — il sera tout de même enregistré et affiché."
                    : "Facultatif. Sans lien, rien n’est annoncé sur le site public.")}
              </p>
            </Field>
          </section>

          <section className="border-t-2 border-slate-100 pt-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-coral-100 text-coral-800">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-bold text-brand-950">
                  Protection anti-robot
                </h3>
                <p className="text-sm text-slate-500">
                  reCAPTCHA v3 sur l’inscription des bénévoles et le formulaire
                  de contact. Les deux clés se créent sur{" "}
                  <a
                    href="https://www.google.com/recaptcha/admin"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand-700 underline"
                  >
                    google.com/recaptcha/admin
                  </a>{" "}
                  en choisissant « v3 ».
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[.75fr_1.25fr]">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-coral-200 bg-coral-50 p-4">
                <input
                  type="checkbox"
                  name="recaptchaEnabled"
                  defaultChecked={settings.recaptchaEnabled}
                  className="mt-0.5 h-5 w-5 rounded border-2 border-slate-300 accent-[#d95d45]"
                />
                <span>
                  <span className="block font-bold text-brand-950">
                    Activer reCAPTCHA
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">
                    {settings.recaptchaReady
                      ? "Actif : les formulaires publics sont vérifiés."
                      : "Sans clé valide, les formulaires restent protégés par le seul champ piège."}
                  </span>
                </span>
              </label>
              <div className="space-y-4">
                <Field label="Clé de site" htmlFor="recaptcha-site">
                  <Input
                    id="recaptcha-site"
                    name="recaptchaSiteKey"
                    defaultValue={settings.recaptchaSiteKey ?? ""}
                    placeholder="6Lc…"
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Clé secrète"
                  htmlFor="recaptcha-secret"
                  hint={
                    settings.recaptchaSecretConfigured
                      ? "Clé enregistrée. Laissez vide pour la conserver."
                      : "Stockée chiffrée, jamais renvoyée au navigateur."
                  }
                >
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <Input
                      id="recaptcha-secret"
                      name="recaptchaSecret"
                      type="password"
                      className="pl-10"
                      placeholder={
                        settings.recaptchaSecretConfigured
                          ? "Conserver la clé actuelle"
                          : "6Lc…"
                      }
                      autoComplete="new-password"
                    />
                  </div>
                  {settings.recaptchaSecretConfigured && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-coral-700">
                      <input
                        type="checkbox"
                        name="clearRecaptchaSecret"
                        className="h-4 w-4 rounded border-2 border-coral-300 accent-[#d95d45]"
                      />
                      Supprimer la clé enregistrée
                    </label>
                  )}
                </Field>
                <Field
                  label="Exigence"
                  htmlFor="recaptcha-score"
                  hint="Google note chaque envoi de 0 à 1. Plus l’exigence est haute, plus un visiteur pressé risque d’être pris pour un robot."
                >
                  <Select
                    id="recaptcha-score"
                    name="recaptchaMinScore"
                    defaultValue={String(settings.recaptchaMinScore)}
                  >
                    <option value="30">Souple — accepte à partir de 0,3</option>
                    <option value="50">
                      Équilibrée — accepte à partir de 0,5
                    </option>
                    <option value="70">Stricte — accepte à partir de 0,7</option>
                  </Select>
                </Field>
              </div>
            </div>
          </section>

          <div className="flex justify-end border-t-2 border-slate-100 pt-5">
            <Button type="submit" loading={saving} icon={Save}>
              Enregistrer les réglages
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
