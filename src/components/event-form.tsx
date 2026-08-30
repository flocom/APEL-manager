"use client";

import { Globe, Lock, Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Button, Input, Label, Select } from "@/components/ui";
import { ApiError, api } from "@/lib/client";
import { toDatetimeLocal } from "@/lib/dates";
import type { Event } from "@/lib/db/schema";
import { checkTicketingUrl, ticketingHostLabel } from "@/lib/ticketing";
import { useMutationError } from "@/lib/use-mutation-error";

export function EventForm({
  event,
  templates = [],
}: {
  event?: Event;
  templates?: { id: string; name: string; count: number }[];
}) {
  const router = useRouter();
  const onError = useMutationError();
  const editing = Boolean(event);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [description, setDescription] = useState(event?.description ?? "");
  const [publicDescription, setPublicDescription] = useState(
    event?.publicDescription ?? "",
  );
  // `?? ""` obligatoire : la colonne vaut null en base, et un input contrôlé
  // qui reçoit null repasse en non contrôlé.
  const [ticketingUrl, setTicketingUrl] = useState(event?.ticketingUrl ?? "");
  const [erreurBilletterie, setErreurBilletterie] = useState<string | null>(null);
  const verdictBilletterie = checkTicketingUrl(ticketingUrl);
  // Sert à prévenir sans bloquer quand la billetterie n'est pas HelloAsso.
  const hoteBilletterie = verdictBilletterie.ok
    ? ticketingHostLabel(verdictBilletterie.url)
    : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const endRaw = form.get("endAt");

    // Contrôlée ici en plus du serveur : handleApiError réduit toute erreur zod
    // à « Données invalides », le message utile ne serait jamais lu.
    const billetterie = checkTicketingUrl(ticketingUrl);
    if (!billetterie.ok) {
      setErreurBilletterie(billetterie.message);
      setLoading(false);
      document.getElementById("ticketingUrl")?.focus();
      return;
    }
    const body = {
      title: form.get("title"),
      description,
      publicDescription,
      ticketingUrl: billetterie.url,
      location: form.get("location"),
      startAt: form.get("startAt"),
      endAt: endRaw ? endRaw : null,
      status: form.get("status"),
    };

    try {
      if (editing && event) {
        await api(`/api/events/${event.id}`, {
          method: "PATCH",
          body: { ...body, version: event.version },
        });
        router.push(`/dashboard/events/${event.id}`);
      } else {
        const res = await api<{ id: string }>("/api/events", { body });
        // Modèle de check-list optionnel appliqué dès la création.
        if (templateId) {
          try {
            await api(`/api/events/${res.id}/apply-template`, {
              body: { templateId },
            });
          } catch {
            // L'événement est créé ; l'échec du modèle ne doit pas bloquer.
          }
        }
        router.push(`/dashboard/events/${res.id}`);
      }
      router.refresh();
    } catch (err) {
      // Conflit d'édition concurrente : toast « Recharger » plutôt qu'écraser.
      if (err instanceof ApiError && err.status === 409) {
        onError(err);
      } else {
        setError((err as Error).message);
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <FormSection
        number="1"
        title="Informations essentielles"
        description="Le titre est visible de tous, y compris des visiteurs du site."
      >
        <div>
          <Label htmlFor="title">Titre de l’événement</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={event?.title}
            placeholder="Ex. Vide-grenier de printemps"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <Label htmlFor="description" className="!mb-0">
              Notes internes
            </Label>
          </div>
          <p className="mb-2 mt-1 text-xs leading-5 text-slate-500">
            Lisible uniquement par les membres connectés au tableau de bord.
            Codes, contacts, consignes d’organisation, points de vigilance.
          </p>
          <RichTextEditor
            id="description"
            name="description"
            value={description}
            onValueChange={setDescription}
            placeholder="Organisation interne, contacts, consignes…"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <Label htmlFor="publicDescription" className="!mb-0">
              Description publique
            </Label>
          </div>
          <p className="mb-2 mt-1 text-xs leading-5 text-slate-500">
            Affichée sur l’accueil du site et sur la page d’inscription des
            bénévoles, dès que l’événement est publié. Ne rien y mettre que
            vous ne diriez pas devant l’école.
          </p>
          <RichTextEditor
            id="publicDescription"
            name="publicDescription"
            value={publicDescription}
            onValueChange={setPublicDescription}
            placeholder="Ce que les familles doivent savoir : déroulé, horaires, ce qu’il faut apporter…"
          />
        </div>
      </FormSection>

      <FormSection
        number="2"
        title="Date et lieu"
        description="Ces informations seront utilisées dans le calendrier et sur la page d’inscription."
      >
        <div>
          <Label htmlFor="location">Lieu</Label>
          <Input
            id="location"
            name="location"
            defaultValue={event?.location ?? ""}
            placeholder="Ex. Cour de l’école"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="startAt">Début</Label>
            <Input
              id="startAt"
              name="startAt"
              type="datetime-local"
              required
              defaultValue={toDatetimeLocal(event?.startAt)}
            />
          </div>
          <div>
            <Label htmlFor="endAt">Fin (facultatif)</Label>
            <Input
              id="endAt"
              name="endAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(event?.endAt)}
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        number="3"
        title="Billetterie en ligne"
        description="Si les familles doivent réserver ou payer leur place, collez ici le lien de votre billetterie. Sinon, laissez vide."
      >
        <div>
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <Label htmlFor="ticketingUrl" className="!mb-0">
              Lien de réservation (HelloAsso ou autre)
            </Label>
          </div>
          <p className="mb-2 mt-1 text-xs leading-5 text-slate-500">
            Ce lien sert aux familles qui veulent <strong>venir</strong> : il ne
            remplace pas les créneaux de bénévoles, qui restent gérés ici.
            Ouvrez votre billetterie dans le navigateur et copiez l’adresse
            affichée dans la barre du haut.
          </p>
          <Input
            id="ticketingUrl"
            name="ticketingUrl"
            // Volontairement « text » : <input type="url"> refuse
            // « www.helloasso.com/… » sans schéma avec une bulle du navigateur,
            // dans la langue du système, avant que nos messages ne s'affichent.
            type="text"
            inputMode="url"
            spellCheck={false}
            value={ticketingUrl}
            onChange={(e) => {
              setTicketingUrl(e.target.value);
              setErreurBilletterie(null);
            }}
            onBlur={() => {
              const verdict = checkTicketingUrl(ticketingUrl);
              setErreurBilletterie(verdict.ok ? null : verdict.message);
            }}
            aria-invalid={erreurBilletterie ? true : undefined}
            aria-describedby="ticketingUrl-aide"
            placeholder="https://www.helloasso.com/associations/…/evenements/…"
          />
          <p
            id="ticketingUrl-aide"
            role={erreurBilletterie ? "alert" : undefined}
            className={`mt-2 text-xs leading-5 ${
              erreurBilletterie ? "font-semibold text-coral-700" : "text-slate-500"
            }`}
          >
            {erreurBilletterie ??
              (hoteBilletterie && hoteBilletterie !== "HelloAsso"
                ? `Ce n’est pas un lien HelloAsso : les familles verront « sur ${hoteBilletterie} ». C’est accepté, vérifiez simplement que la page est bien celle de la réservation.`
                : "Facultatif. Sans lien, la page publique ne parle que des créneaux de bénévoles.")}
          </p>
        </div>
      </FormSection>

      <FormSection
        number="4"
        title="Visibilité"
        description="Vous pouvez tout préparer en brouillon, puis publier lorsque le lien doit être accessible."
      >
        <div>
          <Label htmlFor="status">Qui peut voir l’événement ?</Label>
          <Select
            id="status"
            name="status"
            defaultValue={event?.status ?? "draft"}
          >
            <option value="draft">Équipe uniquement — brouillon</option>
            <option value="published">
              Tout le monde — événement publié et inscriptions ouvertes
            </option>
            <option value="archived">Archivé — conservé mais masqué</option>
          </Select>
        </div>
      </FormSection>

      {!editing && templates.length > 0 && (
        <FormSection
          number="5"
          title="Préparation"
          description="Gagnez du temps en ajoutant immédiatement une check-list adaptée."
        >
          <div>
          <Label htmlFor="templateId">Check-list de départ (facultatif)</Label>
          <Select
            id="templateId"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Aucune (je la créerai moi-même)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count} tâches)
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-500">
            Les tâches du modèle seront créées automatiquement.
          </p>
          </div>
        </FormSection>
      )}

      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5">
        <Button type="submit" loading={loading}>
          {editing ? "Enregistrer" : "Créer l'événement"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-100 text-sm font-black text-brand-800">
          {number}
        </span>
        <div>
          <h2 className="font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
