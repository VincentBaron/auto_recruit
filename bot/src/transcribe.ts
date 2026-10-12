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

const MAX_TERMS = 100; // Voxtral's limit for context_bias
const MAX_TERM_LENGTH = 60; // a bullet longer than a job title is a sentence, not a term
const TITLE_SECTIONS = /^##\s+(Hiring Contacts|Candidates)\s*$/;

/** Mistral Voxtral Mini Transcribe 2. */
export class VoxtralTranscriber implements Transcriber {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: VoxtralOptions) {
    this.fetchFn = options.fetch ?? fetch;
  }

  async transcribe(audio: Audio, contextBias: string[]): Promise<string> {
    const form = new FormData();
    form.set("model", this.options.model ?? "voxtral-mini-latest");
    form.set("file", new Blob([new Uint8Array(audio.data)], { type: audio.mime }), audio.filename);
    for (const term of contextBias.slice(0, MAX_TERMS)) form.append("context_bias", term);
    const response = await this.fetchFn(this.options.url ?? "https://api.mistral.ai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "x-api-key": this.options.apiKey },
      body: form,
    });
    // The body of an error may echo the request; the status is all that is kept.
    if (!response.ok) throw new Error(`Voxtral transcription failed with status ${response.status}`);
    const body = (await response.json()) as { text?: string };
    return (body.text ?? "").trim();
  }
}

/** The terms to bias a transcript with: the person on the Call Sheet card, then the job titles of the Niches. */
export function contextTerms(card: string | undefined, nicheTexts: string[]): string[] {
  const terms: string[] = [];
  const add = (term: string | undefined) => {
    const clean = term?.replace(/\s+/g, " ").trim();
    if (clean && clean.length <= MAX_TERM_LENGTH && !terms.includes(clean)) terms.push(clean);
  };
  const first = card?.startsWith("📞") ? card.slice(2).split("\n")[0].trim() : undefined;
  if (first) {
    const dash = first.indexOf(" - ");
    const name = dash >= 0 ? first.slice(0, dash) : first.split(",")[0];
    add(name);
    const rest = dash >= 0 ? first.slice(dash + 3) : first.slice(name.length + 1);
    const comma = rest.lastIndexOf(",");
    if (comma >= 0) {
      add(rest.slice(0, comma));
      add(rest.slice(comma + 1));
    } else add(rest); // a title or a company alone: either is worth spelling right
  }
  for (const text of nicheTexts) {
    let inTitles = false;
    for (const line of text.split("\n")) {
      if (line.startsWith("## ")) inTitles = TITLE_SECTIONS.test(line.trim());
      else if (inTitles && /^[-*]\s+/.test(line)) add(line.replace(/^[-*]\s+/, ""));
    }
  }
  return terms.slice(0, MAX_TERMS);
}
