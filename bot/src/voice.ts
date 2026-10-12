import type { Audio, Transcriber } from "./transcribe.ts";

/** Converts an audio file to one the transcriber takes. */
export type Convert = (audio: Audio) => Promise<Audio>;

/** Runs `ffmpeg` with these arguments. */
export type RunFfmpeg = (args: string[]) => Promise<void>;

/** The voice-note pipeline: download, convert, transcribe; the audio is gone when it returns. */
export class VoiceNotes {
  constructor(_options: { transcriber: Transcriber; convert?: Convert }) {}

  async transcribe(_download: () => Promise<Buffer>, _contextBias: string[]): Promise<string> {
    return "";
  }
}

/** OGG/Opus to MP3 through ffmpeg, in a folder of `workDir` removed before returning, whatever happens. */
export function ffmpegToMp3(_workDir: string, _run?: RunFfmpeg): Convert {
  return async (audio) => audio;
}

/** Removes what a crash left in `workDir`. */
export function sweepAudio(_workDir: string): void {}
