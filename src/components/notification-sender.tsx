"use client";

import {
  BellRing,
  CheckCheck,
  CircleAlert,
  Eye,
  Send,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import { formatLongDateTime } from "@/lib/dates";

export interface RecipientOption {
  id: string;
  name: string;
  email: string;
  pushEnabled: boolean;
  devices: number;
}

export interface DeliveryView {
  userId: string;
  name: string;
  status: "queued" | "sent" | "failed" | "received" | "opened";
  error: string | null;
  deviceLabel: string | null;
}

export interface SentNotificationView {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  senderName: string | null;
  deliveries: DeliveryView[];
}

const ETAT: Record<
  DeliveryView["status"],
  { libelle: string; couleur: "slate" | "green" | "amber" | "red" | "sea" }
> = {
  queued: { libelle: "En attente", couleur: "slate" },
  sent: { libelle: "Transmise", couleur: "amber" },
  failed: { libelle: "Échec", couleur: "red" },
  received: { libelle: "Reçue", couleur: "green" },
  opened: { libelle: "Ouverte", couleur: "sea" },
};

export function NotificationSender({
  recipients,
  history,
}: {
  recipients: RecipientOption[];
  history: SentNotificationView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [selection, setSelection] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const joignables = recipients.filter((r) => r.pushEnabled && r.devices > 0);

  function basculer(id: string) {
    setSelection((actuelle) =>
      actuelle.includes(id)
        ? actuelle.filter((x) => x !== id)
        : [...actuelle, id],
    );
  }

  async function envoyer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setEnvoi(true);
    try {
      const resultat = await api<{
        devices: number;
        recipients: number;
        failures: number;
        skipped: { userId: string; reason: string }[];
      }>("/api/push/send", {
        body: {
          title: form.get("title"),
          body: form.get("body"),
          url: form.get("url") || "",
          userIds: selection,
        },
      });
      const ignores = resultat.skipped.length;
      toast(
        `Envoyée à ${resultat.recipients} membre${resultat.recipients > 1 ? "s" : ""} (${resultat.devices} appareil${resultat.devices > 1 ? "s" : ""})` +
          (ignores > 0 ? ` · ${ignores} sans appareil ou ayant coupé` : "") +
          (resultat.failures > 0 ? ` · ${resultat.failures} en échec` : ""),
      );
      (event.target as HTMLFormElement).reset();
      setSelection([]);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b-2 border-slate-100 bg-brand-50 px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-950 text-white">
            <BellRing className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold text-brand-950">Écrire une notification</h2>
            <p className="text-sm text-slate-500">
              {joignables.length} membre{joignables.length > 1 ? "s" : ""}{" "}
              joignable{joignables.length > 1 ? "s" : ""} sur{" "}
              {recipients.length}.
            </p>
          </div>
        </div>

        <form onSubmit={envoyer} className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Titre" htmlFor="push-title">
              <Input
                id="push-title"
                name="title"
                required
                minLength={2}
                maxLength={80}
                placeholder="Rappel : réunion jeudi"
              />
            </Field>
            <Field
              label="Lien à ouvrir (facultatif)"
              htmlFor="push-url"
              hint="Chemin interne, par exemple /dashboard/events"
            >
              <Input id="push-url" name="url" placeholder="/dashboard/events" />
            </Field>
          </div>
          <Field label="Message" htmlFor="push-body">
            <Textarea
              id="push-body"
              name="body"
              required
              minLength={2}
              maxLength={400}
              rows={3}
              placeholder="Le point de préparation de la kermesse a lieu jeudi 20 h à l’école."
            />
          </Field>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">
                Destinataires ({selection.length} sélectionné
                {selection.length > 1 ? "s" : ""})
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelection(joignables.map((r) => r.id))}
                  className="text-xs font-bold text-brand-700 underline hover:text-brand-900"
                >
                  Tous les joignables
                </button>
                <button
                  type="button"
                  onClick={() => setSelection([])}
                  className="text-xs font-bold text-slate-500 underline hover:text-slate-800"
                >
                  Aucun
                </button>
              </div>
            </div>
            <div className="grid max-h-72 gap-2 overflow-y-auto rounded-xl border-2 border-slate-200 p-2 sm:grid-cols-2">
              {recipients.map((membre) => {
                const joignable = membre.pushEnabled && membre.devices > 0;
                return (
                  <label
                    key={membre.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 ${
                      joignable ? "hover:bg-slate-50" : "opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selection.includes(membre.id)}
                      onChange={() => basculer(membre.id)}
                      disabled={!joignable}
                      className="mt-0.5 h-4 w-4 rounded border-2 border-slate-300 accent-[#0873ab]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {membre.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {!membre.pushEnabled
                          ? "a coupé les notifications"
                          : membre.devices === 0
                            ? "aucun appareil activé"
                            : `${membre.devices} appareil${membre.devices > 1 ? "s" : ""}`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end border-t-2 border-slate-100 pt-5">
            <Button
              type="submit"
              icon={Send}
              loading={envoi}
              disabled={selection.length === 0}
            >
              Envoyer la notification
            </Button>
          </div>
        </form>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-brand-950">Envois précédents</h2>
        {history.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Aucune notification envoyée pour le moment.
          </p>
        ) : (
          history.map((envoi) => {
            const recues = envoi.deliveries.filter(
              (d) => d.status === "received" || d.status === "opened",
            ).length;
            const ouvertes = envoi.deliveries.filter(
              (d) => d.status === "opened",
            ).length;
            const echecs = envoi.deliveries.filter(
              (d) => d.status === "failed",
            ).length;
            return (
              <Card key={envoi.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-950">{envoi.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                      {envoi.body}
                    </p>
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      {formatLongDateTime(envoi.createdAt)}
                      {envoi.senderName ? ` · par ${envoi.senderName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge color="green" icon={CheckCheck}>
                      {recues} reçue{recues > 1 ? "s" : ""}
                    </Badge>
                    <Badge color="sea" icon={Eye}>
                      {ouvertes} ouverte{ouvertes > 1 ? "s" : ""}
                    </Badge>
                    {echecs > 0 && (
                      <Badge color="red" icon={TriangleAlert}>
                        {echecs} échec{echecs > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </div>

                <ul className="mt-4 grid gap-1.5 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  {envoi.deliveries.map((livraison, index) => (
                    <li
                      key={`${livraison.userId}-${index}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate text-slate-700">
                        {livraison.name}
                        {livraison.deviceLabel && (
                          <span className="text-slate-400">
                            {" "}
                            · {livraison.deviceLabel}
                          </span>
                        )}
                      </span>
                      <Badge color={ETAT[livraison.status].couleur}>
                        {ETAT[livraison.status].libelle}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {envoi.deliveries.some((d) => d.error) && (
                  <p className="mt-3 flex items-start gap-2 text-xs text-coral-700">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {envoi.deliveries.find((d) => d.error)?.error}
                  </p>
                )}
              </Card>
            );
          })
        )}
      </section>

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        « Transmise » signifie que le service du navigateur a pris le message en
        charge ; « Reçue » que l’appareil l’a réellement reçu, et « Ouverte »
        que la personne a cliqué dessus. Un appareil éteint peut rester
        « Transmise » un moment avant de recevoir.
      </p>
    </div>
  );
}
