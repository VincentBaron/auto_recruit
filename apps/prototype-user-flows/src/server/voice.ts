// What a read-only scan of a Recruiter's sent emails yields for the Voice Profile (canned). The
// Established seed uses the same examples, so a rescan replaces them instead of adding near-duplicates.

import type { Language, VoiceExample } from "@/lib/types";
import { fr } from "./drafts";

export const SCANNED_STYLE: Record<Language, string[]> = {
  fr: [
    "Opens with « Bonjour » and the first name",
    "Three short paragraphs, under 120 words",
    "One concrete fact about the company or the person in the first sentence",
    "Uses « vous » in first emails",
    "Ends with one question proposing a short call",
    "Signs off with « Belle journée, » and the first name only",
  ],
  en: [
    'Opens with "Hi" and the first name',
    "Short paragraphs, under 110 words",
    "Mentions one Signal (funding, posting, new leader) as the reason for writing",
    "Ends with a single question proposing a call",
    'Signs off with "Best," and the first name',
  ],
};

/** Sent emails found by the scan, signed with the Recruiter's first name. */
export function scannedExamples(language: Language, first: string): VoiceExample[] {
  if (language === "fr") {
    return [
      {
        subject: "Votre recrutement backend",
        body: fr(`Bonjour Claire,\n\nJ'ai vu que vous recrutez un(e) Staff Engineer depuis le début de l'été. J'accompagne des fintechs parisiennes sur ce type de poste et deux candidat(e)s Go très solides sont disponibles en ce moment.\n\nUn appel de 15 minutes jeudi ?\n\nBelle journée,\n${first}`),
        origin: "scan",
      },
      {
        subject: "Suite à notre échange",
        body: fr(`Bonjour Marc,\n\nComme promis, voici les deux candidat(e)s dont je vous parlais. Le premier a mené la migration de la plateforme de paiement chez un acteur Series B.\n\nQuand pouvez-vous les rencontrer ?\n\nBelle journée,\n${first}`),
        origin: "scan",
      },
      {
        subject: "Poste de Lead Backend",
        body: fr(`Bonjour Sophie,\n\nVotre parcours chez un acteur du paiement a retenu mon attention. Une fintech parisienne en Series B construit son équipe plateforme et cherche un(e) Lead Backend.\n\nSeriez-vous ouverte à en parler 20 minutes cette semaine ?\n\nBelle journée,\n${first}`),
        origin: "scan",
      },
    ];
  }
  return [
    {
      subject: "Your platform hiring",
      body: `Hi Jonas,\n\nCongrats on the Series B. Teams usually double their platform group after a round like this, and I have two senior Go engineers from payments scale-ups available now.\n\nWorth a 15-minute call this week?\n\nBest,\n${first}`,
      origin: "scan",
    },
    {
      subject: null,
      body: `Hi Marta,\n\nI saw the Senior Backend Engineer posting has been open for six weeks. I place exactly this kind of engineer in Paris fintechs and can introduce two shortlisted candidates by Friday.\n\nShall I send them over?\n\nBest,\n${first}`,
      origin: "scan",
    },
  ];
}
