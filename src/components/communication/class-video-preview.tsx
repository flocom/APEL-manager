"use client";

import { Player } from "@remotion/player";
import { Download, Film, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import {
  buildClassVideoProps,
  type ClassVideoContent,
  type ClassVideoSource,
} from "@/lib/communication/class-video";
import {
  renderMusicWav,
  renderSfxWav,
  wavToBlobUrl,
} from "@/remotion/class-video/audio-synth";
import { ClassVideo } from "@/remotion/class-video/ClassVideo";
import { computeClassVideoTimeline } from "@/remotion/class-video/timeline";
import {
  CLASS_VIDEO_FPS,
  CLASS_VIDEO_HEIGHT,
  CLASS_VIDEO_WIDTH,
  type ClassVideoProps,
} from "@/remotion/class-video/types";

type ExportState =
  | { status: "idle" }
  | { status: "rendering"; progress: number }
  | { status: "done"; url: string; filename: string; sizeMb: number };

/**
 * Codec de sortie : MP4 (H.264 + AAC), que lisent tous les vidéoprojecteurs,
 * téléviseurs et PowerPoint, dès que le navigateur sait l'encoder — Chrome,
 * Edge et Safari. À défaut (Chromium sans codecs propriétaires, certains
 * Firefox), WebM, lu par tous les navigateurs et VLC.
 */
async function pickOutputFormat() {
  const { getEncodableAudioCodecs, getEncodableVideoCodecs } = await import(
    "@remotion/web-renderer"
  );
  const [mp4Video, mp4Audio] = await Promise.all([
    getEncodableVideoCodecs("mp4"),
    getEncodableAudioCodecs("mp4"),
  ]);
  if (mp4Video.includes("h264") && mp4Audio.includes("aac")) {
    return { container: "mp4", videoCodec: "h264", audioCodec: "aac", extension: "mp4" } as const;
  }
  const webmVideo = await getEncodableVideoCodecs("webm");
  return {
    container: "webm",
    videoCodec: webmVideo.includes("vp9") ? "vp9" : "vp8",
    audioCodec: "opus",
    extension: "webm",
  } as const;
}

export function ClassVideoPreview({
  content,
  source,
}: {
  content: ClassVideoContent;
  source: ClassVideoSource;
}) {
  const toast = useToast();
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  // Musique et bruitages, générés une fois pour la page. La musique est jouée
  // en boucle : une minute et demie suffit, et la régénérer à chaque frappe
  // dans un titre n'aurait aucun sens.
  //
  // Chaque adresse `blob:` est créée et révoquée dans le même effet : révoquée
  // ailleurs (dans le nettoyage d'un autre effet), elle l'était aussi au
  // double montage du mode strict de React, et l'export ne trouvait plus
  // l'audio.
  const [audio, setAudio] = useState<{
    musicUrl: string;
    sfx: NonNullable<ClassVideoProps["sfx"]>;
  } | null>(null);
  useEffect(() => {
    let created: string[] = [];
    // Laisse la page s'afficher avant ce calcul d'une seconde environ.
    const timer = window.setTimeout(() => {
      const next = {
        musicUrl: wavToBlobUrl(renderMusicWav({ seconds: 96, seed: 7 })),
        sfx: {
          pop: wavToBlobUrl(renderSfxWav("pop")),
          whoosh: wavToBlobUrl(renderSfxWav("whoosh")),
          sparkle: wavToBlobUrl(renderSfxWav("sparkle")),
        },
      };
      created = [next.musicUrl, ...Object.values(next.sfx)];
      setAudio(next);
    }, 50);
    return () => {
      window.clearTimeout(timer);
      created.forEach((url) => URL.revokeObjectURL(url));
      setAudio(null);
    };
  }, []);
  const musicUrl = audio?.musicUrl ?? null;
  const sfx = audio?.sfx ?? null;

  const props = useMemo(
    () => buildClassVideoProps(content, source, { generatedMusicUrl: musicUrl, sfx }),
    [content, source, musicUrl, sfx],
  );
  const timeline = useMemo(
    () => computeClassVideoTimeline(props, CLASS_VIDEO_FPS),
    [props],
  );
  const seconds = timeline.durationInFrames / CLASS_VIDEO_FPS;

  // Un nouveau rendu périme le fichier exporté.
  const exportedFor = useRef<string | null>(null);
  const propsKey = JSON.stringify(props);
  useEffect(() => {
    if (exportState.status === "done" && exportedFor.current !== propsKey) {
      URL.revokeObjectURL(exportState.url);
      setExportState({ status: "idle" });
    }
  }, [propsKey, exportState]);

  async function exportVideo() {
    const controller = new AbortController();
    abortRef.current = controller;
    setExportState({ status: "rendering", progress: 0 });
    try {
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const format = await pickOutputFormat();
      const result = await renderMediaOnWeb({
        composition: {
          id: "video-parents",
          component: ClassVideo,
          durationInFrames: timeline.durationInFrames,
          fps: CLASS_VIDEO_FPS,
          width: CLASS_VIDEO_WIDTH,
          height: CLASS_VIDEO_HEIGHT,
          defaultProps: props,
        },
        inputProps: props,
        container: format.container,
        videoCodec: format.videoCodec,
        audioCodec: format.audioCodec,
        videoBitrate: "high",
        // L'APEL est une association à but non lucratif : elle relève de la
        // licence gratuite de Remotion (remotion.dev/license).
        licenseKey: "free-license",
        signal: controller.signal,
        onProgress: ({ progress }) =>
          setExportState({ status: "rendering", progress }),
      });
      const blob = await result.getBlob();
      exportedFor.current = propsKey;
      setExportState({
        status: "done",
        url: URL.createObjectURL(blob),
        filename: `video-apel-parents.${format.extension}`,
        sizeMb: blob.size / 1024 / 1024,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        setExportState({ status: "idle" });
        return;
      }
      console.error("[communication] export vidéo", error);
      toast(
        "L’export a échoué dans ce navigateur. Essayez avec Chrome ou Edge à jour.",
        "error",
      );
      setExportState({ status: "idle" });
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-slate-900">
        <Player
          component={ClassVideo}
          inputProps={props}
          durationInFrames={timeline.durationInFrames}
          fps={CLASS_VIDEO_FPS}
          compositionWidth={CLASS_VIDEO_WIDTH}
          compositionHeight={CLASS_VIDEO_HEIGHT}
          controls
          allowFullscreen
          clickToPlay
          acknowledgeRemotionLicense
          style={{ width: "100%", aspectRatio: "16 / 9" }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm font-semibold text-slate-600">
          {Math.floor(Math.round(seconds) / 60)} min{" "}
          {String(Math.round(seconds) % 60).padStart(2, "0")} s · 1080p
        </p>
        {exportState.status === "idle" && (
          <Button type="button" icon={Film} disabled={!audio} onClick={exportVideo}>
            {audio ? "Exporter la vidéo" : "Préparation du son…"}
          </Button>
        )}
        {exportState.status === "rendering" && (
          <>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-800">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Export… {Math.round(exportState.progress * 100)} %
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={X}
              onClick={() => abortRef.current?.abort()}
            >
              Annuler
            </Button>
          </>
        )}
        {exportState.status === "done" && (
          <a
            href={exportState.url}
            download={exportState.filename}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-coral-600 bg-coral-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-700"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Télécharger ({exportState.sizeMb.toFixed(0)} Mo)
          </a>
        )}
      </div>
      {exportState.status === "rendering" && (
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Avancement de l’export"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(exportState.progress * 100)}
        >
          <span
            className="block h-full rounded-full bg-brand-600 transition-[width]"
            style={{ width: `${exportState.progress * 100}%` }}
          />
        </div>
      )}
      <p className="text-xs leading-5 text-slate-500">
        L’export se fait dans votre navigateur (Chrome ou Edge recommandés) :
        gardez cet onglet ouvert pendant la préparation, qui prend quelques
        minutes.
      </p>
    </div>
  );
}
