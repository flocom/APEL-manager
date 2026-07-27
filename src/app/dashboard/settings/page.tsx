import { eq } from "drizzle-orm";
import { Building2, SlidersHorizontal } from "lucide-react";

import {
  MailSettingsForm,
  type MailSettingsView,
} from "@/components/mail-settings-form";
import { Card, PageHeader } from "@/components/ui";
import { APP_NAME, ASSOCIATION_RNA, SCHOOL_NAME } from "@/lib/app-config";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { outboundMailSettings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const [stored] = await db
    .select({
      enabled: outboundMailSettings.enabled,
      provider: outboundMailSettings.provider,
      fromName: outboundMailSettings.fromName,
      fromEmail: outboundMailSettings.fromEmail,
      replyTo: outboundMailSettings.replyTo,
      domain: outboundMailSettings.domain,
      keyLastFour: outboundMailSettings.keyLastFour,
      lastTestedAt: outboundMailSettings.lastTestedAt,
      lastTestStatus: outboundMailSettings.lastTestStatus,
    })
    .from(outboundMailSettings)
    .where(eq(outboundMailSettings.id, "default"))
    .limit(1);

  const settings: MailSettingsView = stored
    ? {
        ...stored,
        lastTestedAt: stored.lastTestedAt?.toISOString() ?? null,
      }
    : {
        enabled: false,
        provider: "resend",
        fromName: APP_NAME,
        fromEmail: null,
        replyTo: null,
        domain: null,
        keyLastFour: null,
        lastTestedAt: null,
        lastTestStatus: "untested",
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
