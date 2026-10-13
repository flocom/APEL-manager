"use client";

import { CircleAlert, History, MapPinOff, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card } from "@/components/ui";
import type { AdherentView } from "@/lib/adherent-view";
import { api } from "@/lib/client";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import {
  MEMBER_INFO_FIELD_LABELS,
  type MemberInfoField,
  memberCompleteness,
} from "@/lib/member-info/completeness";
import type {
  MemberSingleRelanceResult,
  MemberUpdateRequestView,
} from "@/lib/member-info/types";

/** « Civilité, Code postal et Ville » : ce qui manque, lisible d'un trait. */
export function libellesManquants(fields: MemberInfoField[]): string {
  const libelles = fields.map((field) => MEMBER_INFO_FIELD_LABELS[field]);
  if (libelles.length <= 1) return libelles.join("");
  return `${libelles.slice(0, -1).join(", ")} et ${libelles.at(-1)}`;
}

/**
 * La pastille d'une ligne de la liste : l'adresse postale d'abord, parce que
 * sans elle la famille ne peut pas être déclarée à l'Apel départementale ;
 * sinon ce qui manque d'autre d'obligatoire (civilité, établissement). Une
 * fiche complète n'a pas de pastille : la liste ne parle que de ce qui reste
 * à faire.
 */
export function CompletudeBadge({ member }: { member: AdherentView }) {
  const completude = memberCompleteness(member);
  if (completude.complete) return null;
  const titre = `Il manque : ${libellesManquants(completude.required)}`;
  return completude.addressComplete ? (
    <span title={titre}>
      <Badge color="amber" icon={CircleAlert}>
        Fiche incomplète
      </Badge>
    </span>
  ) : (
    <span title={titre}>
      <Badge color="coral" icon={MapPinOff}>
        Adresse manquante
      </Badge>
    </span>
  );
}

type EtatLien = { texte: string; couleur: "sea" | "amber" | "slate" };

function etatDuLien(lien: MemberUpdateRequestView, maintenant: number): EtatLien {
  if (lien.completedAt) {
    return {
      texte: `Complétée le ${formatShortDate(lien.completedAt)}`,
      couleur: "sea",
    };
  }
  if (lien.revokedAt) {
    return { texte: "Remplacé par un lien plus récent", couleur: "slate" };
  }
  if (new Date(lien.expiresAt).getTime() <= maintenant) {
    return { texte: "Expiré sans réponse", couleur: "slate" };
  }
  return {
    texte: `En attente · expire le ${formatShortDate(lien.expiresAt)}`,
    couleur: "amber",
  };
}

/**
 * Ce qui manque à la fiche, et le lien que la famille reçoit pour compléter
 * elle-même ses coordonnées.
 *
 * L'historique des liens est lu à l'ouverture : il dit au bureau si la famille
 * a déjà été relancée, quand, et si elle a répondu — avant d'en envoyer un
 * nouveau, qui remplace le précédent.
 */
export function FicheACompleter({ member }: { member: AdherentView }) {
  const toast = useToast();
  const completude = memberCompleteness(member);
  const [liens, setLiens] = useState<MemberUpdateRequestView[] | null>(null);
  // L'heure de la lecture, pour dire « expiré » sans lire l'horloge au rendu.
  const [luA, setLuA] = useState(0);
  const [erreur, setErreur] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { requests } = await api<{ requests: MemberUpdateRequestView[] }>(
        `/api/adherents/${member.id}/relance`,
        { method: "GET" },
      );
      setLiens(requests);
      setLuA(Date.now());
      setErreur(false);
    } catch {
      setErreur(true);
    }
  }, [member.id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function envoyer() {
    setEnvoi(true);
    try {
      const { request } = await api<MemberSingleRelanceResult>(
        `/api/adherents/${member.id}/relance`,
      );
      toast(`Lien envoyé à ${request.sentTo}.`);
      await charger();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setEnvoi(false);
    }
  }

  const aCompleter =
    completude.required.length > 0 || completude.recommended.length > 0;
  // Le serveur refuse le lien d'une fiche archivée : le bouton le dit avant.
  const archivee = member.status === "inactive";
  // Rien à compléter et aucun lien parti : la carte n'apprendrait rien.
  if (!aCompleter && (liens === null || liens.length === 0)) return null;

  const enAttente =
    liens?.some(
      (lien) =>
        !lien.completedAt &&
        !lien.revokedAt &&
        new Date(lien.expiresAt).getTime() > luA,
    ) ?? false;

  return (
    <Card
      className={
        completude.complete ? "overflow-hidden" : "overflow-hidden border-sand-300"
      }
    >
      <section aria-labelledby="fiche-completer" className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              id="fiche-completer"
              className="flex items-center gap-2 text-lg font-bold text-brand-950"
            >
              {completude.complete ? (
                aCompleter ? (
                  "Coordonnées à préciser"
                ) : (
                  "Fiche complétée"
                )
              ) : (
                <>
                  <CircleAlert
                    className="h-5 w-5 shrink-0 text-sand-700"
                    aria-hidden="true"
                  />
                  Fiche incomplète
                </>
              )}
            </h2>
            {completude.required.length > 0 && (
              <p className="mt-2 text-sm leading-6 text-slate-700">
                <span className="font-bold">Il manque :</span>{" "}
                {libellesManquants(completude.required)}.
                {!completude.addressComplete &&
                  " Sans adresse postale complète, la famille ne peut pas être déclarée à l’Apel départementale."}
              </p>
            )}
            {completude.recommended.length > 0 && (
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {completude.required.length > 0
                  ? "À compléter aussi si possible : "
                  : "Rien d’obligatoire ne manque. À compléter si possible : "}
                {libellesManquants(completude.recommended).toLocaleLowerCase("fr")}.
              </p>
            )}
            {!aCompleter && (
              <p className="mt-2 text-sm text-slate-600">
                La fiche est complète.
              </p>
            )}
          </div>
          {aCompleter && (
            <div className="shrink-0 sm:max-w-64">
              <Button
                type="button"
                variant={completude.complete ? "outline" : "primary"}
                icon={Send}
                loading={envoi}
                disabled={!member.email || archivee}
                onClick={envoyer}
                className="w-full"
              >
                Envoyer le lien pour compléter
              </Button>
              <p className="mt-1.5 text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">
                {archivee
                  ? "Fiche archivée : réactivez-la pour envoyer un lien à la famille."
                  : member.email
                  ? enAttente
                    ? `Un lien est déjà en attente : le nouveau, envoyé à ${member.email}, le remplacera.`
                    : `La famille reçoit à ${member.email} un lien personnel, valable 30 jours, pour compléter sa fiche.`
                  : "Aucune adresse e-mail : saisissez-la ci-dessous, ou contactez la famille autrement."}
              </p>
            </div>
          )}
        </div>

        {erreur ? (
          <p className="mt-4 text-sm text-slate-500">
            L’historique des liens n’a pas pu être chargé.
          </p>
        ) : liens && liens.length > 0 ? (
          <div className="mt-5 border-t-2 border-slate-100 pt-4">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              <History className="h-4 w-4" aria-hidden="true" />
              Liens envoyés
            </h3>
            <ul className="mt-3 space-y-2">
              {liens.map((lien) => {
                const etat = etatDuLien(lien, luA);
                return (
                  <li
                    key={lien.id}
                    className="rounded-xl border-2 border-slate-100 px-3 py-2 text-sm"
                  >
                    <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]">
                      Le {formatLongDate(lien.createdAt)} à {lien.sentTo}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                      <Badge color={etat.couleur}>{etat.texte}</Badge>
                      {lien.createdByName && <span>par {lien.createdByName}</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>
    </Card>
  );
}
