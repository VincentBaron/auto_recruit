import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Audio, Transcriber } from "./transcribe.ts";

const execFileAsync = promisify(execFile);

/** Converts an audio file to one the transcriber takes. */
export type Convert = (audio: Audio) => Promise<Audio>;

/** Runs `ffmpeg` with these arguments. */
export type RunFfmpeg = (args: string[]) => Promise<void>;

const defaultRun: RunFfmpeg = async (args) => void (await execFileAsync("ffmpeg", args, { timeout: 60_000 }));

/**
 * The voice-note pipeline: download, convert, transcribe. Only the text is returned (ADR 0029):
 * the bytes live in memory, and on disk only inside the converter, which removes them before it returns.
 */
export class VoiceNotes {
  constructor(private readonly options: { transcriber: Transcriber; convert?: Convert }) {}

  async transcribe(download: () => Promise<Buffer>, contextBias: string[]): Promise<string> {
    const downloaded: Audio = { data: await download(), filename: "recap.ogg", mime: "audio/ogg" };
    const audio = this.options.convert ? await this.options.convert(downloaded) : downloaded;
    return this.options.transcriber.transcribe(audio, contextBias);
  }
}

/** OGG/Opus to MP3 through ffmpeg, in a folder of `workDir` removed before returning, whatever happens. */
export function ffmpegToMp3(workDir: string, run: RunFfmpeg = defaultRun): Convert {
  return async (audio) => {
    mkdirSync(workDir, { recursive: true });
    const folder = mkdtempSync(join(workDir, "note-"));
    try {
      const input = join(folder, "in.ogg");
      const output = join(folder, "out.mp3");
      writeFileSync(input, audio.data);
      await run(["-y", "-loglevel", "error", "-i", input, "-ac", "1", "-ar", "16000", output]);
      return { data: readFileSync(output), filename: "recap.mp3", mime: "audio/mpeg" };
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };
}

/** Removes what a crash left in `workDir`. */
export function sweepAudio(workDir: string): void {
  if (!existsSync(workDir)) return;
  for (const name of readdirSync(workDir)) rmSync(join(workDir, name), { recursive: true, force: true });
}
