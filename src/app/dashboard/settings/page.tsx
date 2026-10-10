import { SlidersHorizontal } from "lucide-react";

import {
  AssociationSettingsForm,
  type AssociationSettingsView,
} from "@/components/association-settings-form";
import { HelloAssoSettingsCard } from "@/components/helloasso-settings-card";
import {
  MailSettingsForm,
  type MailSettingsView,
} from "@/components/mail-settings-form";
import { SecurityConfigWarnings } from "@/components/security-config-warnings";
import { SettingsNav, type SettingsNavItem } from "@/components/settings-nav";
import { PageHeader } from "@/components/ui";
import { UpdateStatusCard } from "@/components/update-status-card";
import { requireRole } from "@/lib/auth/rbac";
import { securityConfigWarnings } from "@/lib/security-config";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { getHelloAssoStatus } from "@/lib/services/helloasso";
import { getOutboundMailStatus } from "@/lib/services/mail-settings";
import { getUpdateStatus } from "@/lib/services/updates";
import { SETTINGS_SECTION_CLASS } from "@/lib/settings-sections";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const [associationStatus, status, updateStatus, helloasso] =
    await Promise.all([
      getAssociationSettings(),
      getOutboundMailStatus(),
      getUpdateStatus(),
      getHelloAssoStatus(),
    ]);
  const associationSettings: AssociationSettingsView = {
    associationName: associationStatus.associationName,
    schoolName: associationStatus.schoolName,
    contactEmail: associationStatus.contactEmail,
    rna: associationStatus.rna,
    headquarters: associationStatus.headquarters,
    membershipFeeCents: associationStatus.membershipFeeCents,
    membershipFeeBasis: associationStatus.membershipFeeBasis,
    membershipFeeNote: associationStatus.membershipFeeNote,
    signupNoticeMode: associationStatus.signupNoticeMode,
    logoUrl: associationStatus.logoUrl,
    taskReminderWindowDays: associationStatus.taskReminderWindowDays,
    volunteerReminderWindowDays:
      associationStatus.volunteerReminderWindowDays,
    telegramEnabled: associationStatus.telegramEnabled,
    telegramTokenConfigured: associationStatus.telegramTokenConfigured,
    telegramTokenLastFour: associationStatus.telegramTokenLastFour,
    telegramBotUsername: associationStatus.telegramBotUsername,
    telegramTokenVerifiedAt: associationStatus.telegramTokenVerifiedAt,
    telegramReady: associationStatus.telegramReady,
    recaptchaEnabled: associationStatus.recaptchaEnabled,
    recaptchaSiteKey: associationStatus.recaptchaSiteKey,
    recaptchaSecretConfigured: associationStatus.recaptchaSecretConfigured,
    recaptchaMinScore: associationStatus.recaptchaMinScore,
    recaptchaReady: associationStatus.recaptchaReady,
    whatsappGroupUrl: associationStatus.whatsappGroupUrl,
    legacyEnvironment: associationStatus.legacyEnvironment,
  };
  const settings: MailSettingsView = {
    enabled: status.enabled,
    provider: status.provider,
    legacyEnvironment: status.legacyEnvironment,
    fromName: status.fromName ?? associationStatus.associationName,
    fromEmail: status.fromEmail,
    replyTo: status.replyTo,
    domain: status.domain,
    keyLastFour: status.keyLastFour,
    smtpHost: status.smtpHost,
    smtpPort: status.smtpPort,
    smtpSecure: status.smtpSecure,
    smtpUsername: status.smtpUsername,
    smtpPasswordConfigured: status.smtpPasswordConfigured,
    smtpAuthConfigured: status.smtpAuthConfigured,
    configurationError: status.configurationError,
    lastTestedAt: status.lastTestedAt?.toISOString() ?? null,
    lastTestStatus: status.lastTestStatus,
  };

  const warnings = securityConfigWarnings();

  // Le sommaire suit l'ordre de la page. Les pastilles disent d'un coup d'œil
  // ce qui marche et ce qui reste à régler, sans ouvrir chaque section.
  const sommaire: SettingsNavItem[] = [
    ...(warnings.length > 0
      ? [
          {
            id: "alertes",
            label: "À corriger",
            group: "Association",
            status: "warning",
            statusLabel: "Réglage du serveur à corriger",
          } satisfies SettingsNavItem,
        ]
      : []),
    { id: "identite", label: "Identité", group: "Association" },
    {
      id: "cotisation",
      label: "Cotisation",
      group: "Association",
      ...(associationStatus.membershipFeeCents === null
        ? { status: "off", statusLabel: "Montant non publié" }
        : {}),
    },
    { id: "inscriptions", label: "Avis d'inscription", group: "Communication" },
    { id: "rappels", label: "Rappels", group: "Communication" },
    {
      id: "telegram",
      label: "Telegram",
      group: "Communication",
      ...(associationStatus.telegramReady
        ? { status: "ok", statusLabel: "En service" }
        : associationStatus.telegramEnabled
          ? { status: "warning", statusLabel: "Activé mais pas prêt" }
          : { status: "off", statusLabel: "Désactivé" }),
    },
    {
      id: "whatsapp",
      label: "Groupe WhatsApp",
      group: "Communication",
      ...(associationStatus.whatsappGroupUrl
        ? { status: "ok", statusLabel: "Lien publié" }
        : { status: "off", statusLabel: "Aucun lien" }),
    },
    {
      id: "anti-robot",
      label: "Anti-robot",
      group: "Services connectés",
      ...(associationStatus.recaptchaReady
        ? { status: "ok", statusLabel: "En service" }
        : associationStatus.recaptchaEnabled
          ? { status: "warning", statusLabel: "Activé mais pas prêt" }
          : { status: "off", statusLabel: "Désactivé" }),
    },
    {
      id: "email",
      label: "E-mails sortants",
      group: "Services connectés",
      ...(status.configurationError || status.lastTestStatus === "failed"
        ? { status: "warning", statusLabel: "À vérifier" }
        : status.enabled
          ? { status: "ok", statusLabel: "En service" }
          : { status: "off", statusLabel: "Désactivés" }),
    },
    {
      id: "helloasso",
      label: "HelloAsso",
      group: "Services connectés",
      ...(helloasso.configured
        ? helloasso.lastSyncStatus === "failed"
          ? { status: "warning", statusLabel: "Dernière synchronisation en échec" }
          : { status: "ok", statusLabel: "Connecté" }
        : helloasso.form
          ? { status: "warning", statusLabel: "Clés d’API à ajouter" }
          : { status: "off", statusLabel: "Non connecté" }),
    },
    {
      id: "mises-a-jour",
      label: "Mises à jour",
      group: "Système",
      ...(updateStatus.state === "outdated"
        ? { status: "warning", statusLabel: "Mise à jour disponible" }
        : updateStatus.state === "up-to-date"
          ? { status: "ok", statusLabel: "À jour" }
          : {}),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Configuration"
        description="Identité officielle et services connectés de l'association. Vos préférences personnelles sont dans « Mon compte »."
        icon={SlidersHorizontal}
      />

      <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <SettingsNav items={sommaire} label="Sections de la configuration" />

        <div className="mt-5 min-w-0 space-y-6 lg:mt-0">
          {warnings.length > 0 && (
            <div id="alertes" className={SETTINGS_SECTION_CLASS}>
              <SecurityConfigWarnings warnings={warnings} />
            </div>
          )}

          <AssociationSettingsForm
            settings={associationSettings}
            helloassoConfigured={helloasso.configured}
          />

          <section id="email" className={SETTINGS_SECTION_CLASS}>
            <MailSettingsForm settings={settings} />
          </section>

          <HelloAssoSettingsCard status={helloasso} />

          <section id="mises-a-jour" className={SETTINGS_SECTION_CLASS}>
            <UpdateStatusCard status={updateStatus} />
          </section>
        </div>
      </div>
    </div>
  );
}
