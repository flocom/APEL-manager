"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/client";
import { useRecaptcha } from "@/lib/use-recaptcha";
import { JOIN_INTENTIONS, type JoinIntention } from "@/lib/validation";

/**
 * Le formulaire public de « Rejoindre l'association ».
 *
 * Il commence par demander ce qui amène le visiteur, et c'est tout l'objet de
 * la refonte : la page confondait deux démarches indépendantes — devenir membre
 * et venir donner un coup de main un samedi. Un parent venu adhérer ne trouvait
 * nulle part le mot « adhérer », et le bureau recevait des demandes d'adhésion
 * rédigées comme des propositions de bénévolat.
 *
 * Les options sont lues, pas repliées dans une liste déroulante : c'est ce
 * menu-là qui apprend l'adhésion à qui ne la soupçonnait pas. Aucune n'est
 * cochée d'avance, et `required` fait le reste — la validation native suffit,
 * comme pour les autres champs.
 */

const INTENTIONS: {
  valeur: JoinIntention;
  titre: string;
  aide: string;
}[] = [
  {
    valeur: "adherer",
    titre: "Je souhaite adhérer à l’association",
    aide: "Devenir membre pour cette année scolaire.",
  },
  {
    valeur: "coup_de_main",
    titre: "Je peux donner un coup de main",
    aide: "Venir sur un rendez-vous, sans adhérer.",
  },
  {
    valeur: "les_deux",
    titre: "Les deux",
    aide: "Adhérer, et venir quand il manque des bras.",
  },
  {
    valeur: "question",
    titre: "J’ai une question",
    aide: "Sur l’association, l’adhésion, un rendez-vous.",
  },
];

/**
 * Les deux portes de la page mènent ici. Le pré-cochage écoute le clic autant
 * que le hash : re-cliquer sur l'ancre déjà atteinte n'émet aucun
 * `hashchange`, et c'est exactement le parcours du parent qui redescend,
 * change d'avis, puis remonte cliquer « Je veux adhérer ».
 */
const PAR_ANCRE: Record<string, JoinIntention> = {
  "#adherer": "adherer",
  "#coup-de-main": "coup_de_main",
};

const AMORCES: Record<JoinIntention, string[]> = {
  adherer: [
    "Je souhaite adhérer à l’association : quelle est la marche à suivre ?",
    "Est-ce que ma famille est déjà adhérente pour cette année scolaire ?",
    "Je voudrais adhérer, mais je n’ai pas de temps à donner cette année — est-ce que c’est possible ?",
  ],
  coup_de_main: [
    "Je peux donner un coup de main sur un rendez-vous, prévenez-moi.",
    "Comptez sur moi au prochain rendez-vous.",
  ],
  les_deux: [
    "Je souhaite adhérer, et je peux venir donner un coup de main quand il manque des bras.",
  ],
  question: [
    "J’aimerais comprendre ce que fait l’association avant de m’engager.",
  ],
};

const PLACEHOLDERS: Record<JoinIntention, string> = {
  adherer:
    "Le prénom de votre enfant, sa classe, et votre question s’il y en a une…",
  coup_de_main: "Ce que vous pouvez faire, les moments où vous êtes libre…",
  les_deux: "Le prénom de votre enfant, sa classe, et vos disponibilités…",
  question: "Ce que vous aimeriez savoir…",
};

const LIBELLES_ENVOI: Record<JoinIntention, string> = {
  adherer: "Envoyer ma demande d’adhésion",
  coup_de_main: "Envoyer ma proposition",
  les_deux: "Envoyer ma demande",
  question: "Envoyer ma question",
};

export function JoinForm({
  contactEmail,
  recaptchaSiteKey = null,
  whatsappGroupUrl = null,
  cotisationPubliee = false,
}: {
  contactEmail: string | null;
  recaptchaSiteKey?: string | null;
  /** Proposé pendant l'attente de la réponse : on suit sans avoir écrit. */
  whatsappGroupUrl?: string | null;
  /**
   * Le montant figure déjà sur la page : promettre de l'annoncer par e-mail
   * ferait passer l'association pour distraite.
   */
  cotisationPubliee?: boolean;
}) {
  const executerRecaptcha = useRecaptcha(recaptchaSiteKey);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<JoinIntention | "inconnue" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intention, setIntention] = useState<JoinIntention | null>(null);
  const [message, setMessage] = useState("");
  const groupe = useRef<HTMLFieldSetElement>(null);

  // Une porte vient d'être empruntée : on coche à la place du parent, et on
  // amène le focus sur l'option retenue pour qui navigue au clavier. Le
  // défilement reste au navigateur ; les deux ne se battent pas.
  //
  // Le focus attend l'image suivante à dessein : suivre un lien de fragment
  // déplace le focus sur la cible, et cela se produit APRÈS le gestionnaire de
  // clic. Focaliser tout de suite, c'est se faire écraser une ligne plus loin.
  const emprunter = useCallback((choix: JoinIntention, focaliser: boolean) => {
    setIntention(choix);
    if (!focaliser) return;
    requestAnimationFrame(() => {
      groupe.current
        ?.querySelector<HTMLInputElement>(`input[value="${choix}"]`)
        ?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    const depuisHash = (focaliser: boolean) => {
      const choix = PAR_ANCRE[window.location.hash];
      if (choix) emprunter(choix, focaliser);
    };
    depuisHash(false);

    const surHash = () => depuisHash(true);
    const surClic = (event: MouseEvent) => {
      const lien = (event.target as Element | null)?.closest?.("a[href]");
      const href = lien?.getAttribute("href");
      if (href && PAR_ANCRE[href]) emprunter(PAR_ANCRE[href], true);
    };

    window.addEventListener("hashchange", surHash);
    document.addEventListener("click", surClic);
    return () => {
      window.removeEventListener("hashchange", surHash);
      document.removeEventListener("click", surClic);
    };
  }, [emprunter]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const choisie = form.get("intention");
    try {
      await api("/api/join", {
        body: {
          intention:
            typeof choisie === "string" &&
            (JOIN_INTENTIONS as readonly string[]).includes(choisie)
              ? choisie
              : undefined,
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone") || undefined,
          message: form.get("message"),
          consent: form.get("consent") === "on",
          website: form.get("website"),
          recaptchaToken: await executerRecaptcha("contact"),
        },
      });
      setSent(intention ?? "inconnue");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    const adhesion = sent === "adherer" || sent === "les_deux";
    return (
      <div className="rounded-2xl border-2 border-sea-300 bg-sea-50 p-6">
        <p className="text-lg font-black tracking-[-0.02em] text-brand-950">
          {adhesion
            ? "Demande d’adhésion envoyée, merci !"
            : "Message envoyé, merci !"}
        </p>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-700">
          {adhesion
            ? cotisationPubliee
              ? "Un parent du bureau vous répond par e-mail avec la marche à suivre pour régler la cotisation."
              : "Un parent du bureau vous répond par e-mail avec le montant de la cotisation pour cette année scolaire et la marche à suivre pour régler."
            : "Un parent de l’équipe vous répondra par e-mail."}{" "}
          Comptez quelques jours ; sans nouvelles, n’hésitez pas à relancer
          {contactEmail ? (
            <>
              {" "}
              à{" "}
              <a
                className="font-bold text-brand-800 underline"
                href={`mailto:${contactEmail}`}
              >
                {contactEmail}
              </a>
            </>
          ) : null}
          .
        </p>
        {sent === "coup_de_main" && (
          <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
            En attendant, vous pouvez déjà voir les créneaux ouverts :{" "}
            <a className="font-bold text-brand-800 underline" href="#agenda">
              les prochains rendez-vous
            </a>
            .
          </p>
        )}
        {whatsappGroupUrl && (
          <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
            En attendant notre réponse, vous pouvez déjà suivre ce qui se
            prépare :{" "}
            <a
              className="font-bold text-brand-800 underline"
              href={whatsappGroupUrl}
              target="_blank"
              rel="noreferrer"
            >
              le groupe WhatsApp de l’association
              <span className="sr-only"> (ouvre WhatsApp dans un nouvel onglet)</span>
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  const amorces = intention ? AMORCES[intention] : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <p className="rounded-xl bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-800">
          {error}
        </p>
      )}

      <fieldset
        ref={groupe}
        className="rounded-2xl border-2 border-slate-200 p-4"
      >
        <legend className="px-2 text-sm font-extrabold text-brand-950">
          Vous nous écrivez pour…
        </legend>
        <div className="mt-1 grid gap-2">
          {INTENTIONS.map(({ valeur, titre, aide }) => (
            <label
              key={valeur}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 transition-colors hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-200"
            >
              <input
                type="radio"
                name="intention"
                value={valeur}
                required
                checked={intention === valeur}
                onChange={() => setIntention(valeur)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#0873ab]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-brand-950">
                  {titre}
                </span>
                <span className="mt-0.5 block text-sm font-medium leading-6 text-slate-600">
                  {aide}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-slate-700">
            Votre nom
          </span>
          <input
            name="name"
            required
            minLength={2}
            autoComplete="name"
            className="min-h-11 w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
            placeholder="Prénom et nom"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-slate-700">
            Votre e-mail
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="min-h-11 w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
            placeholder="prenom.nom@example.fr"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-slate-700">
          Votre téléphone (facultatif)
        </span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          className="min-h-11 w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
          placeholder="06 12 34 56 78"
        />
      </label>

      {amorces && (
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="text-sm font-extrabold text-brand-950">
            Vous pouvez recopier une de ces phrases
          </p>
          <ul className="mt-3 space-y-2">
            {amorces.map((amorce) => (
              <li key={amorce}>
                <button
                  type="button"
                  onClick={() => setMessage(amorce)}
                  className="flex w-full gap-2.5 rounded-lg px-1 py-1 text-left text-sm font-medium leading-6 text-slate-700 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600"
                  />
                  «&nbsp;{amorce}&nbsp;»
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-slate-700">
          Votre message
          <span className="ml-2 font-medium text-slate-500">
            Deux lignes suffisent.
          </span>
        </span>
        <textarea
          name="message"
          required
          minLength={10}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-medium leading-6 text-slate-900 focus:border-brand-600 focus:outline-none"
          placeholder={PLACEHOLDERS[intention ?? "question"]}
        />
      </label>

      {/* Piège à robots : invisible, doit rester vide. */}
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label>
          Ne pas remplir
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-slate-300 accent-[#0873ab]"
        />
        <span className="text-sm font-medium leading-6 text-slate-600">
          J’accepte que mes coordonnées soient utilisées pour me répondre,
          conformément à la{" "}
          <Link
            href="/confidentialite"
            className="font-bold text-brand-800 underline"
          >
            politique de confidentialité
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-950 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {loading
          ? "Envoi…"
          : intention
            ? LIBELLES_ENVOI[intention]
            : "Envoyer le message"}
      </button>
    </form>
  );
}
