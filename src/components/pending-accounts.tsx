"use client";

import { Check, Hourglass, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/dates";

export interface PendingAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/**
 * Les comptes qui attendent leur validation, en tête de l'écran Utilisateurs.
 *
 * Posés au-dessus du tableau et non mêlés à lui : une ligne « en attente »
 * perdue au milieu de trente comptes actifs, triés par nom, est une demande
 * qu'on ne voit pas. Les deux gestes sont côte à côte, et seul le refus, qui
 * supprime le compte, demande confirmation.
 */
export function PendingAccounts({ accounts }: { accounts: PendingAccount[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<PendingAccount | null>(null);

  async function approve(account: PendingAccount) {
    setBusyId(account.id);
    try {
      await api(`/api/members/${account.id}/validation`);
      // Le nom après les deux-points : « de » devant un prénom qui commence
      // par une voyelle devrait s'élider (« d'Anne »), ce qu'un gabarit ne
      // sait pas faire. Espace insécable avant « : », pour que le signe ne
      // commence pas une ligne du message.
      toast(`Compte validé, rôle Membre\u00a0: ${account.name}.`);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function refuse() {
    if (!refusing) return;
    const account = refusing;
    setBusyId(account.id);
    try {
      await api(`/api/members/${account.id}/validation`, { method: "DELETE" });
      toast(`Demande refusée, compte supprimé\u00a0: ${account.name}.`);
      setRefusing(null);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  if (accounts.length === 0) return null;

  return (
    <section
      aria-labelledby="comptes-en-attente"
      className="overflow-hidden rounded-2xl border-2 border-sand-300 bg-white"
    >
      <div className="flex items-start gap-3 border-b-2 border-sand-200 bg-sand-50 px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sand-200 text-sand-900">
          <Hourglass className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="comptes-en-attente"
            className="font-bold text-slate-950"
          >
            {accounts.length} compte{accounts.length > 1 ? "s" : ""} en
            attente de validation
          </h2>
          {/* Ce que valider ouvre, dit là où l'on valide : c'est le seul
              moment où l'on décide qui entre. Et ce qui est garanti : l'adresse
              a été confirmée depuis sa boîte, le nom non — c'est l'adresse
              qu'il faut reconnaître. */}
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Chaque adresse ci-dessous a été confirmée depuis sa boîte e-mail ;
            le nom, lui, est celui que la personne a saisi. Ne validez que les
            adresses que vous reconnaissez : un compte validé voit les notes
            internes, les événements en préparation et l’équipe. Refuser
            supprime le compte.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
          >
            <div className="min-w-0">
              <p className="font-bold text-slate-900 [overflow-wrap:anywhere]">
                {account.name}
              </p>
              <p className="text-sm text-slate-600 [overflow-wrap:anywhere]">
                {account.email}
              </p>
              {/* Date absolue, pas « il y a 3 heures » : le rendu serveur et
                  celui du navigateur ne liraient pas l'horloge au même instant,
                  et le texte changerait sous les yeux à l'hydratation. */}
              <p className="mt-0.5 text-xs text-slate-500">
                Demande reçue le{" "}
                <time dateTime={account.createdAt}>
                  {formatDateTime(account.createdAt)}
                </time>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                icon={Check}
                loading={busyId === account.id && !refusing}
                disabled={busyId !== null}
                onClick={() => approve(account)}
                className="min-h-12"
              >
                Valider
                <span className="sr-only"> : {account.name}</span>
              </Button>
              <Button
                type="button"
                variant="dangerOutline"
                icon={UserX}
                disabled={busyId !== null}
                onClick={() => setRefusing(account)}
                className="min-h-12"
              >
                Refuser
                <span className="sr-only"> : {account.name}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(refusing)}
        title="Refuser cette demande ?"
        description={
          refusing
            ? `Compte concerné\u00a0: ${refusing.name} (${refusing.email}). Il sera supprimé\u00a0; la personne pourra refaire une demande.`
            : ""
        }
        confirmLabel="Refuser et supprimer"
        loading={Boolean(refusing) && busyId === refusing?.id}
        onCancel={() => setRefusing(null)}
        onConfirm={refuse}
      />
    </section>
  );
}
