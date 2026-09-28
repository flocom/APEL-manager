/**
 * Ce que l'application utilise de sherpa-onnx-node, qui ne publie pas de
 * déclarations TypeScript : la synthèse vocale hors ligne (voix Piper).
 */
declare module "sherpa-onnx-node" {
  export type OfflineTtsConfig = {
    model: {
      vits: { model: string; tokens: string; dataDir: string };
      numThreads?: number;
      provider?: "cpu";
      debug?: boolean;
    };
    maxNumSentences?: number;
  };

  export type GeneratedAudio = { samples: Float32Array; sampleRate: number };

  export class OfflineTts {
    static createAsync(config: OfflineTtsConfig): Promise<OfflineTts>;
    readonly numSpeakers: number;
    readonly sampleRate: number;
    generateAsync(request: {
      text: string;
      sid: number;
      speed: number;
    }): Promise<GeneratedAudio>;
  }
}
