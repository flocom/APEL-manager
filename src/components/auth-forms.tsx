"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Input, Label } from "@/components/ui";
import { api } from "@/lib/client";

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function LoginForm() {
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
      router.push("/dashboard");
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
          <Link href="/forgot" className="text-xs font-medium text-brand-600 hover:underline">
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
        <Link href="/register" className="font-medium text-brand-600 hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/register", {
        body: {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      router.push("/dashboard");
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
        <Label htmlFor="name">Nom complet</Label>
        <Input id="name" name="name" type="text" required autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
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
        <p className="mt-1 text-xs text-slate-400">8 caractères minimum.</p>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Création…" : "Créer mon compte"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
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
        vient d'être envoyé. Pensez à vérifier vos spams.
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
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
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
