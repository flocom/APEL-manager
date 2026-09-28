"use client";

import { Check, Circle, Mic, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";

/** Au-delà, une scène ne se regarde plus : mieux vaut couper la phrase. */
const MAX_SECONDS = 60;

type State =
  | { status: "idle" }
  | { status: "recording"; startedAt: number }
  | { status: "review"; file: File; url: string };

/** Format que le navigateur sait enregistrer, et extension que le serveur accepte. */
function recordingFormat(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", extension: "weba" },
    { mimeType: "audio/webm", extension: "weba" },
    // Safari n'enregistre qu'en MP4 (AAC).
    { mimeType: "audio/mp4", extension: "m4a" },
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ?? null;
}

/**
 * Enregistrement de la voix off d'une scène par un parent. Le texte à lire
 * reste affiché pendant l'enregistrement, comme sur un prompteur ; on réécoute
 * avant de garder la prise.
 */
export function VoiceRecorder({
  text,
  disabled,
  onKeep,
}: {
  text: string;
  disabled?: boolean;
  onKeep: (file: File) => Promise<void>;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);

  function releaseMicrophone() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  useEffect(() => releaseMicrophone, []);

  useEffect(() => {
    if (state.status !== "recording") return;
    const timer = window.setInterval(() => {
      const seconds = (Date.now() - state.startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS) recorder.current?.stop();
    }, 200);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(
    () => () => {
      if (state.status === "review") URL.revokeObjectURL(state.url);
    },
    [state],
  );

  async function start() {
    setError(null);
    const format = recordingFormat();
    if (!format || !navigator.mediaDevices?.getUserMedia) {
      setError("Ce navigateur ne sait pas enregistrer le son.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("Le micro n’est pas accessible : autorisez-le dans le navigateur.");
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream.current, {
      mimeType: format.mimeType,
      audioBitsPerSecond: 128_000,
    });
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    media.onstop = () => {
      releaseMicrophone();
      const blob = new Blob(chunks, { type: format.mimeType.split(";")[0] });
      const file = new File([blob], `voix-enregistree.${format.extension}`, {
        type: blob.type,
      });
      setState({ status: "review", file, url: URL.createObjectURL(blob) });
    };
    recorder.current = media;
    media.start();
    setElapsed(0);
    setState({ status: "recording", startedAt: Date.now() });
  }

  async function keep() {
    if (state.status !== "review") return;
    setSaving(true);
    try {
      await onKeep(state.file);
      setState({ status: "idle" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (state.status === "idle") {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={Mic}
          disabled={disabled || !text.trim()}
          onClick={start}
        >
          Enregistrer ma voix
        </Button>
        {error && <p className="w-full text-xs font-medium text-coral-700">{error}</p>}
      </>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border-2 border-brand-200 bg-brand-50/60 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-700">
        {state.status === "recording" ? "Lisez le texte" : "Réécoutez la prise"}
      </p>
      <p className="text-base font-semibold leading-7 text-slate-900">{text}</p>
      {state.status === "recording" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-coral-700">
            <Circle className="h-3 w-3 animate-pulse fill-current" aria-hidden="true" />
            {Math.floor(elapsed)} s / {MAX_SECONDS} s
          </span>
          <Button type="button" size="sm" icon={Square} onClick={() => recorder.current?.stop()}>
            Arrêter
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <audio controls src={state.url} className="h-9 max-w-full" />
          <Button type="button" size="sm" icon={Check} loading={saving} onClick={keep}>
            Garder cette prise
          </Button>
          <Button type="button" size="sm" variant="outline" icon={RotateCcw} disabled={saving} onClick={start}>
            Recommencer
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={X}
            disabled={saving}
            onClick={() => setState({ status: "idle" })}
          >
            Annuler
          </Button>
        </div>
      )}
      {error && <p className="text-xs font-medium text-coral-700">{error}</p>}
    </div>
  );
}
