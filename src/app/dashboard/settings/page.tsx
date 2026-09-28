import { ChevronRight, Clapperboard, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import {
  AssociationSettingsForm,
  type AssociationSettingsView,
} from "@/components/association-settings-form";
import {
  MailSettingsForm,
  type MailSettingsView,
} from "@/components/mail-settings-form";
import { SecurityConfigWarnings } from "@/components/security-config-warnings";
import { PageHeader } from "@/components/ui";
import { UpdateStatusCard } from "@/components/update-status-card";
import { requireRole } from "@/lib/auth/rbac";
import { securityConfigWarnings } from "@/lib/security-config";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { getOutboundMailStatus } from "@/lib/services/mail-settings";
import { getUpdateStatus } from "@/lib/services/updates";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const [associationStatus, status, updateStatus] = await Promise.all([
    getAssociationSettings(),
    getOutboundMailStatus(),
    getUpdateStatus(),
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Configuration"
        description="Identité officielle et services connectés de l'association."
        icon={SlidersHorizontal}
      />

      <SecurityConfigWarnings warnings={securityConfigWarnings()} />

      <Link
        href="/dashboard/settings/communication"
        className="group flex items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-coral-600 text-white">
          <Clapperboard className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-950">
            Supports de communication
          </span>
          <span className="mt-0.5 block text-sm text-slate-500">
            Créez une vidéo pour présenter l’APEL aux classes, préparée à
            partir des informations de l’association.
          </span>
        </span>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-brand-700"
          aria-hidden="true"
        />
      </Link>

      <AssociationSettingsForm settings={associationSettings} />

      <MailSettingsForm settings={settings} />

      <UpdateStatusCard status={updateStatus} />
    </div>
  );
}
