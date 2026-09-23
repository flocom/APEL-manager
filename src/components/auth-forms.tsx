"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonClasses, Input, Label } from "@/components/ui";
import { DEFAULT_NEXT_PATH, withNextPath } from "@/lib/auth/return-path";
import { api } from "@/lib/client";
import { useRecaptcha } from "@/lib/use-recaptcha";
import { cn } from "@/lib/utils";

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

/**
 * La destination, ancre comprise.
 *
 * Le navigateur conserve l'ancre (`#…`) du lien d'origine à travers la
 * redirection vers /login, mais le serveur ne la voit jamais : elle ne peut
 * donc pas voyager dans `next`. On la reprend ici, dans l'adresse de la page
 * de connexion, pour que le lien d'un e-mail retombe sur l'élément visé et pas
 * seulement en haut de sa page.
 */
function withHash(next: string) {
  if (next.includes("#")) return next;
  return `${next}${window.location.hash}`;
}

export function LoginForm({ next = DEFAULT_NEXT_PATH }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/login", {
        body: {
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      router.push(withHash(next));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ErrorMessage message={error} />
      <div>
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label htmlFor="password" className="mb-0">
            Mot de passe
          </Label>
          <Link href={withNextPath("/forgot", next)} className="text-xs font-medium text-brand-600 hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Se connecter
      </Button>
      <p className="text-center text-sm text-slate-500">
        Pas encore de compte ?{" "}
        <Link href={withNextPath("/register", next)} className="font-medium text-brand-600 hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}

/**
 * Formulaire d'inscription.
 *
 * `demande` : l'installation a déjà des comptes. Le formulaire ne demande alors
 * ni mot de passe ni rien d'autre que le nom et l'adresse — le mot de passe se
 * choisit en ouvrant le lien reçu par e-mail. Sur une installation neuve, il
 * crée le compte administrateur, qui entre tout de suite.
 *
 * Comme les autres formulaires publics, il porte un champ piège et, quand
 * l'association l'a activé, un jeton reCAPTCHA : chaque demande fait partir
 * un e-mail au nom de l'association.
 */
export function RegisterForm({
  demande = true,
  recaptchaSiteKey = null,
  next = DEFAULT_NEXT_PATH,
}: {
  demande?: boolean;
  recaptchaSiteKey?: string | null;
  /** La page à rejoindre une fois le tout premier compte créé. */
  next?: string;
}) {
  const router = useRouter();
  const executerRecaptcha = useRecaptcha(recaptchaSiteKey);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transmise, setTransmise] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const { pending } = await api<{ ok: true; pending: boolean }>(
        "/api/auth/register",
        {
          body: {
            name: form.get("name"),
            email: form.get("email"),
            ...(demande ? {} : { password: form.get("password") }),
            website: form.get("website"),
            recaptchaToken: await executerRecaptcha("compte"),
          },
        },
      );
      // Seul le tout premier compte entre directement : il est administrateur.
      if (!pending) {
        router.push(next);
        router.refresh();
        return;
      }
      setTransmise(true);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  // Le même message, que l'adresse soit nouvelle ou déjà connue : le serveur
  // ne dit pas laquelle, et l'écran ne doit pas le deviner à sa place. C'est
  // l'e-mail, reçu par le seul titulaire de l'adresse, qui fait la différence.
  // D'où le lien « Mot de passe oublié » : c'est ici qu'arrive qui avait oublié
  // avoir déjà un compte.
  if (transmise) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="rounded-xl border-2 border-sea-200 bg-sea-50 px-4 py-3.5 text-sm leading-6 text-sea-900"
        >
          <p className="font-bold">Vérifiez votre boîte e-mail.</p>
          <p className="mt-1">
            Un message vient de partir vers l’adresse saisie. Ouvrez le lien
            qu’il contient pour confirmer votre demande et choisir votre mot de
            passe. Un administrateur de l’association validera ensuite votre
            compte.
          </p>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Rien reçu d’ici quelques minutes ? Regardez dans les courriers
          indésirables. Si cette adresse a déjà un compte, le message vous le
          rappelle : connectez-vous directement.
        </p>
        <Link
          href={withNextPath("/login", next)}
          className={cn(buttonClasses("primary"), "min-h-12 w-full")}
        >
          Aller à la connexion
        </Link>
        <p className="text-center text-sm">
          <Link
            href="/forgot"
            className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ErrorMessage message={error} />
      <div>
        <Label htmlFor="name">Nom complet</Label>
        <Input id="name" name="name" type="text" required autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
        {demande && (
          <p className="mt-1 text-xs text-slate-500">
            Un lien de confirmation y sera envoyé&nbsp;: vous choisirez votre
            mot de passe en l’ouvrant.
          </p>
        )}
      </div>
      {!demande && (
        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-slate-500">8 caractères minimum.</p>
        </div>
      )}
      {/* Piège à robots : invisible, doit rester vide. */}
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label>
          Ne pas remplir
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Button type="submit" disabled={loading} className="min-h-12 w-full">
        {loading
          ? "Envoi…"
          : demande
            ? "Envoyer ma demande"
            : "Créer mon compte"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Déjà inscrit ?{" "}
        <Link href={withNextPath("/login", next)} className="font-medium text-brand-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

/**
 * Confirmation d'une demande de compte, ouverte depuis le lien reçu par
 * e-mail. Le nom saisi à la demande est repris et reste modifiable : c'est
 * celui que verra le bureau, et le titulaire de l'adresse est le mieux placé
 * pour le relire.
 */
export function ConfirmAccountForm({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/register/confirm", {
        body: {
          token,
          name: form.get("name"),
          password: form.get("password"),
        },
      });
      router.push("/compte-en-attente");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ErrorMessage message={error} />
      <div>
        {/* Du texte, pas un champ en lecture seule : un champ coupe une longue
            adresse au bord d'un écran de téléphone, le texte passe à la ligne.
            Le champ caché reste là pour le gestionnaire de mots de passe, qui
            associe ainsi le mot de passe choisi à la bonne adresse. */}
        <p className="mb-1.5 text-sm font-semibold text-slate-700">
          Adresse e-mail
        </p>
        <p className="rounded-lg border-2 border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 [overflow-wrap:anywhere] sm:text-sm">
          {email}
        </p>
        <input
          type="email"
          name="username"
          value={email}
          readOnly
          hidden
          autoComplete="username"
        />
      </div>
      <div>
        <Label htmlFor="name">Nom complet</Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={name}
          autoComplete="name"
        />
        <p className="mt-1 text-xs text-slate-500">
          C’est sous ce nom que le bureau verra votre demande.
        </p>
      </div>
      <div>
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-slate-500">8 caractères minimum.</p>
      </div>
      <Button type="submit" loading={loading} className="min-h-12 w-full">
        Confirmer ma demande
      </Button>
    </form>
  );
}

export function ForgotForm({ next = DEFAULT_NEXT_PATH }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/forgot", { body: { email: form.get("email") } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
        Si un compte existe avec cette adresse, un e-mail de réinitialisation
        vient d’être envoyé. Pensez à vérifier vos spams.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ErrorMessage message={error} />
      <div>
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Envoyer le lien
      </Button>
      <p className="text-center text-sm text-slate-500">
        <Link href={withNextPath("/login", next)} className="font-medium text-brand-600 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/reset", {
        body: { token, password: form.get("password") },
      });
      router.push("/login?reset=1");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ErrorMessage message={error} />
      <div>
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-slate-500">8 caractères minimum.</p>
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Réinitialiser le mot de passe
      </Button>
    </form>
  );
}
