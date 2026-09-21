import { Phone } from "lucide-react";
import { notFound } from "next/navigation";

import {
  MeetingAttendance,
  type MeetingReply,
} from "@/components/meeting-attendance";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import {
  getEventWithDetails,
  getMeetingAttendance,
  nomPresent,
  telephonePresent,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * L'onglet « Présences » d'une réunion.
 *
 * Il n'a de sens que pour une réunion : sur un événement ordinaire, l'adresse
 * répond 404 plutôt que d'afficher une page vide.
 */
export default async function PresencesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, event] = await Promise.all([
    requireUser(),
    getEventWithDetails(id),
  ]);
  if (!event || event.kind !== "meeting") notFound();

  const presences = await getMeetingAttendance(event.id);
  const maReponse =
    (presences.find((r) => r.userId === user.id)?.status as
      | MeetingReply
      | undefined) ?? null;
  const presents = presences.filter((r) => r.status === "yes");
  const peutEtre = presences.filter((r) => r.status === "maybe");
  const absents = presences.filter((r) => r.status === "no");

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <h2 className="text-lg font-bold text-slate-950">
          Vous serez là ?
        </h2>
        <p className="mb-4 mt-1 text-sm leading-6 text-slate-500">
          Votre réponse est visible des autres membres. Recliquez dessus
          pour la retirer. Les parents sans compte répondent depuis le lien
          public : ils apparaissent ci-dessous, marqués «&nbsp;invité&nbsp;».
        </p>
        <MeetingAttendance eventId={event.id} reponse={maReponse} />
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { titre: "Présents", gens: presents, teinte: "text-sea-700" },
          { titre: "Peut-être", gens: peutEtre, teinte: "text-sand-700" },
          { titre: "Absents", gens: absents, teinte: "text-slate-500" },
        ].map(({ titre, gens, teinte }) => (
          <Card key={titre} className="p-5">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                {titre}
              </span>
              <span className={cn("text-2xl font-black", teinte)}>
                {gens.length}
              </span>
            </p>
            {gens.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Personne pour l’instant.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {gens.map((r) => {
                  const telephone = telephonePresent(r);
                  return (
                    <li key={r.id} className="text-sm font-medium text-slate-700">
                      {nomPresent(r)}
                      {/* Un parent sans compte a répondu par le lien
                          public : le dire évite de le chercher dans
                          l'annuaire des membres, et rappelle que la
                          réunion est ouverte. */}
                      {!r.userId && (
                        <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                          invité
                        </span>
                      )}
                      {/* Cliquable : celui qui consulte cette liste pour
                          relancer quelqu'un est le plus souvent sur son
                          téléphone, la veille de la réunion.
                          Même écriture que les inscrits d'un événement —
                          icône, taille et couleur : les deux écrans
                          montrent la même chose, ils doivent la montrer de
                          la même façon. */}
                      {telephone && (
                        <a
                          href={`tel:${telephone.replace(/[^+0-9]/g, "")}`}
                          className="mt-0.5 flex min-h-11 w-fit max-w-full items-center gap-1.5 rounded text-sm font-semibold text-brand-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <Phone
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          {/* Préfixe lu, pas aria-label : le numéro doit
                              rester dans le nom accessible du lien. */}
                          <span className="sr-only">
                            Appeler {nomPresent(r)} au{" "}
                          </span>
                          <span className="[overflow-wrap:anywhere]">
                            {telephone}
                          </span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
