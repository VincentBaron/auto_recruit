/** One recorded audio file, as a channel hands it over. */
export interface Audio {
  data: Buffer;
  filename: string;
  mime: string;
}

/** Turns speech into text; the provider behind it can be swapped (docs/research/speech-to-text.md). */
export interface Transcriber {
  /** `contextBias` are names and titles the speaker is likely to say, to be spelled right. */
  transcribe(audio: Audio, contextBias: string[]): Promise<string>;
}

export interface VoxtralOptions {
  apiKey: string;
  model?: string;
  url?: string;
  fetch?: typeof fetch;
}

/** Mistral Voxtral Mini Transcribe 2. */
export class VoxtralTranscriber implements Transcriber {
  constructor(_options: VoxtralOptions) {}

  async transcribe(_audio: Audio, _contextBias: string[]): Promise<string> {
    return "";
  }
}

/** The terms to bias a transcript with: the person on the Call Sheet card, then the job titles of the Niches. */
export function contextTerms(_card: string | undefined, _nicheTexts: string[]): string[] {
  return [];
}
