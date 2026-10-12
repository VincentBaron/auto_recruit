/** The data processing agreement every Recruiter accepts before the Niche discussion (ADR 0029). */
export const DPA_TAP = "dpa:accept";

const ACCEPTANCE = /^(?:j['’]accepte|je l['’]accepte|i accept|accepte|accept)[.!\s]*$/i;

/** Whether a typed line accepts the DPA, as the button does. */
export const isDpaAcceptance = (text: string): boolean => ACCEPTANCE.test(text.trim());

const ASK: Record<string, (url: string) => string> = {
  fr: (url) =>
    [
      "Avant de commencer, un accord de traitement des données (DPA): votre Desk contient des noms et des numéros de personnes, vous en êtes responsable et nous le traitons selon vos instructions.",
      url,
      "Touchez « J'accepte » pour continuer.",
    ].join("\n"),
  en: (url) =>
    [
      "Before we start, a data processing agreement (DPA): your Desk holds people's names and numbers, you are responsible for it and we process it on your instructions.",
      url,
      "Tap \"I accept\" to continue.",
    ].join("\n"),
};
const BUTTON: Record<string, string> = { fr: "J'accepte", en: "I accept" };

/** The DPA link and the button to accept it, in the Recruiter's language (French by default). */
export function dpaAsk(language: string | undefined, url: string): { text: string; buttons: Array<Array<{ label: string; data: string }>> } {
  const lang = language !== undefined && language in ASK ? language : "fr";
  return { text: ASK[lang](url), buttons: [[{ label: BUTTON[lang], data: DPA_TAP }]] };
}

const FIRST_QUESTION: Record<string, string> = {
  fr: "Merci, c'est noté. On commence? Qu'est-ce que vous placez, et où? (ex: « des Forward Deployed Engineers à Paris, pour des startups IA série A à C »)",
  en: "Thank you, noted. Shall we start? What do you place, and where? (e.g. \"Forward Deployed Engineers in Paris, for Series A to C AI startups\")",
};
const THANKS: Record<string, string> = { fr: "Merci, c'est noté.", en: "Thank you, noted." };

/** What the Recruiter reads once they accepted: the first question of the Niche discussion, or a thank-you when they already have a Niche. */
export function afterAcceptance(language: string | undefined, hasNiche: boolean): string {
  const lang = language !== undefined && language in FIRST_QUESTION ? language : "fr";
  return (hasNiche ? THANKS : FIRST_QUESTION)[lang];
}
