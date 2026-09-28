"use client";

import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Check,
  ImagePlus,
  KeyRound,
  Mic,
  Music,
  Palette,
  RotateCcw,
  Save,
  Trash2,
  UserPlus,
  Users,
  Wand2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import {
  defaultSceneTexts,
  resolvedScene,
  SCENE_LABELS,
  voiceIsCurrent,
  voiceNeedsRefresh,
  type ClassVideoContent,
  type ClassVideoSceneContent,
  type ClassVideoSource,
} from "@/lib/communication/class-video";
import {
  DEFAULT_INTEGRATED_VOICE,
  INTEGRATED_ENGINES,
  INTEGRATED_VOICES,
  isIntegratedVoice,
  type IntegratedEngine,
} from "@/lib/communication/voices";
import { cn } from "@/lib/utils";
import {
  CLASS_VIDEO_SCENE_IDS,
  type ClassVideoSceneId,
} from "@/remotion/class-video/types";

import { audioDuration, uploadMedia } from "./media-upload";
import { VoiceRecorder } from "./voice-recorder";

/**
 * Remotion (lecteur et export) ne vit que dans le navigateur : il manipule le
 * DOM, des canvas et WebCodecs. Le chargement différé évite aussi d'alourdir
 * le reste de l'espace de travail de plusieurs centaines de kilo-octets.
 */
const ClassVideoPreview = dynamic(
  () => import("./class-video-preview").then((m) => m.ClassVideoPreview),
  {
    ssr: false,
    loading: () => (
      <div className="grid aspect-video place-items-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-500">
        Chargement de l’aperçu…
      </div>
    ),
  },
);

export type TtsSettingsView = {
  provider: "piper" | "openai" | "elevenlabs";
  keyConfigured: boolean;
  keyLastFour: string | null;
  voice: string | null;
  integratedAvailable: boolean;
  integratedEngines: Record<IntegratedEngine, boolean>;
  voiceKey: string;
  ready: boolean;
};

const OPENAI_VOICES: { id: string; label: string }[] = [
  { id: "coral", label: "Coral — chaleureuse (recommandée)" },
  { id: "nova", label: "Nova — enjouée" },
  { id: "shimmer", label: "Shimmer — douce" },
  { id: "sage", label: "Sage — posée" },
  { id: "ballad", label: "Ballad — conteuse" },
  { id: "alloy", label: "Alloy — neutre" },
  { id: "ash", label: "Ash — grave" },
  { id: "echo", label: "Echo — masculine" },
  { id: "verse", label: "Verse — expressive" },
];

function SectionTitle({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Palette;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        {children && <p className="mt-0.5 text-sm leading-6 text-slate-500">{children}</p>}
      </div>
    </div>
  );
}

function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function ClassVideoEditor({
  initialContent,
  source,
  initialTts,
}: {
  initialContent: ClassVideoContent;
  source: ClassVideoSource;
  initialTts: TtsSettingsView;
}) {
  const toast = useToast();
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(() => JSON.stringify(initialContent));
  const [saving, setSaving] = useState(false);
  const [tts, setTts] = useState(initialTts);
  const [voiceBusy, setVoiceBusy] = useState<ClassVideoSceneId | "all" | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const benefitInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(content) !== saved;
  const defaults = useMemo(() => defaultSceneTexts(source), [source]);

  async function persist(next: ClassVideoContent, message?: string) {
    setSaving(true);
    try {
      await api("/api/communication/video", { method: "PUT", body: next });
      setSaved(JSON.stringify(next));
      if (message) toast(message);
    } catch (error) {
      toast((error as Error).message, "error");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  function scene(id: ClassVideoSceneId): ClassVideoSceneContent {
    return resolvedScene(id, content, source);
  }

  function updateScene(id: ClassVideoSceneId, patch: Partial<ClassVideoSceneContent>) {
    setContent((current) => ({
      ...current,
      scenes: {
        ...current.scenes,
        [id]: { ...resolvedScene(id, current, source), ...patch },
      },
    }));
  }

  function resetScene(id: ClassVideoSceneId) {
    setContent((current) => {
      const scenes = { ...current.scenes };
      delete scenes[id];
      return { ...current, scenes };
    });
  }

  /** Génère la voix d'une scène, puis enregistre : le fichier est alors référencé. */
  async function generateVoice(id: ClassVideoSceneId, base: ClassVideoContent) {
    const current = resolvedScene(id, base, source);
    const text = current.voiceText.trim();
    if (!text) return base;
    const { url, voiceKey } = await api<{ url: string; voiceKey: string }>(
      "/api/communication/video/voice",
      { body: { text } },
    );
    const durationInSeconds = await audioDuration(url);
    return {
      ...base,
      scenes: {
        ...base.scenes,
        [id]: {
          ...current,
          voice: {
            url,
            durationInSeconds,
            text: current.voiceText,
            source: "synthese" as const,
            voiceKey,
          },
        },
      },
    };
  }

  /** Garde la voix enregistrée par un parent pour une scène, puis enregistre. */
  async function keepRecording(id: ClassVideoSceneId, file: File) {
    setVoiceBusy(id);
    try {
      const url = await uploadMedia(file);
      const durationInSeconds = await audioDuration(url);
      const current = resolvedScene(id, content, source);
      const next: ClassVideoContent = {
        ...content,
        scenes: {
          ...content.scenes,
          [id]: {
            ...current,
            voice: {
              url,
              durationInSeconds,
              text: current.voiceText,
              source: "enregistrement",
            },
          },
        },
      };
      setContent(next);
      await persist(next, "Voix enregistrée.");
    } finally {
      setVoiceBusy(null);
    }
  }

  async function generateOne(id: ClassVideoSceneId) {
    setVoiceBusy(id);
    try {
      const next = await generateVoice(id, content);
      setContent(next);
      await persist(next, "Voix générée et enregistrée.");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setVoiceBusy(null);
    }
  }

  async function generateAll() {
    setVoiceBusy("all");
    let next = content;
    let generated = 0;
    try {
      for (const id of CLASS_VIDEO_SCENE_IDS) {
        const s = resolvedScene(id, next, source);
        if (!s.enabled || !s.voiceText.trim() || !voiceNeedsRefresh(s, tts.voiceKey)) continue;
        next = await generateVoice(id, next);
        setContent(next);
        generated += 1;
      }
      await persist(
        next,
        generated > 0
          ? `${generated} voix générée${generated > 1 ? "s" : ""} et enregistrée${generated > 1 ? "s" : ""}.`
          : "Toutes les voix sont déjà à jour.",
      );
    } catch (error) {
      toast((error as Error).message, "error");
      // Les voix obtenues avant l'erreur ne sont pas perdues.
      if (generated > 0) await persist(next).catch(() => undefined);
    } finally {
      setVoiceBusy(null);
    }
  }

  async function addBenefits(files: FileList) {
    setUploading("benefits");
    try {
      const added: ClassVideoContent["benefits"] = [];
      for (const file of Array.from(files).slice(0, 24 - content.benefits.length)) {
        added.push({ url: await uploadMedia(file), caption: "" });
      }
      setContent((c) => ({ ...c, benefits: [...c.benefits, ...added] }));
      toast(`${added.length} photo${added.length > 1 ? "s" : ""} ajoutée${added.length > 1 ? "s" : ""}. Ajoutez une légende, puis enregistrez.`);
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setUploading(null);
      if (benefitInput.current) benefitInput.current.value = "";
    }
  }

  async function setMemberPhoto(index: number, file: File) {
    setUploading(`member-${index}`);
    try {
      const url = await uploadMedia(file);
      setContent((c) => ({
        ...c,
        members: c.members.map((m, i) => (i === index ? { ...m, url } : m)),
      }));
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setUploading(null);
    }
  }

  async function uploadMusic(file: File) {
    setUploading("music");
    try {
      const url = await uploadMedia(file);
      setContent((c) => ({ ...c, music: { ...c.music, mode: "upload", url } }));
      toast("Musique importée. Enregistrez pour la garder.");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setUploading(null);
      if (musicInput.current) musicInput.current.value = "";
    }
  }

  function addSuggestedTeam() {
    setContent((c) => {
      const known = new Set(c.members.map((m) => m.name.toLowerCase()));
      const extra = source.suggestedMembers
        .filter((m) => !known.has(m.name.toLowerCase()))
        .map((m) => ({ url: null, name: m.name, role: m.role }));
      return { ...c, members: [...c.members, ...extra].slice(0, 16) };
    });
  }

  const hasPhotos =
    content.benefits.length > 0 || content.members.some((m) => m.url !== null);
  const staleVoices = CLASS_VIDEO_SCENE_IDS.filter((id) => {
    const s = scene(id);
    return s.enabled && s.voiceText.trim() && voiceNeedsRefresh(s, tts.voiceKey);
  }).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="min-w-0 space-y-6">
        {/* Couleurs ---------------------------------------------------- */}
        <Card className="p-5 sm:p-6">
          <SectionTitle icon={Palette} title="Couleurs">
            Tirées du logo de l’école et ajustées pour rester vives à l’écran.
            Sans logo en couleur, la vidéo prend une palette par défaut.
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-4">
            {source.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={source.logoUrl}
                alt=""
                className="h-14 w-auto max-w-[8rem] rounded-lg border-2 border-slate-200 bg-white object-contain p-1"
              />
            )}
            <div className="flex gap-2">
              {Object.entries(source.palette).map(([name, color]) => (
                <span
                  key={name}
                  title={color}
                  className="h-10 w-10 rounded-full border-2 border-white shadow-[0_0_0_2px_rgb(226_232_240)]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Pour changer les couleurs, changez le logo dans la Configuration.
          </p>
        </Card>

        {/* Scènes ---------------------------------------------------- */}
        <Card className="p-5 sm:p-6">
          <SectionTitle icon={Wand2} title="Les scènes">
            Déjà rédigées à partir des informations de l’association. Modifiez
            ce que vous voulez : le titre s’affiche en grand, la voix off lit
            le texte de la dernière case.
          </SectionTitle>
          <div className="space-y-3">
            {CLASS_VIDEO_SCENE_IDS.map((id, index) => {
              const s = scene(id);
              const custom = content.scenes[id] !== undefined;
              const voiceState = !s.voice
                ? null
                : !voiceIsCurrent(s)
                  ? "stale"
                  : voiceNeedsRefresh(s, tts.voiceKey)
                    ? "other"
                    : "ok";
              return (
                <details
                  key={id}
                  className={cn(
                    "group rounded-xl border-2 bg-white",
                    s.enabled ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50",
                  )}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-bold", s.enabled ? "text-slate-900" : "text-slate-400 line-through")}>
                        {SCENE_LABELS[id]}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{s.title}</span>
                    </span>
                    {voiceState === "ok" && (
                      <Badge color="green" icon={Check}>
                        {s.voice?.source === "enregistrement" ? "Voix enregistrée" : "Voix"}
                      </Badge>
                    )}
                    {voiceState === "stale" && <Badge color="amber">Voix à refaire</Badge>}
                    {voiceState === "other" && <Badge color="amber">Ancienne voix</Badge>}
                  </summary>
                  <div className="space-y-3 border-t-2 border-slate-100 px-4 py-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => updateScene(id, { enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 accent-brand-700"
                      />
                      Montrer cette scène
                    </label>
                    <Field label="Titre" htmlFor={`${id}-title`}>
                      <Input
                        id={`${id}-title`}
                        value={s.title}
                        maxLength={80}
                        onChange={(e) => updateScene(id, { title: e.target.value })}
                      />
                    </Field>
                    <Field label="Sous-titre" htmlFor={`${id}-subtitle`}>
                      <Input
                        id={`${id}-subtitle`}
                        value={s.subtitle}
                        maxLength={140}
                        onChange={(e) => updateScene(id, { subtitle: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Voix off"
                      htmlFor={`${id}-voice`}
                      hint={`Phrase lue pendant la scène. Défaut : « ${defaults[id].voiceText} »`}
                    >
                      <Textarea
                        id={`${id}-voice`}
                        rows={3}
                        value={s.voiceText}
                        maxLength={600}
                        onChange={(e) => updateScene(id, { voiceText: e.target.value })}
                      />
                    </Field>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        icon={Mic}
                        disabled={!tts.ready || !s.voiceText.trim() || voiceBusy !== null}
                        loading={voiceBusy === id}
                        onClick={() => generateOne(id)}
                      >
                        {s.voice?.source === "synthese" ? "Régénérer la voix" : "Voix de synthèse"}
                      </Button>
                      <VoiceRecorder
                        text={s.voiceText}
                        disabled={voiceBusy !== null}
                        onKeep={(file) => keepRecording(id, file)}
                      />
                      {s.voice && voiceIsCurrent(s) && (
                        <audio controls src={s.voice.url} className="h-9 max-w-full" />
                      )}
                      {custom && (
                        <Button type="button" size="sm" variant="ghost" icon={RotateCcw} onClick={() => resetScene(id)}>
                          Textes par défaut
                        </Button>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </Card>

        {/* Photos des bienfaits -------------------------------------- */}
        <Card className="p-5 sm:p-6">
          <SectionTitle icon={ImagePlus} title="Ce que l’APEL finance">
            Ce que les familles voient tous les jours et que l’APEL a financé :
            les Legos géants de la cour, le baby-foot, une sortie… Une photo et
            une légende courte suffisent. Sans photo, la vidéo montre trois
            cartes illustrées : projets, équipement, souvenirs.
          </SectionTitle>
          {content.benefits.length > 0 && (
            <ul className="mb-4 space-y-3">
              {content.benefits.map((photo, index) => (
                <li key={photo.url} className="flex items-center gap-3 rounded-xl border-2 border-slate-200 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
                  <Input
                    aria-label={`Légende de la photo ${index + 1}`}
                    placeholder="Ex. : les Legos géants de la cour"
                    value={photo.caption}
                    maxLength={90}
                    onChange={(e) =>
                      setContent((c) => ({
                        ...c,
                        benefits: c.benefits.map((p, i) => (i === index ? { ...p, caption: e.target.value } : p)),
                      }))
                    }
                  />
                  <div className="flex shrink-0 flex-col">
                    <button type="button" aria-label="Monter" className="rounded p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" disabled={index === 0} onClick={() => setContent((c) => ({ ...c, benefits: moveItem(c.benefits, index, -1) }))}>
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label="Descendre" className="rounded p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" disabled={index === content.benefits.length - 1} onClick={() => setContent((c) => ({ ...c, benefits: moveItem(c.benefits, index, 1) }))}>
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                  <button type="button" aria-label="Retirer la photo" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-coral-50 hover:text-coral-700" onClick={() => setContent((c) => ({ ...c, benefits: c.benefits.filter((_, i) => i !== index) }))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={benefitInput}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            multiple
            className="sr-only"
            id="benefit-photos"
            onChange={(e) => e.target.files && addBenefits(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            icon={ImagePlus}
            loading={uploading === "benefits"}
            disabled={content.benefits.length >= 24}
            onClick={() => benefitInput.current?.click()}
          >
            Ajouter des photos
          </Button>
        </Card>

        {/* Équipe ---------------------------------------------------- */}
        <Card className="p-5 sm:p-6">
          <SectionTitle icon={Users} title="L’équipe">
            Les parents qui animent l’association, pour que les familles
            sachent à qui s’adresser. Sans photo, la vidéo affiche l’initiale.
          </SectionTitle>
          {content.members.length > 0 && (
            <ul className="mb-4 space-y-3">
              {content.members.map((member, index) => (
                <li key={index} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-slate-200 p-2 sm:flex-nowrap">
                  <label className="relative grid h-14 w-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200" title="Choisir une photo">
                    {member.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={member.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-5 w-5" aria-hidden="true" />
                    )}
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="sr-only"
                      aria-label={`Photo de ${member.name}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void setMemberPhoto(index, file);
                        e.target.value = "";
                      }}
                    />
                    {uploading === `member-${index}` && (
                      <span className="absolute inset-0 grid place-items-center bg-white/70 text-xs font-bold text-slate-600">…</span>
                    )}
                  </label>
                  <Input
                    aria-label="Prénom"
                    placeholder="Prénom"
                    value={member.name}
                    maxLength={40}
                    className="min-w-[8rem] flex-1"
                    onChange={(e) =>
                      setContent((c) => ({
                        ...c,
                        members: c.members.map((m, i) => (i === index ? { ...m, name: e.target.value } : m)),
                      }))
                    }
                  />
                  <Input
                    aria-label="Rôle"
                    placeholder="Rôle (facultatif)"
                    value={member.role}
                    maxLength={40}
                    className="min-w-[8rem] flex-1"
                    onChange={(e) =>
                      setContent((c) => ({
                        ...c,
                        members: c.members.map((m, i) => (i === index ? { ...m, role: e.target.value } : m)),
                      }))
                    }
                  />
                  {member.url && (
                    <button type="button" className="shrink-0 text-xs font-semibold text-slate-500 hover:text-coral-700" onClick={() => setContent((c) => ({ ...c, members: c.members.map((m, i) => (i === index ? { ...m, url: null } : m)) }))}>
                      Sans photo
                    </button>
                  )}
                  <button type="button" aria-label={`Retirer ${member.name}`} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-coral-50 hover:text-coral-700" onClick={() => setContent((c) => ({ ...c, members: c.members.filter((_, i) => i !== index) }))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              icon={UserPlus}
              disabled={content.members.length >= 16}
              onClick={() => setContent((c) => ({ ...c, members: [...c.members, { url: null, name: "Prénom", role: "" }] }))}
            >
              Ajouter un parent
            </Button>
            {source.suggestedMembers.length > 0 && (
              <Button type="button" variant="ghost" icon={Users} onClick={addSuggestedTeam}>
                Reprendre les comptes du bureau
              </Button>
            )}
          </div>
        </Card>

        {/* Autorisations -------------------------------------------- */}
        <Card className={cn("p-5 sm:p-6", hasPhotos && !content.photoConsent && "border-sand-300 bg-sand-50/60")}>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={content.photoConsent}
              onChange={(e) => setContent((c) => ({ ...c, photoConsent: e.target.checked }))}
              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-700"
            />
            <span className="text-sm leading-6 text-slate-700">
              <strong className="font-bold text-slate-950">
                Les personnes photographiées ont donné leur accord.
              </strong>{" "}
              Pour les enfants, celui de leurs parents (droit à l’image). Tant
              que cette case n’est pas cochée, la vidéo n’affiche aucune photo.
            </span>
          </label>
        </Card>

        {/* Musique ---------------------------------------------------- */}
        <Card className="p-5 sm:p-6">
          <SectionTitle icon={Music} title="Musique et bruitages">
            La musique générée par l’application est libre de droits. Vous
            pouvez la remplacer par un MP3 libre de droits (Pixabay Music,
            YouTube Audio Library…).
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fond musical" htmlFor="music-mode">
              <Select
                id="music-mode"
                value={content.music.mode}
                onChange={(e) =>
                  setContent((c) => ({
                    ...c,
                    music: { ...c.music, mode: e.target.value as ClassVideoContent["music"]["mode"] },
                  }))
                }
              >
                <option value="generated">Musique générée</option>
                <option value="upload" disabled={!content.music.url}>
                  Ma musique importée
                </option>
                <option value="none">Pas de musique</option>
              </Select>
            </Field>
            <Field label={`Volume : ${Math.round(content.music.volume * 100)} %`} htmlFor="music-volume" hint="Baissé automatiquement pendant la voix off.">
              <input
                id="music-volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={content.music.volume}
                onChange={(e) => setContent((c) => ({ ...c, music: { ...c.music, volume: Number(e.target.value) } }))}
                className="w-full accent-brand-700"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={musicInput}
              type="file"
              accept=".mp3,.wav,.ogg,.m4a"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadMusic(file);
              }}
            />
            <Button type="button" variant="outline" size="sm" icon={AudioLines} loading={uploading === "music"} onClick={() => musicInput.current?.click()}>
              {content.music.url ? "Remplacer ma musique" : "Importer une musique"}
            </Button>
            {content.music.url && <audio controls src={content.music.url} className="h-9 max-w-full" />}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={content.sfx}
              onChange={(e) => setContent((c) => ({ ...c, sfx: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 accent-brand-700"
            />
            Bruitages (pop, whoosh, étincelles)
          </label>
        </Card>

        <VoiceSettingsCard tts={tts} onSaved={setTts} />
      </div>

      {/* Aperçu et export ----------------------------------------------- */}
      <div className="min-w-0">
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-4 sm:p-5">
            <ClassVideoPreview content={content} source={source} />
          </Card>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <Button
              type="button"
              icon={Save}
              loading={saving}
              disabled={!dirty || voiceBusy !== null}
              onClick={() => persist(content, "Vidéo enregistrée.").catch(() => undefined)}
            >
              {dirty ? "Enregistrer" : "Enregistré"}
            </Button>
            <Button
              type="button"
              variant="outline"
              icon={Mic}
              disabled={!tts.ready || voiceBusy !== null || staleVoices === 0}
              loading={voiceBusy === "all"}
              onClick={generateAll}
            >
              {staleVoices > 0
                ? `Générer les voix (${staleVoices})`
                : "Voix à jour"}
            </Button>
            {!tts.ready && (
              <p className="w-full text-xs text-slate-500">
                La voix de synthèse n’est pas prête : voyez « Voix off » en bas
                de page. Vous pouvez aussi enregistrer votre voix, scène par
                scène.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_VOICE: Record<TtsSettingsView["provider"], string> = {
  piper: DEFAULT_INTEGRATED_VOICE,
  openai: "coral",
  elevenlabs: "",
};

function VoiceSettingsCard({
  tts,
  onSaved,
}: {
  tts: TtsSettingsView;
  onSaved: (next: TtsSettingsView) => void;
}) {
  const toast = useToast();
  const [provider, setProvider] = useState<TtsSettingsView["provider"]>(tts.provider);
  const [apiKey, setApiKey] = useState("");
  const [voice, setVoice] = useState(tts.voice ?? DEFAULT_VOICE[tts.provider]);
  const [saving, setSaving] = useState(false);
  const cloud = provider !== "piper";

  async function save() {
    setSaving(true);
    try {
      const { tts: next } = await api<{ tts: TtsSettingsView }>("/api/communication/tts", {
        method: "PUT",
        body: { provider, apiKey: cloud ? apiKey || null : null, voice: voice || null },
      });
      onSaved(next);
      setApiKey("");
      toast("Voix off enregistrée.");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle icon={KeyRound} title="Voix off">
        La voix intégrée, open source, est gratuite et ne quitte pas votre
        serveur ; ses voix naturelles ont une vraie intonation. Les services
        en ligne sont facturés à l’usage (quelques centimes par vidéo). Vous
        pouvez aussi enregistrer votre propre voix, scène par scène.
      </SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Voix de synthèse" htmlFor="tts-provider">
          <Select
            id="tts-provider"
            value={provider}
            onChange={(e) => {
              const next = e.target.value as TtsSettingsView["provider"];
              setProvider(next);
              setVoice(DEFAULT_VOICE[next]);
            }}
          >
            <option value="piper" disabled={!tts.integratedAvailable}>
              Voix intégrée — open source, gratuite
            </option>
            <option value="openai">OpenAI (gpt-4o-mini-tts)</option>
            <option value="elevenlabs">ElevenLabs (multilingue v2)</option>
          </Select>
        </Field>
        {provider === "piper" ? (
          <Field
            label="Voix"
            htmlFor="tts-voice"
            hint={isIntegratedVoice(voice) ? `${INTEGRATED_VOICES[voice].credit}.` : undefined}
          >
            <Select id="tts-voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {(Object.keys(INTEGRATED_ENGINES) as IntegratedEngine[]).map((engine) => (
                <optgroup
                  key={engine}
                  label={
                    engine === "supertonic"
                      ? `${INTEGRATED_ENGINES[engine]} (recommandées)`
                      : INTEGRATED_ENGINES[engine]
                  }
                >
                  {Object.entries(INTEGRATED_VOICES)
                    .filter(([, v]) => v.engine === engine)
                    .map(([id, v]) => (
                      <option key={id} value={id} disabled={!tts.integratedEngines[engine]}>
                        {v.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        ) : provider === "openai" ? (
          <Field label="Voix" htmlFor="tts-voice">
            <Select id="tts-voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {OPENAI_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field
            label="Identifiant de la voix"
            htmlFor="tts-voice"
            hint="Choisissez une voix française dans la bibliothèque d’ElevenLabs et copiez son identifiant (Voice ID)."
          >
            <Input id="tts-voice" value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Ex. : a5n9pJUnAhX4fn7lx3uo" />
          </Field>
        )}
        {cloud ? (
          <Field
            label="Clé d’API"
            htmlFor="tts-key"
            className="sm:col-span-2"
            hint={
              tts.keyConfigured && tts.provider === provider
                ? `Clé enregistrée, se terminant par ${tts.keyLastFour}. Laissez vide pour la garder.`
                : provider === "openai"
                  ? "Créez-la sur platform.openai.com, rubrique API keys. Elle reste chiffrée sur le serveur."
                  : "Créez-la sur elevenlabs.io, rubrique API Keys. Elle reste chiffrée sur le serveur."
            }
          >
            <Input
              id="tts-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={tts.keyConfigured && tts.provider === provider ? "••••••••" : "sk-…"}
            />
          </Field>
        ) : (
          <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
            {!tts.integratedAvailable
              ? "La voix intégrée ne peut pas tourner sur ce serveur (module natif absent). Choisissez un service en ligne ou enregistrez votre voix."
              : isIntegratedVoice(voice) && INTEGRATED_VOICES[voice].engine === "supertonic"
                ? "Rien à configurer. Les voix naturelles s’appuient sur un modèle de 380 Mo, téléchargé sur le serveur dès l’enregistrement de ce choix : comptez quelques minutes la première fois, puis trois à cinq secondes par phrase."
                : "Rien à configurer. Les voix légères s’appuient sur un modèle de 80 à 90 Mo, téléchargé à la première voix générée : comptez une minute la première fois, une seconde ensuite."}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" loading={saving} onClick={save}>
          Enregistrer la voix off
        </Button>
        {tts.ready ? (
          <Badge color="green" icon={Check}>Prête</Badge>
        ) : (
          <Badge color="amber">À configurer</Badge>
        )}
      </div>
    </Card>
  );
}
