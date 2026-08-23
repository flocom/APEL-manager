"use client";

import { BellRing, Loader2, Share, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { GUIDE_OUVERT_EVENT } from "@/components/welcome-tour";
import { api } from "@/lib/client";
import {
  abonnementLocal,
  activerCetAppareil,
  EVENEMENT_PUSH,
  iosSansEcranAccueil,
  pushDisponible,
  signalerChangementPush,
} from "@/lib/push-device";

/**
 * Bandeau affiché aux membres qui ne recevront rien.
 *
 * Un parent qui n'a jamais activé les notifications ne le sait pas : il croit
 * simplement que l'association ne lui écrit pas. Le bandeau le lui dit là où il
 * regarde, et propose l'activation en un clic — sans passer par les réglages.
 *
 * Il se ferme pour un mois : assez pour ne pas harceler celui qui refuse,
 * assez court pour rattraper celui qui remet à plus tard.
 */

const CLE_REPORT = "apel:bandeau-notifications-reporte-jusquau";
const DUREE_REPORT_MS = 30 * 24 * 60 * 60 * 1000;

type Etat = "chargement" | "masque" | "a-activer" | "ios";

function reporte(): boolean {
  try {
    const valeur = window.localStorage.getItem(CLE_REPORT);
    return valeur !== null && Number(valeur) > Date.now();
  } catch {
    return false;
  }
}

function reporter() {
  try {
    window.localStorage.setItem(
      CLE_REPORT,
      String(Date.now() + DUREE_REPORT_MS),
    );
  } catch {
    // Navigation privée ou stockage refusé : le bandeau reviendra, tant pis.
  }
}

export function PushBanner({ accountEnabled }: { accountEnabled: boolean }) {
  const toast = useToast();
  const chemin = usePathname();
  const [etat, setEtat] = useState<Etat>("chargement");
  const [compteActif, setCompteActif] = useState(accountEnabled);
  const [occupe, setOccupe] = useState(false);
  const [guideOuvert, setGuideOuvert] = useState(false);

  const evaluer = useCallback(async (actif: boolean) => {
    if (reporte()) return setEtat("masque");
    if (!pushDisponible()) {
      return setEtat(iosSansEcranAccueil() ? "ios" : "masque");
    }
    const abonnement = await abonnementLocal().catch(() => null);
    // Il faut les deux : un appareil abonné ne reçoit rien si le compte a coupé.
    setEtat(abonnement && actif ? "masque" : "a-activer");
  }, []);

  useEffect(() => {
    void evaluer(compteActif);
  }, [evaluer, compteActif]);

  // La page « Mon compte » garde l'état à jour de son côté : le bandeau, lui,
  // survit aux navigations et n'apprendrait rien sans ce signal.
  useEffect(() => {
    function surChangement(event: Event) {
      const detail = (event as CustomEvent<{ compteActif?: boolean }>).detail;
      if (typeof detail?.compteActif === "boolean") {
        setCompteActif(detail.compteActif);
      }
      void evaluer(detail?.compteActif ?? compteActif);
    }
    window.addEventListener(EVENEMENT_PUSH, surChangement);
    return () => window.removeEventListener(EVENEMENT_PUSH, surChangement);
  }, [evaluer, compteActif]);

  // Le guide de première connexion couvre l'écran : inutile d'y superposer une
  // invitation de plus, elle attendra qu'il soit terminé.
  useEffect(() => {
    function surGuide(event: Event) {
      const detail = (event as CustomEvent<{ ouvert?: boolean }>).detail;
      setGuideOuvert(Boolean(detail?.ouvert));
    }
    window.addEventListener(GUIDE_OUVERT_EVENT, surGuide);
    return () => window.removeEventListener(GUIDE_OUVERT_EVENT, surGuide);
  }, []);

  async function activer() {
    setOccupe(true);
    try {
      // Le clic vaut consentement : si le compte avait tout coupé, on le
      // rallume plutôt que de renvoyer le membre vers ses réglages.
      if (!compteActif) {
        await api("/api/me", { method: "PATCH", body: { pushEnabled: true } });
        setCompteActif(true);
      }
      await activerCetAppareil();
      signalerChangementPush({ compteActif: true });
      setEtat("masque");
      toast("Cet appareil recevra les notifications de l’association.");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setOccupe(false);
    }
  }

  function plusTard() {
    reporter();
    setEtat("masque");
  }

  // Sur « Mon compte », le réglage complet est juste en dessous : un bandeau
  // qui répète l'invitation ferait doublon.
  if (chemin === "/dashboard/account") return null;
  if (guideOuvert) return null;
  if (etat === "chargement" || etat === "masque") return null;

  const iOS = etat === "ios";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border-2 border-brand-200 bg-brand-50 px-4 py-3 sm:px-5"
    >
      {/* Icône et texte forment un seul bloc : sur un téléphone, il passe en
          entier à la ligne au lieu de s'étrangler à côté de l'icône. */}
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        {iOS ? (
          <Share
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
            aria-hidden="true"
          />
        ) : (
          <BellRing
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
            aria-hidden="true"
          />
        )}
        <p className="min-w-0 text-sm leading-6 text-brand-900">
          <span className="font-bold">
            {iOS
              ? "Recevez les notifications sur votre iPhone"
              : "Vous ne recevez pas les notifications"}
          </span>
          <span className="block text-brand-800">
            {iOS ? (
              <>
                Touchez <Share className="inline h-4 w-4" aria-hidden="true" />{" "}
                Partager en bas de Safari, puis « Sur l’écran d’accueil ».
                Ouvrez ensuite le site depuis cette icône pour les activer.
              </>
            ) : (
              "Les messages de l’association arrivent directement sur cet appareil, même quand le site est fermé."
            )}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {iOS ? (
          <Link
            href="/dashboard/account"
            className="inline-flex min-h-10 items-center rounded-xl border-2 border-brand-200 bg-white px-3.5 py-2 text-sm font-bold text-brand-900 transition-colors hover:border-brand-300"
          >
            En savoir plus
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void activer()}
            disabled={occupe}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {occupe ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <BellRing className="h-4 w-4" aria-hidden="true" />
            )}
            Activer les notifications
          </button>
        )}
        <button
          type="button"
          onClick={plusTard}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Plus tard
        </button>
      </div>
    </div>
  );
}
