import {
  BellRing,
  Compass,
  KeyRound,
  type LucideIcon,
  Settings,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { AccountForm } from "@/components/account-form";
import { LogoutEverywhereButton } from "@/components/logout-everywhere-button";
import { PasswordChangeForm } from "@/components/password-change-form";
import { PushToggle } from "@/components/push-toggle";
import { ReplayTourButton } from "@/components/replay-tour-button";
import { SettingsNav, type SettingsNavItem } from "@/components/settings-nav";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ROLE_LABELS, requireUser } from "@/lib/auth/rbac";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { SETTINGS_SECTION_CLASS } from "@/lib/settings-sections";

export const dynamic = "force-dynamic";

/** Deux lettres pour l'avatar : « Valentin Halgand » → « VH ». */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  const lettres =
    mots.length > 1
      ? mots[0][0] + mots[mots.length - 1][0]
      : (mots[0] ?? "?").slice(0, 2);
  return lettres.toLocaleUpperCase("fr-FR");
}

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className={SETTINGS_SECTION_CLASS}
    >
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-800">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-titre`} className="text-lg font-bold text-brand-950">
              {title}
            </h2>
            <p className="mt-0.5 text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
        </div>
        {children}
      </Card>
    </section>
  );
}

export default async function AccountPage() {
  const [user, settings] = await Promise.all([
    requireUser(),
    getAssociationSettings(),
  ]);

  const sommaire: SettingsNavItem[] = [
    { id: "profil", label: "Profil" },
    {
      id: "notifications",
      label: "Notifications",
      ...(user.pushEnabled
        ? { status: "ok", statusLabel: "Notifications activées" }
        : { status: "off", statusLabel: "Notifications désactivées" }),
    },
    { id: "securite", label: "Sécurité" },
    { id: "aide", label: "Aide" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Mon compte"
        description="Vos informations, vos notifications et la sécurité de votre accès."
        icon={Settings}
      />

      {/* Qui est connecté : la première chose qu'on vient vérifier ici. */}
      <Card className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-950 text-lg font-bold text-white"
          aria-hidden="true"
        >
          {initiales(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-lg font-bold text-brand-950">
            {user.name}
          </p>
          <p className="break-all text-sm text-slate-500">{user.email}</p>
          <Badge className="mt-2">{ROLE_LABELS[user.role]}</Badge>
        </div>
        {user.role === "admin" && (
          <Link
            href="/dashboard/settings"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-slate-200 px-3.5 py-2 text-sm font-semibold text-brand-900 transition-colors hover:border-brand-300 hover:bg-brand-50 sm:w-auto"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Configuration de l’association
          </Link>
        )}
      </Card>

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <SettingsNav items={sommaire} label="Sections de mon compte" />

        <div className="mt-5 min-w-0 space-y-6 lg:mt-0">
          <Section
            id="profil"
            icon={UserRound}
            title="Profil"
            description="Votre nom tel que les autres membres le voient."
          >
            <AccountForm
              name={user.name}
              telegramChatId={user.telegramChatId}
              telegramReady={settings.telegramReady}
              telegramBotUsername={settings.telegramBotUsername}
            />
          </Section>

          <Section
            id="notifications"
            icon={BellRing}
            title="Notifications sur appareil"
            description="Les messages de l’association arrivent sur votre téléphone ou votre ordinateur, même quand le site est fermé."
          >
            <PushToggle enabled={user.pushEnabled} />
          </Section>

          <Section
            id="securite"
            icon={KeyRound}
            title="Sécurité"
            description="Votre mot de passe et les appareils connectés à votre compte."
          >
            <PasswordChangeForm />
            <div className="mt-6 border-t-2 border-slate-100 pt-6">
              <h3 className="text-base font-bold text-brand-950">
                Sessions ouvertes
              </h3>
              <p className="mb-4 mt-1 text-sm leading-6 text-slate-500">
                Resté connecté sur un ordinateur partagé, ou un téléphone
                perdu ? Fermez d’un coup toutes vos sessions, celle-ci
                comprise.
              </p>
              <LogoutEverywhereButton />
            </div>
          </Section>

          <Section
            id="aide"
            icon={Compass}
            title="Découverte"
            description="Le petit guide qui présente chaque page du tableau de bord, une bulle à la fois."
          >
            <ReplayTourButton />
          </Section>
        </div>
      </div>
    </div>
  );
}
