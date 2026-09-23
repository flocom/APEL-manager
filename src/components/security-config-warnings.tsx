import { ShieldAlert } from "lucide-react";

import type { SecurityConfigWarning } from "@/lib/security-config";

/**
 * Les défauts de configuration qui touchent à la sécurité, montrés aux
 * administrateurs : eux seuls peuvent les corriger, et le journal du serveur,
 * où ils sont aussi écrits, n'est pas un endroit où l'on passe tous les jours.
 */
export function SecurityConfigWarnings({
  warnings,
}: {
  warnings: SecurityConfigWarning[];
}) {
  if (warnings.length === 0) return null;
  return (
    <section
      aria-label="Configuration à corriger"
      className="rounded-2xl border-2 border-coral-300 bg-coral-50 px-5 py-4"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-coral-900">
        <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
        {warnings.length > 1
          ? `${warnings.length} réglages du serveur affaiblissent la sécurité`
          : "Un réglage du serveur affaiblit la sécurité"}
      </p>
      <ul className="mt-3 space-y-3">
        {warnings.map((avertissement) => (
          <li key={avertissement.id} className="text-sm leading-6 text-slate-700">
            <strong className="block text-slate-950">{avertissement.titre}</strong>
            {avertissement.detail}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Ces réglages se font dans les variables d’environnement du serveur
        (fichier <code>.env</code> ou hébergeur), pas dans l’application.
      </p>
    </section>
  );
}
