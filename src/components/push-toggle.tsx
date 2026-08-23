"use client";

import { BellOff, BellRing, Loader2, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import {
  abonnementLocal,
  activerCetAppareil,
  desactiverCetAppareil,
  pushDisponible,
  signalerChangementPush,
} from "@/lib/push-device";

/**
 * Notifications sur appareil : deux niveaux, volontairement distincts.
 *
 * L'interrupteur du compte vaut pour tous les appareils — c'est lui qui coupe
 * tout. L'activation, elle, se fait appareil par appareil : le navigateur
 * exige une autorisation explicite, et un membre peut vouloir être prévenu sur
 * son téléphone sans l'être sur l'ordinateur familial.
 */

export function PushToggle({ enabled }: { enabled: boolean }) {
  const toast = useToast();
  const [compteActif, setCompteActif] = useState(enabled);
  const [abonne, setAbonne] = useState<boolean | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [supporte, setSupporte] = useState(true);

  useEffect(() => {
    const ok = pushDisponible();
    setSupporte(ok);
    if (!ok) return setAbonne(false);
    abonnementLocal()
      .then((s) => setAbonne(Boolean(s)))
      .catch(() => setAbonne(false));
  }, []);

  const activerAppareil = useCallback(async () => {
    setOccupe(true);
    try {
      await activerCetAppareil();
      setAbonne(true);
      signalerChangementPush({ compteActif: true });
      toast("Cet appareil recevra les notifications.");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setOccupe(false);
    }
  }, [toast]);

  const desactiverAppareil = useCallback(async () => {
    setOccupe(true);
    try {
      await desactiverCetAppareil();
      setAbonne(false);
      signalerChangementPush({ compteActif });
      toast("Cet appareil ne recevra plus de notifications.");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setOccupe(false);
    }
  }, [toast, compteActif]);

  async function changerCompte(valeur: boolean) {
    setCompteActif(valeur);
    try {
      await api("/api/me", { method: "PATCH", body: { pushEnabled: valeur } });
      signalerChangementPush({ compteActif: valeur });
      toast(
        valeur
          ? "Vous recevrez de nouveau les notifications."
          : "Notifications coupées sur tous vos appareils.",
      );
    } catch (error) {
      setCompteActif(!valeur);
      toast((error as Error).message, "error");
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={compteActif}
          onChange={(event) => void changerCompte(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-slate-300 accent-[#0873ab]"
        />
        <span>
          <span className="block text-sm font-bold text-slate-900">
            Recevoir les notifications de l’association
          </span>
          <span className="mt-1 block text-sm leading-5 text-slate-500">
            Décoché, plus aucune notification ne vous est envoyée, sur aucun
            appareil.
          </span>
        </span>
      </label>

      {!supporte ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
          Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez
          d’abord le site à l’écran d’accueil depuis Safari : touchez Partager,
          puis « Sur l’écran d’accueil », et rouvrez le site depuis cette icône.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3">
          <Smartphone
            className="h-5 w-5 shrink-0 text-slate-500"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 text-sm font-medium text-slate-600">
            {abonne === null
              ? "Vérification de cet appareil…"
              : abonne
                ? "Cet appareil est activé."
                : "Cet appareil n’est pas encore activé."}
          </p>
          <button
            type="button"
            disabled={occupe || abonne === null || !compteActif}
            onClick={() => void (abonne ? desactiverAppareil() : activerAppareil())}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-900 disabled:opacity-50"
          >
            {occupe ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : abonne ? (
              <BellOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <BellRing className="h-4 w-4" aria-hidden="true" />
            )}
            {abonne ? "Désactiver ici" : "Activer sur cet appareil"}
          </button>
        </div>
      )}
    </div>
  );
}
