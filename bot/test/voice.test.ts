import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Audio, Transcriber } from "../src/transcribe.ts";
import { ffmpegToMp3, sweepAudio, VoiceNotes } from "../src/voice.ts";

let workDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "voice-"));
});

const ogg = Buffer.from("ogg-opus-bytes");

describe("VoiceNotes", () => {
  it("downloads, converts, then transcribes the converted audio with the context terms", async () => {
    const seen: Array<{ audio: Audio; bias: string[] }> = [];
    const transcriber: Transcriber = { transcribe: async (audio, bias) => (seen.push({ audio, bias }), "bonjour Léa") };
    const convert = async (a: Audio): Promise<Audio> => ({ data: Buffer.from("mp3"), filename: "recap.mp3", mime: "audio/mpeg" });
    const notes = new VoiceNotes({ transcriber, convert });
    expect(await notes.transcribe(async () => ogg, ["Léa Morel"])).toBe("bonjour Léa");
    expect(seen[0].audio.filename).toBe("recap.mp3");
    expect(seen[0].bias).toEqual(["Léa Morel"]);
  });

  it("hands the OGG straight over when there is no converter", async () => {
    const seen: Audio[] = [];
    const notes = new VoiceNotes({ transcriber: { transcribe: async (a) => (seen.push(a), "ok") } });
    await notes.transcribe(async () => ogg, []);
    expect(seen[0]).toMatchObject({ filename: "recap.ogg", mime: "audio/ogg" });
    expect(seen[0].data).toEqual(ogg);
  });

  it("passes on a transcriber failure", async () => {
    const notes = new VoiceNotes({ transcriber: { transcribe: async () => Promise.reject(new Error("boom")) } });
    await expect(notes.transcribe(async () => ogg, [])).rejects.toThrow("boom");
  });
});

describe("ffmpegToMp3", () => {
  const audio: Audio = { data: ogg, filename: "recap.ogg", mime: "audio/ogg" };

  it("runs ffmpeg on the OGG, returns the MP3 and leaves no audio file in the work folder", async () => {
    const during: string[][] = [];
    const convert = ffmpegToMp3(workDir, async (args) => {
      const [input, output] = [args[args.indexOf("-i") + 1], args[args.length - 1]];
      expect(readFileSync(input)).toEqual(ogg);
      during.push(readdirSync(workDir));
      writeFileSync(output, "mp3-bytes");
    });
    const result = await convert(audio);
    expect(result).toMatchObject({ filename: "recap.mp3", mime: "audio/mpeg" });
    expect(result.data.toString()).toBe("mp3-bytes");
    expect(during[0]).toHaveLength(1);
    expect(readdirSync(workDir)).toEqual([]);
  });

  it("leaves no audio file either when ffmpeg fails", async () => {
    const convert = ffmpegToMp3(workDir, async (args) => {
      writeFileSync(args[args.length - 1], "half");
      throw new Error("ffmpeg exited 1");
    });
    await expect(convert(audio)).rejects.toThrow("ffmpeg exited 1");
    expect(readdirSync(workDir)).toEqual([]);
  });
});

describe("sweepAudio", () => {
  it("removes what a crash left behind and tolerates a missing folder", () => {
    mkdirSync(join(workDir, "left-over"));
    writeFileSync(join(workDir, "left-over", "in.ogg"), "x");
    writeFileSync(join(workDir, "stray.mp3"), "x");
    sweepAudio(workDir);
    expect(readdirSync(workDir)).toEqual([]);
    sweepAudio(join(workDir, "missing"));
    expect(existsSync(join(workDir, "missing"))).toBe(false);
  });
});
