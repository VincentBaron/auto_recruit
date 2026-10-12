import { describe, expect, it } from "vitest";
import { contextTerms, VoxtralTranscriber } from "../src/transcribe.ts";

const audio = { data: Buffer.from("fake-audio"), filename: "recap.mp3", mime: "audio/mpeg" };

function fakeFetch(status: number, body: unknown) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchFn, seen };
}

describe("VoxtralTranscriber", () => {
  it("sends the audio to Mistral with the key, the model and each context term, and returns the text", async () => {
    const { fetchFn, seen } = fakeFetch(200, { text: "J'ai parlé à Léa Morel, CTO chez Acme" });
    const transcriber = new VoxtralTranscriber({ apiKey: "test-key", fetch: fetchFn });
    const text = await transcriber.transcribe(audio, ["Léa Morel", "Acme", "Forward Deployed Engineer"]);
    expect(text).toBe("J'ai parlé à Léa Morel, CTO chez Acme");
    expect(seen[0].url).toBe("https://api.mistral.ai/v1/audio/transcriptions");
    expect((seen[0].init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    const form = seen[0].init.body as FormData;
    expect(form.get("model")).toBe("voxtral-mini-latest");
    expect((form.get("file") as File).name).toBe("recap.mp3");
    expect(form.getAll("context_bias")).toEqual(["Léa Morel", "Acme", "Forward Deployed Engineer"]);
  });

  it("sends no context_bias when there is none, and at most 100 terms", async () => {
    const { fetchFn, seen } = fakeFetch(200, { text: "ok" });
    const transcriber = new VoxtralTranscriber({ apiKey: "k", fetch: fetchFn });
    await transcriber.transcribe(audio, []);
    expect(seen).toHaveLength(1);
    expect((seen[0].init.body as FormData).has("context_bias")).toBe(false);
    await transcriber.transcribe(audio, Array.from({ length: 150 }, (_, i) => `term ${i}`));
    expect(seen).toHaveLength(2);
    expect((seen[1].init.body as FormData).getAll("context_bias")).toHaveLength(100);
  });

  it("fails with the status, never with the key, when Mistral refuses", async () => {
    const { fetchFn } = fakeFetch(401, { message: "Unauthorized" });
    const transcriber = new VoxtralTranscriber({ apiKey: "secret-key", fetch: fetchFn });
    const error = await transcriber.transcribe(audio, []).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("401");
    expect((error as Error).message).not.toContain("secret-key");
  });
});

const CARD = "📞 Léa Morel - CTO, Acme\nWhy Now: two FDE postings.\n+33612345678";
const NICHE = [
  "# Forward Deployed Engineers - Paris\n\nCalls in: French\n\n## Hiring Contacts\n\n- CTO\n- Head of Talent\n\n## Candidates\n\n- Forward Deployed Engineer\n- Solutions Engineer\n\n## Pitch to Hiring Contacts\n\n- Who I am: a recruiter\n",
];

describe("contextTerms", () => {
  it("gives the person's name, title and company from the card, then the job titles of the Niches", () => {
    expect(contextTerms(CARD, NICHE)).toEqual([
      "Léa Morel",
      "CTO",
      "Acme",
      "Head of Talent",
      "Forward Deployed Engineer",
      "Solutions Engineer",
    ]);
  });

  it("gives only the Niche titles when no Call Sheet is on screen, and nothing from a card without a name line", () => {
    expect(contextTerms(undefined, NICHE)).toEqual(["CTO", "Head of Talent", "Forward Deployed Engineer", "Solutions Engineer"]);
    expect(contextTerms("Plus rien à appeler.", [])).toEqual([]);
  });

  it("keeps a name alone and ignores the Pitch sections", () => {
    expect(contextTerms("📞 Paul Girard, Nexo\n⚠️ No working number", NICHE)).toContain("Paul Girard");
    expect(contextTerms(CARD, NICHE)).not.toContain("Who I am: a recruiter");
  });
});
