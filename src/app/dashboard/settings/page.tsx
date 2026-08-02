import { SlidersHorizontal } from "lucide-react";

import {
  AssociationSettingsForm,
  type AssociationSettingsView,
} from "@/components/association-settings-form";
import {
  MailSettingsForm,
  type MailSettingsView,
} from "@/components/mail-settings-form";
import { PageHeader } from "@/components/ui";
import { UpdateStatusCard } from "@/components/update-status-card";
import { requireRole } from "@/lib/auth/rbac";
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

      <AssociationSettingsForm settings={associationSettings} />

      <MailSettingsForm settings={settings} />

      <UpdateStatusCard status={updateStatus} />
    </div>
  );
}
