"use client";

import {
  ArrowLeft,
  Check,
  CircleAlert,
  CircleDashed,
  FileCheck2,
  Loader2,
  Lock,
  NotebookPen,
  Printer,
  TriangleAlert,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ChampBoolean,
  ChampChoix,
  ChampNombre,
  ChampPersonne,
  ChampTexte,
  ListePersonnes,
  ListeTexte,
} from "@/components/pv/pv-champs";
import { PvResolutions } from "@/components/pv/pv-resolutions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import {
  completudeSection,
  resumeSection,
  verdictQuorum,
  votantsTotaux,
} from "@/lib/documents/ag-calculs";
import { blocages, controlerPv } from "@/lib/documents/ag-controles";
import { ORDRE_DU_JOUR_TYPE } from "@/lib/documents/ag-modeles";
import {
  AG_SECTIONS,
  type AgMinutesPayload,
  type AgSectionCle,
  type ReglesStatutaires,
} from "@/lib/documents/ag-types";
import { cn } from "@/lib/utils";

/**
 * L'éditeur de procès-verbal.
 *
 * Une page continue plutôt qu'un assistant en sept écrans : un secrétaire de
 * séance relit ses notes en désordre, revient trois fois sur les présences, et
 * un assistant l'oblige à avancer dans un ordre qu'il ne suit pas. Le sommaire
 * de gauche donne la position et la complétude ; tout le reste est là, sous les
 * yeux, et s'enregistre tout seul.
 *
 * L'enregistrement est en file d'attente à une seule requête : la frappe, le
 * changement de section et la fermeture de l'onglet déclenchent tous une
 * sauvegarde, et sans cette file le module s'infligerait ses propres conflits
 * de version.
 */

const DELAI_AUTOSAVE_MS = 1200;

export interface PvDocumentView {
  id: string;
  title: string;
  status: "draft" | "final" | "archived";
  documentDate: string;
  version: number;
  payload: AgMinutesPayload;
}

export function PvEditeur({
  document: initial,
  regles,
  adherents,
}: {
  document: PvDocumentView;
  regles: ReglesStatutaires;
  adherents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [payload, setPayload] = useState(initial.payload);
  const [titre, setTitre] = useState(initial.title);
  const [statut, setStatut] = useState(initial.status);
  const [enregistrement, setEnregistrement] = useState<"repos" | "encours" | "erreur">(
    "repos",
  );
  const [sectionActive, setSectionActive] = useState<AgSectionCle>(
    (initial.payload.redaction.derniereSection as AgSectionCle) || "seance",
  );
  const [confirmation, setConfirmation] = useState<null | "finaliser" | "rouvrir">(null);
  const [occupe, setOccupe] = useState(false);

  const version = useRef(initial.version);
  const enVol = useRef(false);
  const enAttente = useRef<{ payload: AgMinutesPayload; titre: string } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verrouille = statut !== "draft";

  /** Une seule requête en vol ; la suivante attend son tour et fusionne. */
  const envoyer = useCallback(
    async (corps: { payload: AgMinutesPayload; titre: string }) => {
      if (enVol.current) {
        enAttente.current = corps;
        return;
      }
      enVol.current = true;
      setEnregistrement("encours");
      try {
        const reponse = (await api(`/api/documents/${initial.id}`, {
          method: "PATCH",
          body: {
            title: corps.titre,
            payload: corps.payload,
            version: version.current,
          },
        })) as { document?: { version?: number } };
        if (typeof reponse?.document?.version === "number") {
          version.current = reponse.document.version;
        }
        setEnregistrement("repos");
      } catch (error) {
        setEnregistrement("erreur");
        toast((error as Error).message, "error");
      } finally {
        enVol.current = false;
        const suivant = enAttente.current;
        enAttente.current = null;
        if (suivant) void envoyer(suivant);
      }
    },
    [initial.id, toast],
  );

  const planifier = useCallback(
    (suite: AgMinutesPayload, titreSuite = titre) => {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(
        () => void envoyer({ payload: suite, titre: titreSuite }),
        DELAI_AUTOSAVE_MS,
      );
    },
    [envoyer, titre],
  );

  const majPayload = useCallback(
    (transformation: (p: AgMinutesPayload) => AgMinutesPayload) => {
      setPayload((precedent) => {
        const suite = transformation(precedent);
        planifier(suite);
        return suite;
      });
    },
    [planifier],
  );

  // Fermer l'onglet ne doit pas coûter les deux dernières minutes de saisie.
  useEffect(() => {
    function avantFermeture() {
      if (minuteur.current) {
        clearTimeout(minuteur.current);
        void envoyer({ payload, titre });
      }
    }
    window.addEventListener("pagehide", avantFermeture);
    return () => window.removeEventListener("pagehide", avantFermeture);
  }, [envoyer, payload, titre]);

  const controles = useMemo(() => controlerPv(payload, regles), [payload, regles]);
  const empechements = blocages(controles);

  async function finaliser() {
    setConfirmation(null);
    setOccupe(true);
    try {
      if (minuteur.current) clearTimeout(minuteur.current);
      await envoyer({ payload, titre });
      await api(`/api/documents/${initial.id}`, {
        method: "PATCH",
        body: { status: "final", version: version.current },
      });
      setStatut("final");
      toast("Procès-verbal finalisé.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setOccupe(false);
    }
  }

  async function rouvrir() {
    setConfirmation(null);
    setOccupe(true);
    try {
      const reponse = (await api(`/api/documents/${initial.id}`, {
        method: "PATCH",
        body: { status: "draft", version: version.current },
      })) as { document?: { version?: number } };
      if (typeof reponse?.document?.version === "number") {
        version.current = reponse.document.version;
      }
      setStatut("draft");
      toast("Procès-verbal rouvert en brouillon.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setOccupe(false);
    }
  }

  function allerA(cle: AgSectionCle) {
    setSectionActive(cle);
    majPayload((p) => ({ ...p, redaction: { ...p.redaction, derniereSection: cle } }));
    window.document.getElementById(`section-${cle}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link
          href="/dashboard/documents"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Tous les documents
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <EtatEnregistrement etat={enregistrement} verrouille={verrouille} />
          <a
            href={`/api/documents/${initial.id}?format=print`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Printer className="h-4 w-4" />
            Aperçu
          </a>
          {verrouille ? (
            <Button
              type="button"
              variant="outline"
              icon={Unlock}
              loading={occupe}
              onClick={() => setConfirmation("rouvrir")}
            >
              Rouvrir
            </Button>
          ) : (
            <Button
              type="button"
              icon={FileCheck2}
              loading={occupe}
              onClick={() => setConfirmation("finaliser")}
            >
              Finaliser
            </Button>
          )}
        </div>
      </div>

      {verrouille && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-sea-200 bg-sea-50 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-sea-800" aria-hidden="true" />
          <p className="text-sm font-semibold leading-6 text-sea-900">
            Ce procès-verbal est finalisé : c’est la version qu’on signe et qu’on
            diffuse. Pour le corriger, rouvrez-le en brouillon — le geste est
            tracé dans le journal.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Sommaire
          payload={payload}
          active={sectionActive}
          onAller={allerA}
        />

        <div
          className={cn(
            "min-w-0 space-y-5",
            verrouille && "pointer-events-none opacity-70",
          )}
        >
          <BlocNotes
            valeur={payload.redaction.notesBrutes}
            onChange={(notesBrutes) =>
              majPayload((p) => ({ ...p, redaction: { ...p.redaction, notesBrutes } }))
            }
          />

          <Sections
            payload={payload}
            titre={titre}
            regles={regles}
            adherents={adherents}
            onTitre={(t) => {
              setTitre(t);
              planifier(payload, t);
            }}
            onChange={majPayload}
          />

          <Controles controles={controles} onAller={allerA} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmation === "finaliser"}
        title={
          empechements.length
            ? "Des incohérences restent à corriger"
            : "Finaliser ce procès-verbal ?"
        }
        description={
          empechements.length
            ? `${empechements.map((c) => c.message).join(" ")} Corrigez-les avant de finaliser : elles se contredisent entre elles, personne ne peut les vouloir.`
            : "Le procès-verbal passera en version finale : il ne sera plus modifiable sans être rouvert, et le filigrane « projet » disparaîtra de l’impression. Vos notes de séance ne sont jamais imprimées."
        }
        confirmLabel={empechements.length ? "J’ai compris" : "Finaliser"}
        loading={occupe}
        onConfirm={empechements.length ? () => setConfirmation(null) : finaliser}
        onCancel={() => setConfirmation(null)}
      />
      <ConfirmDialog
        open={confirmation === "rouvrir"}
        title="Rouvrir ce procès-verbal ?"
        description="Il repassera en brouillon et redeviendra modifiable. Si une version signée circule déjà, pensez à la remplacer après correction."
        confirmLabel="Rouvrir en brouillon"
        loading={occupe}
        onConfirm={rouvrir}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  );
}

function EtatEnregistrement({
  etat,
  verrouille,
}: {
  etat: "repos" | "encours" | "erreur";
  verrouille: boolean;
}) {
  if (verrouille) return <Badge color="sea">Finalisé</Badge>;
  if (etat === "encours") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Enregistrement…
      </span>
    );
  }
  if (etat === "erreur") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-coral-700">
        <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Non enregistré
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
      <Check className="h-3.5 w-3.5 text-sea-700" aria-hidden="true" />
      Brouillon enregistré
    </span>
  );
}

function Sommaire({
  payload,
  active,
  onAller,
}: {
  payload: AgMinutesPayload;
  active: AgSectionCle;
  onAller: (c: AgSectionCle) => void;
}) {
  return (
    <nav
      aria-label="Sections du procès-verbal"
      className="min-w-0 lg:sticky lg:top-4 lg:self-start"
    >
      <ol className="flex flex-wrap gap-1.5 pb-1 lg:block lg:space-y-0.5 lg:pb-0">
        {AG_SECTIONS.map((section, index) => {
          const etat = completudeSection(payload, section.cle);
          const resume = resumeSection(payload, section.cle);
          const courante = active === section.cle;
          return (
            <li key={section.cle} className="min-w-0 lg:w-full">
              <button
                type="button"
                aria-current={courante ? "true" : undefined}
                onClick={() => onAller(section.cle)}
                className={cn(
                  "grid w-full min-h-11 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  courante ? "bg-brand-50 text-brand-900" : "hover:bg-slate-50",
                )}
              >
                <span className="mt-0.5 grid place-items-center" aria-hidden="true">
                  {etat === "complete" ? (
                    <Check className="h-4 w-4 text-sea-700" />
                  ) : etat === "entamee" ? (
                    <CircleDashed className="h-4 w-4 text-sand-700" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-sm font-bold">
                    <span className="lg:hidden">{index + 1}</span>
                    <span className="hidden lg:inline">
                      {index + 1}. {section.titre}
                    </span>
                    <span className="sr-only lg:hidden"> — {section.titre}</span>
                  </span>
                  <span className="sr-only">
                    {etat === "complete"
                      ? " — complète"
                      : etat === "entamee"
                        ? " — incomplète"
                        : " — vierge"}
                  </span>
                  {resume && (
                    <span className="mt-0.5 hidden truncate text-xs text-slate-500 lg:block">
                      {resume}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function BlocNotes({
  valeur,
  onChange,
}: {
  valeur: string;
  onChange: (v: string) => void;
}) {
  return (
    <details open={valeur.trim().length > 0} className="group">
      <summary className="flex cursor-pointer items-center gap-2 rounded-xl bg-sand-50 px-4 py-3 text-sm font-bold text-sand-900 ring-1 ring-sand-200 marker:content-none">
        <NotebookPen className="h-4 w-4 shrink-0" aria-hidden="true" />
        Mes notes de séance
        <span className="ml-auto text-xs font-semibold">
          {valeur.trim() ? "remplies" : "vides"}
        </span>
      </summary>
      <div className="mt-2 rounded-xl bg-sand-50 p-4 ring-1 ring-sand-200">
        <p className="mb-2 text-xs leading-5 text-sand-900">
          Collez ici ce que vous avez noté sur votre carnet ou votre téléphone.
          Ce texte ne sera jamais imprimé : il n’est là que pour vous aider à
          rédiger.
        </p>
        <Textarea
          rows={5}
          value={valeur}
          aria-label="Mes notes de séance"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </details>
  );
}

function Controles({
  controles,
  onAller,
}: {
  controles: ReturnType<typeof controlerPv>;
  onAller: (c: AgSectionCle) => void;
}) {
  if (controles.length === 0) {
    return (
      <Card className="flex items-start gap-3 border-sea-200 bg-sea-50 p-4">
        <Check className="mt-0.5 h-5 w-5 shrink-0 text-sea-800" aria-hidden="true" />
        <p className="text-sm font-semibold leading-6 text-sea-900">
          Rien à signaler : les mentions attendues sont présentes et les
          décomptes sont cohérents.
        </p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden" id="section-controles">
      <div className="border-b-2 border-slate-100 bg-slate-50/70 px-5 py-3.5">
        <h2 className="font-bold text-brand-950">
          Ce qu’il reste à vérifier ({controles.length})
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Des remarques, pas des refus : seules les contradictions internes
          empêchent de finaliser.
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {controles.map((controle) => (
          <li key={controle.cle} className="flex items-start gap-3 p-4">
            {controle.severite === "blocage" ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-coral-700" aria-hidden="true" />
            ) : (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-sand-700" aria-hidden="true" />
            )}
            <p className="min-w-0 flex-1 text-sm leading-6 text-slate-700">
              {controle.message}
            </p>
            <button
              type="button"
              onClick={() => onAller(controle.section as AgSectionCle)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Corriger
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Bloc({
  cle,
  index,
  titre,
  children,
}: {
  cle: AgSectionCle;
  index: number;
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={`section-${cle}`} className="scroll-mt-4 overflow-hidden">
      <div className="border-b-2 border-slate-100 bg-slate-50/70 px-5 py-3.5">
        <h2 className="font-bold text-brand-950">
          {index}. {titre}
        </h2>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </Card>
  );
}

function Sections({
  payload,
  titre,
  regles,
  adherents,
  onTitre,
  onChange,
}: {
  payload: AgMinutesPayload;
  titre: string;
  regles: ReglesStatutaires;
  adherents: { id: string; name: string }[];
  onTitre: (t: string) => void;
  onChange: (f: (p: AgMinutesPayload) => AgMinutesPayload) => void;
}) {
  const quorum = verdictQuorum(payload);
  const votants = votantsTotaux(payload);

  return (
    <>
      <Bloc cle="seance" index={1} titre="L’association et la séance">
        <ChampTexte label="Titre du document" valeur={titre} onChange={onTitre} />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampChoix
            label="Nature de l’assemblée"
            valeur={payload.natureAssemblee}
            onChange={(natureAssemblee) => onChange((p) => ({ ...p, natureAssemblee }))}
            options={[
              { valeur: "AGO", libelle: "Ordinaire" },
              { valeur: "AGE", libelle: "Extraordinaire" },
              { valeur: "mixte", libelle: "Ordinaire et extraordinaire" },
              { valeur: "constitutive", libelle: "Constitutive" },
            ]}
            aide="Modifier les statuts, transférer le siège ou dissoudre relève en principe d’une assemblée extraordinaire."
          />
          <ChampTexte
            label="Date de la séance"
            type="date"
            valeur={payload.seance.date ?? ""}
            onChange={(date) =>
              onChange((p) => ({ ...p, seance: { ...p.seance, date: date || null } }))
            }
            niveau="tiers"
          />
          <ChampTexte
            label="Heure d’ouverture"
            type="time"
            valeur={payload.seance.heureOuverture}
            onChange={(heureOuverture) =>
              onChange((p) => ({ ...p, seance: { ...p.seance, heureOuverture } }))
            }
          />
          <ChampTexte
            label="Heure de clôture"
            type="time"
            valeur={payload.seance.heureCloture}
            onChange={(heureCloture) =>
              onChange((p) => ({ ...p, seance: { ...p.seance, heureCloture } }))
            }
          />
        </div>
        <ChampTexte
          label="Lieu"
          valeur={payload.seance.lieu}
          onChange={(lieu) => onChange((p) => ({ ...p, seance: { ...p.seance, lieu } }))}
          placeholder="Salle polyvalente de l’école, 12 rue de l’École"
          niveau="tiers"
        />
        <ChampTexte
          label="Affiliation à la fédération APEL"
          valeur={payload.entete.affiliationApel}
          onChange={(affiliationApel) =>
            onChange((p) => ({ ...p, entete: { ...p.entete, affiliationApel } }))
          }
          placeholder="APEL du Finistère"
        />
        <details className="rounded-xl bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">
            Participation à distance, seconde convocation, statuts applicables
          </summary>
          <div className="mt-3 space-y-3">
            <ChampBoolean
              label="Participation à distance ouverte"
              valeur={payload.seance.distanciel.actif}
              onChange={(actif) =>
                onChange((p) => ({
                  ...p,
                  seance: { ...p.seance, distanciel: { ...p.seance.distanciel, actif } },
                }))
              }
              aide="Vérifiez que vos statuts la prévoient : à défaut, une délibération prise à distance peut être discutée."
            />
            {payload.seance.distanciel.actif && (
              <ChampTexte
                label="Outil et modalités"
                valeur={payload.seance.distanciel.outil}
                onChange={(outil) =>
                  onChange((p) => ({
                    ...p,
                    seance: { ...p.seance, distanciel: { ...p.seance.distanciel, outil } },
                  }))
                }
              />
            )}
            <ChampBoolean
              label="Assemblée réunie sur seconde convocation"
              valeur={payload.seance.secondeConvocation.actif}
              onChange={(actif) =>
                onChange((p) => ({
                  ...p,
                  seance: {
                    ...p.seance,
                    secondeConvocation: { ...p.seance.secondeConvocation, actif },
                  },
                }))
              }
            />
            {payload.seance.secondeConvocation.actif && (
              <ChampTexte
                label="Date de la première séance"
                type="date"
                valeur={payload.seance.secondeConvocation.premiereSeanceDate ?? ""}
                onChange={(d) =>
                  onChange((p) => ({
                    ...p,
                    seance: {
                      ...p.seance,
                      secondeConvocation: {
                        ...p.seance.secondeConvocation,
                        premiereSeanceDate: d || null,
                      },
                    },
                  }))
                }
              />
            )}
            <ChampTexte
              label="Date d’adoption des statuts applicables"
              type="date"
              valeur={payload.entete.statutsVersionDate ?? ""}
              onChange={(d) =>
                onChange((p) => ({
                  ...p,
                  entete: { ...p.entete, statutsVersionDate: d || null },
                }))
              }
            />
          </div>
        </details>
      </Bloc>

      <Bloc cle="convocation" index={2} titre="La convocation">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            label="Convocation adressée par"
            valeur={payload.convocation.auteur}
            onChange={(auteur) =>
              onChange((p) => ({ ...p, convocation: { ...p.convocation, auteur } }))
            }
            placeholder={regles.auteurConvocation || "Le président"}
            niveau="statutaire"
          />
          <ChampTexte
            label="Date d’envoi"
            type="date"
            valeur={payload.convocation.dateEnvoi ?? ""}
            onChange={(d) =>
              onChange((p) => ({
                ...p,
                convocation: { ...p.convocation, dateEnvoi: d || null },
              }))
            }
            aide={
              regles.delaiConvocationJours
                ? `Vos statuts prévoient un délai de ${regles.delaiConvocationJours} jours.`
                : "Le délai figure dans vos statuts."
            }
            niveau="statutaire"
          />
          <ChampTexte
            label="Mode d’envoi"
            valeur={payload.convocation.mode}
            onChange={(mode) =>
              onChange((p) => ({ ...p, convocation: { ...p.convocation, mode } }))
            }
            placeholder="courrier électronique et affichage à l’école"
          />
          <ChampNombre
            label="Nombre de destinataires"
            valeur={payload.convocation.nombreDestinataires}
            onChange={(nombreDestinataires) =>
              onChange((p) => ({
                ...p,
                convocation: { ...p.convocation, nombreDestinataires },
              }))
            }
          />
        </div>

        <div>
          <ListeTexte
            label="Ordre du jour, tel que convoqué"
            valeurs={payload.ordreDuJour.map((o) => o.intitule)}
            onChange={(intitules) =>
              onChange((p) => ({
                ...p,
                ordreDuJour: intitules.map((intitule, i) => ({
                  id: p.ordreDuJour[i]?.id ?? `odj-${i}-${intitule.length}`,
                  intitule,
                })),
              }))
            }
            ajouterLabel="Ajouter un point"
            placeholder="Approbation des comptes de l’exercice clos"
            numerotee
            niveau="tiers"
            aide="Une décision prise hors de l’ordre du jour est le premier reproche fait à une délibération contestée."
          />
          {payload.ordreDuJour.length === 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                onChange((p) => ({
                  ...p,
                  ordreDuJour: ORDRE_DU_JOUR_TYPE.map((intitule, i) => ({
                    id: `odj-type-${i}`,
                    intitule,
                  })),
                }))
              }
            >
              Reprendre l’ordre du jour type d’une AG ordinaire
            </Button>
          )}
        </div>

        <ChampTexte
          label="Incidents de convocation"
          valeur={payload.convocation.incidents}
          onChange={(incidents) =>
            onChange((p) => ({ ...p, convocation: { ...p.convocation, incidents } }))
          }
          lignes={2}
          aide="Retard, adresse erronée, réclamation d’un adhérent : le dire ici vaut mieux que de le taire."
        />
      </Bloc>

      <Bloc cle="bureau" index={3} titre="Qui présidait, qui était invité">
        <ChampPersonne
          label="Président de séance"
          valeur={payload.bureauSeance.president}
          onChange={(president) =>
            onChange((p) => ({ ...p, bureauSeance: { ...p.bureauSeance, president } }))
          }
          adherents={adherents}
          niveau="tiers"
          aide="C’est lui qui signe le procès-verbal."
        />
        <ChampPersonne
          label="Secrétaire de séance"
          valeur={payload.bureauSeance.secretaire}
          onChange={(secretaire) =>
            onChange((p) => ({ ...p, bureauSeance: { ...p.bureauSeance, secretaire } }))
          }
          adherents={adherents}
          niveau="tiers"
        />
        <ListePersonnes
          label="Scrutateurs"
          valeurs={payload.bureauSeance.scrutateurs}
          onChange={(scrutateurs) =>
            onChange((p) => ({ ...p, bureauSeance: { ...p.bureauSeance, scrutateurs } }))
          }
          adherents={adherents}
          ajouterLabel="Ajouter un scrutateur"
          aide="Usage emprunté au droit des sociétés : utile pour un scrutin disputé, jamais obligatoire ici."
        />
        <ListePersonnes
          label="Invités, sans voix délibérative"
          valeurs={payload.bureauSeance.invites}
          onChange={(invites) =>
            onChange((p) => ({ ...p, bureauSeance: { ...p.bureauSeance, invites } }))
          }
          adherents={adherents}
          ajouterLabel="Ajouter un invité"
          aide="Chef d’établissement, représentant de la fédération… Le procès-verbal précisera qu’ils ne comptent ni dans le quorum, ni dans les votes."
        />
      </Bloc>

      <Bloc cle="presences" index={4} titre="Qui était là, et combien de voix">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampChoix
            label="Règle de voix"
            valeur={payload.presences.regleVoix}
            onChange={(regleVoix) =>
              onChange((p) => ({ ...p, presences: { ...p.presences, regleVoix } }))
            }
            options={[
              { valeur: "non_precise", libelle: "Non précisée" },
              { valeur: "famille", libelle: "Une voix par famille adhérente" },
              { valeur: "personne", libelle: "Une voix par adhérent" },
            ]}
            niveau="statutaire"
          />
          <ChampTexte
            label="Adhérents arrêtés au"
            type="date"
            valeur={payload.presences.dateReference ?? ""}
            onChange={(d) =>
              onChange((p) => ({
                ...p,
                presences: { ...p.presences, dateReference: d || null },
              }))
            }
          />
          <ChampNombre
            label="Membres disposant du droit de vote"
            valeur={payload.presences.effectifVotants}
            onChange={(effectifVotants) =>
              onChange((p) => ({ ...p, presences: { ...p.presences, effectifVotants } }))
            }
          />
          <ChampNombre
            label="Pouvoirs écartés"
            valeur={payload.presences.pouvoirsEcartes}
            onChange={(pouvoirsEcartes) =>
              onChange((p) => ({ ...p, presences: { ...p.presences, pouvoirsEcartes } }))
            }
          />
          <ChampNombre
            label="Présents"
            valeur={payload.presences.presents}
            onChange={(presents) =>
              onChange((p) => ({ ...p, presences: { ...p.presences, presents } }))
            }
            niveau="tiers"
          />
          <ChampNombre
            label="Représentés par pouvoir"
            valeur={payload.presences.representes}
            onChange={(representes) =>
              onChange((p) => ({ ...p, presences: { ...p.presences, representes } }))
            }
          />
        </div>

        <ChampChoix
          label="Quorum prévu par vos statuts"
          valeur={payload.presences.quorum.type}
          onChange={(type) =>
            onChange((p) => ({
              ...p,
              presences: { ...p.presences, quorum: { ...p.presences.quorum, type } },
            }))
          }
          options={[
            { valeur: "inconnu", libelle: "Je ne sais pas — à lire dans nos statuts" },
            { valeur: "aucun", libelle: "Nos statuts ne prévoient aucun quorum" },
            { valeur: "fraction", libelle: "Une fraction des membres" },
            { valeur: "nombre", libelle: "Un nombre de membres" },
          ]}
          niveau="statutaire"
          aide="Sans cette règle, le procès-verbal n’affirmera rien sur le quorum — ce qui vaut mieux que d’affirmer au hasard."
        />
        {(payload.presences.quorum.type === "fraction" ||
          payload.presences.quorum.type === "nombre") && (
          <ChampNombre
            label={
              payload.presences.quorum.type === "fraction"
                ? "Dénominateur (4 pour « le quart »)"
                : "Nombre de membres exigé"
            }
            min={1}
            valeur={payload.presences.quorum.valeur ?? null}
            onChange={(valeur) =>
              onChange((p) => ({
                ...p,
                presences: { ...p.presences, quorum: { ...p.presences.quorum, valeur } },
              }))
            }
          />
        )}

        <p
          aria-live="polite"
          className={cn(
            "rounded-xl px-4 py-3 text-sm font-semibold leading-6",
            quorum.atteint === null
              ? "bg-slate-100 text-slate-600"
              : quorum.atteint
                ? "bg-sea-50 text-sea-900"
                : "bg-coral-50 text-coral-800",
          )}
        >
          {quorum.phrase ||
            (votants === null
              ? "Saisissez les présents et les représentés pour obtenir le total des voix."
              : `${votants} voix réunies. Le quorum ne sera pas mentionné, faute de règle connue.`)}
        </p>

        <ChampBoolean
          label="Feuille d’émargement annexée au procès-verbal"
          valeur={payload.presences.feuilleEmargementAnnexee}
          onChange={(feuilleEmargementAnnexee) =>
            onChange((p) => ({
              ...p,
              presences: { ...p.presences, feuilleEmargementAnnexee },
            }))
          }
          aide="L’annexer plutôt que d’y recopier les noms garde le procès-verbal diffusable."
        />
        <ChampTexte
          label="Incidents de séance"
          valeur={payload.presences.incidentsSeance}
          onChange={(incidentsSeance) =>
            onChange((p) => ({ ...p, presences: { ...p.presences, incidentsSeance } }))
          }
          lignes={2}
          aide="Arrivée en cours de séance, départ avant un vote, contestation : ce qui change un décompte se note."
        />
      </Bloc>

      <Bloc cle="rapports" index={5} titre="Les rapports et les comptes">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            label="Exercice ouvert le"
            type="date"
            valeur={payload.rapports.exercice.debut ?? ""}
            onChange={(d) =>
              onChange((p) => ({
                ...p,
                rapports: {
                  ...p.rapports,
                  exercice: { ...p.rapports.exercice, debut: d || null },
                },
              }))
            }
          />
          <ChampTexte
            label="Exercice clos le"
            type="date"
            valeur={payload.rapports.exercice.fin ?? ""}
            onChange={(d) =>
              onChange((p) => ({
                ...p,
                rapports: {
                  ...p.rapports,
                  exercice: { ...p.rapports.exercice, fin: d || null },
                },
              }))
            }
            aide={regles.clotureExercice ? `Vos statuts : ${regles.clotureExercice}.` : undefined}
          />
        </div>
        <ChampTexte
          label="Rapport moral et d’activité"
          valeur={payload.rapports.moral}
          onChange={(moral) =>
            onChange((p) => ({ ...p, rapports: { ...p.rapports, moral } }))
          }
          lignes={6}
          aide="Ce qui a été fait cette année. Quelques lignes suffisent : c’est la trace, pas un discours."
        />
        <ChampTexte
          label="Rapport financier"
          valeur={payload.rapports.financier.texte}
          onChange={(texte) =>
            onChange((p) => ({
              ...p,
              rapports: { ...p.rapports, financier: { ...p.rapports.financier, texte } },
            }))
          }
          lignes={4}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampMontant
            label="Total des produits"
            valeur={payload.rapports.financier.produitsCents}
            onChange={(produitsCents) =>
              onChange((p) => ({
                ...p,
                rapports: {
                  ...p.rapports,
                  financier: { ...p.rapports.financier, produitsCents },
                },
              }))
            }
          />
          <ChampMontant
            label="Total des charges"
            valeur={payload.rapports.financier.chargesCents}
            onChange={(chargesCents) =>
              onChange((p) => ({
                ...p,
                rapports: {
                  ...p.rapports,
                  financier: { ...p.rapports.financier, chargesCents },
                },
              }))
            }
          />
          <ChampMontant
            label="Résultat de l’exercice"
            valeur={payload.rapports.financier.resultatCents}
            onChange={(resultatCents) =>
              onChange((p) => ({
                ...p,
                rapports: {
                  ...p.rapports,
                  financier: { ...p.rapports.financier, resultatCents },
                },
              }))
            }
          />
          <ChampMontant
            label="Trésorerie à la clôture"
            valeur={payload.rapports.financier.tresorerieCents}
            onChange={(tresorerieCents) =>
              onChange((p) => ({
                ...p,
                rapports: {
                  ...p.rapports,
                  financier: { ...p.rapports.financier, tresorerieCents },
                },
              }))
            }
          />
        </div>
        <ChampTexte
          label="Vérificateur aux comptes"
          valeur={payload.rapports.verificateur}
          onChange={(verificateur) =>
            onChange((p) => ({ ...p, rapports: { ...p.rapports, verificateur } }))
          }
          lignes={2}
          aide="Si vos statuts en prévoient un, son avis se mentionne ici."
        />
      </Bloc>

      <Bloc cle="resolutions" index={6} titre="Les résolutions et les votes">
        <PvResolutions
          payload={payload}
          onChange={(resolutions) => onChange((p) => ({ ...p, resolutions }))}
        />
      </Bloc>

      <Bloc cle="instances" index={7} titre="Les élections et les instances">
        <ChampChoix
          label="Le bureau est élu par"
          valeur={payload.instances.bureauEluPar}
          onChange={(bureauEluPar) =>
            onChange((p) => ({ ...p, instances: { ...p.instances, bureauEluPar } }))
          }
          options={[
            { valeur: "non_precise", libelle: "Non précisé" },
            { valeur: "AG", libelle: "L’assemblée générale" },
            { valeur: "CA", libelle: "Le conseil d’administration" },
          ]}
          niveau="statutaire"
        />
        <ListePersonnes
          label="Composition des instances à l’issue de la séance"
          valeurs={payload.instances.compositionApres.map((m) => ({
            memberId: m.memberId,
            nom: m.nom,
            qualite: m.fonction,
          }))}
          onChange={(personnes) =>
            onChange((p) => ({
              ...p,
              instances: {
                ...p.instances,
                compositionApres: personnes.map((x) => ({
                  nom: x.nom,
                  fonction: x.qualite,
                  memberId: x.memberId,
                })),
              },
            }))
          }
          adherents={adherents}
          ajouterLabel="Ajouter un membre élu"
          aide="C’est cette liste que la préfecture attend pour enregistrer le changement de dirigeants."
        />
        <ChampTexte
          label="Durée et prise d’effet des mandats"
          valeur={payload.instances.dureeEtEffetMandats}
          onChange={(dureeEtEffetMandats) =>
            onChange((p) => ({ ...p, instances: { ...p.instances, dureeEtEffetMandats } }))
          }
          lignes={2}
          placeholder={
            regles.dureeMandatAnnees
              ? `Mandats de ${regles.dureeMandatAnnees} an(s), à effet immédiat.`
              : "Mandats à effet immédiat."
          }
          niveau="statutaire"
        />
        <ChampTexte
          label="Sièges vacants"
          valeur={payload.instances.siegesVacants}
          onChange={(siegesVacants) =>
            onChange((p) => ({ ...p, instances: { ...p.instances, siegesVacants } }))
          }
          lignes={2}
        />
        <details className="rounded-xl bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">
            Projets, manifestations et vie de l’association
          </summary>
          <div className="mt-3 space-y-3">
            <ChampTexte
              label="Projets et engagements de l’année à venir"
              valeur={payload.vieApel.engagements}
              onChange={(engagements) =>
                onChange((p) => ({ ...p, vieApel: { ...p.vieApel, engagements } }))
              }
              lignes={3}
            />
            <ChampTexte
              label="Manifestations prévues"
              valeur={payload.vieApel.manifestations}
              onChange={(manifestations) =>
                onChange((p) => ({ ...p, vieApel: { ...p.vieApel, manifestations } }))
              }
              lignes={3}
            />
            <ChampTexte
              label="Représentants aux instances de l’établissement"
              valeur={payload.vieApel.representants}
              onChange={(representants) =>
                onChange((p) => ({ ...p, vieApel: { ...p.vieApel, representants } }))
              }
              lignes={2}
            />
          </div>
        </details>
      </Bloc>

      <Bloc cle="cloture" index={8} titre="La clôture">
        <ChampTexte
          label="Questions diverses"
          valeur={payload.cloture.questionsDiverses}
          onChange={(questionsDiverses) =>
            onChange((p) => ({ ...p, cloture: { ...p.cloture, questionsDiverses } }))
          }
          lignes={4}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            label="Procès-verbal établi le"
            type="date"
            valeur={payload.cloture.dateRedaction ?? ""}
            onChange={(d) =>
              onChange((p) => ({
                ...p,
                cloture: { ...p.cloture, dateRedaction: d || null },
              }))
            }
            niveau="tiers"
          />
          <ChampTexte
            label="Prochaine assemblée envisagée le"
            type="date"
            valeur={payload.cloture.prochaineAG ?? ""}
            onChange={(d) =>
              onChange((p) => ({ ...p, cloture: { ...p.cloture, prochaineAG: d || null } }))
            }
          />
        </div>
        <ListePersonnes
          label="Signataires"
          valeurs={payload.cloture.signataires}
          onChange={(signataires) =>
            onChange((p) => ({ ...p, cloture: { ...p.cloture, signataires } }))
          }
          adherents={adherents}
          ajouterLabel="Ajouter un signataire"
          aide="Le président et le secrétaire de séance, en pratique. L’impression réserve une case pour chacun."
        />
        <ChampBoolean
          label="Porter la mention « certifié conforme »"
          valeur={payload.cloture.mentionCertifieConforme}
          onChange={(mentionCertifieConforme) =>
            onChange((p) => ({ ...p, cloture: { ...p.cloture, mentionCertifieConforme } }))
          }
          aide="Les banques la réclament souvent ; elle n’ajoute aucune valeur juridique au document."
        />
        <ListeTexte
          label="Annexes"
          valeurs={payload.cloture.annexes}
          onChange={(annexes) => onChange((p) => ({ ...p, cloture: { ...p.cloture, annexes } }))}
          ajouterLabel="Ajouter une annexe"
          placeholder="Feuille d’émargement, comptes de l’exercice…"
        />
      </Bloc>

      <Bloc cle="suites" index={9} titre="Suites, diffusion et archivage">
        <ChampTexte
          label="Déclaration en préfecture à faire avant le"
          type="date"
          valeur={payload.formalites.echeanceDeclaration ?? ""}
          onChange={(d) =>
            onChange((p) => ({
              ...p,
              formalites: { ...p.formalites, echeanceDeclaration: d || null },
            }))
          }
          niveau="legal"
          aide="Changement de dirigeants ou de statuts : trois mois, article 5 de la loi du 1ᵉʳ juillet 1901. C’est la seule obligation légale née de cette séance."
        />
        <ChampTexte
          label="Pouvoirs bancaires"
          valeur={payload.formalites.pouvoirsBancaires}
          onChange={(pouvoirsBancaires) =>
            onChange((p) => ({ ...p, formalites: { ...p.formalites, pouvoirsBancaires } }))
          }
          lignes={2}
        />
        <ChampTexte
          label="Mandataire chargé des formalités"
          valeur={payload.formalites.mandataireFormalites}
          onChange={(mandataireFormalites) =>
            onChange((p) => ({
              ...p,
              formalites: { ...p.formalites, mandataireFormalites },
            }))
          }
          lignes={2}
        />
        <ChampTexte
          label="Transmission à la fédération APEL"
          valeur={payload.formalites.transmissionFederation}
          onChange={(transmissionFederation) =>
            onChange((p) => ({
              ...p,
              formalites: { ...p.formalites, transmissionFederation },
            }))
          }
          lignes={2}
        />
        <ChampBoolean
          label="J’ai vérifié qu’aucune donnée sensible ne figure au procès-verbal"
          valeur={payload.diffusion.controleDonneesSensibles}
          onChange={(controleDonneesSensibles) =>
            onChange((p) => ({
              ...p,
              diffusion: { ...p.diffusion, controleDonneesSensibles },
            }))
          }
          aide="Santé, situation familiale, difficultés d’un élève : rien de tout cela n’a sa place dans un document qui circule."
        />
        <ChampTexte
          label="À qui le procès-verbal sera-t-il diffusé ?"
          valeur={payload.diffusion.perimetre}
          onChange={(perimetre) =>
            onChange((p) => ({ ...p, diffusion: { ...p.diffusion, perimetre } }))
          }
          placeholder="Adhérents à jour de cotisation, chef d’établissement, fédération"
        />
      </Bloc>
    </>
  );
}

/** Saisie en euros, stockée en centimes : pas d'arrondi surprise. */
function ChampMontant({
  label,
  valeur,
  onChange,
}: {
  label: string;
  valeur: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <ChampNombre
      label={`${label} (€)`}
      valeur={valeur === null ? null : Math.round(valeur / 100)}
      onChange={(euros) => onChange(euros === null ? null : Math.round(euros * 100))}
      min={-1_000_000}
    />
  );
}
