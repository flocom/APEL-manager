import { Building2, SlidersHorizontal } from "lucide-react";

import {
  MailSettingsForm,
  type MailSettingsView,
} from "@/components/mail-settings-form";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { APP_NAME, ASSOCIATION_RNA, SCHOOL_NAME } from "@/lib/app-config";
import { getOutboundMailStatus } from "@/lib/services/mail-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const status = await getOutboundMailStatus();
  const settings: MailSettingsView = {
    enabled: status.enabled,
    provider: status.provider,
    environmentManaged: status.environmentManaged,
    fromName:
      status.fromName ?? (status.provider === "resend" ? APP_NAME : null),
    fromEmail: status.fromEmail,
    replyTo: status.replyTo,
    domain: status.domain,
    keyLastFour: status.keyLastFour,
    smtpHost: status.smtpHost,
    smtpPort: status.smtpPort,
    smtpSecure: status.smtpSecure,
    smtpAuthConfigured: status.smtpAuthConfigured,
    smtpFrom: status.smtpFrom,
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

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-sea-500" aria-hidden="true" />
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-950 text-white">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
                Identité officielle
              </p>
              <h2 className="mt-1 text-xl font-bold text-brand-950">
                {APP_NAME}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{SCHOOL_NAME}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 rounded-xl border-2 border-brand-100 bg-brand-50 p-4 sm:min-w-80">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Type
              </dt>
              <dd className="mt-1 font-bold text-brand-950">
                Association de parents d&apos;élèves
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                N° RNA
              </dt>
              <dd className="mt-1 font-extrabold tracking-wide text-brand-950">
                {ASSOCIATION_RNA}
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      <MailSettingsForm settings={settings} />
    </div>
  );
}
