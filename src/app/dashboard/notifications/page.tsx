import { BellRing } from "lucide-react";

import {
  NotificationSender,
  type SentNotificationView,
} from "@/components/notification-sender";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { listPushRecipients, listSentNotifications } from "@/lib/services/push";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireRole("admin");
  const [recipients, history] = await Promise.all([
    listPushRecipients(),
    listSentNotifications(),
  ]);

  const vue: SentNotificationView[] = history.map((envoi) => ({
    id: envoi.id,
    title: envoi.title,
    body: envoi.body,
    createdAt: envoi.createdAt.toISOString(),
    senderName: envoi.senderName,
    deliveries: envoi.deliveries.map((d) => ({
      userId: d.userId,
      name: d.name,
      status: d.status,
      error: d.error,
      deviceLabel: d.deviceLabel,
    })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Envoyer un message sur l’appareil des membres, et voir qui l’a reçu."
        icon={BellRing}
      />
      <NotificationSender
        recipients={recipients.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          pushEnabled: r.pushEnabled,
          devices: r.devices,
        }))}
        history={vue}
      />
    </div>
  );
}
