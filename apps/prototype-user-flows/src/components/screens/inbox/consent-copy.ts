// Candidate-facing copy of the Consent Page, in English and French.
// Uses the domain terms of CONTEXT.md ("Talent Pool" is kept in French too, never "vivier").
// French typography: a narrow no-break space (U+202F) before ? ! ; and a no-break space (U+00A0)
// before :, so the punctuation never wraps onto its own line.

import type { ConsentChoice, Language } from "@/lib/types";

export interface ConsentCopy {
  languageName: string;
  /** The browser tab title. */
  documentTitle: string;
  title: string;
  intro: (p: { first: string; recruiter: string; workspace: string; role: string | null }) => string;
  changeAnyTime: string;
  whatWeHold: string;
  heldName: string;
  heldEmail: (p: { email: string; provider: string; date: string }) => string;
  heldEmailNoProvenance: (email: string) => string;
  heldMessages: string;
  chooseLabel: string;
  choices: Record<ConsentChoice, { title: string; description: (workspace: string) => string }>;
  confirm: string;
  update: string;
  cancel: string;
  saving: string;
  current: (date: string) => string;
  doneTitle: Record<ConsentChoice, string>;
  doneBody: Record<ConsentChoice, (p: { first: string; workspace: string; until: string }) => string>;
  change: string;
  legal: (p: { workspace: string; address: string; email: string }) => string;
  invalidTitle: string;
  invalidBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  retry: string;
  loading: string;
  poweredBy: string;
  saveFailed: string;
}

/** Narrow no-break space, before ? ! ; in French. */
const NNBSP = " ";
/** No-break space, before : in French. */
const NBSP = " ";

export const CONSENT_COPY: Record<Language, ConsentCopy> = {
  en: {
    languageName: "English",
    documentTitle: "How we keep your details",
    title: "How should we keep your details?",
    intro: ({ first, recruiter, workspace, role }) =>
      `Hi ${first}, ${recruiter} from ${workspace} contacted you about ${role ? `a ${role} role` : "a role"}. Choose what ${workspace} may do with your details.`,
    changeAnyTime: "You can change your choice at any time from this page.",
    whatWeHold: "What we hold about you",
    heldName: "Your name and your public professional background",
    heldEmail: ({ email, provider, date }) => `Your personal email address (${email}), found by ${provider} on ${date}`,
    heldEmailNoProvenance: (email) => `Your personal email address (${email})`,
    heldMessages: "The emails we sent you and your replies",
    chooseLabel: "Your choice",
    choices: {
      talent_pool: {
        title: "Keep me in the Talent Pool",
        description: (workspace) => `${workspace} keeps your details for 2 years and only contacts you about roles that match your background. You can leave at any time.`,
      },
      this_opportunity: {
        title: "Only for this opportunity",
        description: () => "Your details are used for this role only, then deleted within 6 months at the latest.",
      },
      delete: {
        title: "Delete my data",
        description: () => "Your details are deleted now. Only a one-way hash of your email address is kept, so that you are never contacted again.",
      },
    },
    confirm: "Confirm my choice",
    update: "Update my choice",
    cancel: "Cancel",
    saving: "Saving...",
    current: (date) => `Your current choice, recorded on ${date}.`,
    doneTitle: {
      talent_pool: "You are in the Talent Pool",
      this_opportunity: "We will use your details for this opportunity only",
      delete: "Your data has been deleted",
    },
    doneBody: {
      talent_pool: ({ first, workspace, until }) =>
        `Thank you, ${first}. ${workspace} keeps your details until ${until} and will only contact you about roles that match your background.`,
      this_opportunity: ({ first, until }) => `Thank you, ${first}. We keep your details until ${until} at the latest, for this role only.`,
      delete: ({ workspace }) =>
        `Your details have been deleted from ${workspace}. Only a one-way hash of your email address is kept, so that nobody using Auto Recruit contacts you again.`,
    },
    change: "Change my choice",
    legal: ({ workspace, address, email }) =>
      `${workspace} (${address}) is the controller of your data. Auto Recruit processes it on ${workspace}'s behalf, in the EU. Questions: ${email}.`,
    invalidTitle: "This link is no longer valid",
    invalidBody: "It may already have been used to delete your data, or it was copied incompletely. Reply to the email you received to reach the recruiter directly.",
    unavailableTitle: "This page is temporarily unavailable",
    unavailableBody: "Please try again in a moment.",
    retry: "Try again",
    loading: "Loading...",
    poweredBy: "Consent Page powered by Auto Recruit",
    saveFailed: "Your choice could not be saved. Please try again in a moment.",
  },
  fr: {
    languageName: "Français",
    documentTitle: "Comment nous conservons vos coordonnées",
    title: `Comment souhaitez-vous que nous conservions vos coordonnées${NNBSP}?`,
    intro: ({ first, recruiter, workspace, role }) =>
      `Bonjour ${first}, ${recruiter} (${workspace}) vous a contacté(e) au sujet ${role ? `d'un poste de ${role}` : "d'un poste"}. Choisissez ce que ${workspace} peut faire de vos coordonnées.`,
    changeAnyTime: "Vous pouvez changer d'avis à tout moment depuis cette page.",
    whatWeHold: "Ce que nous détenons sur vous",
    heldName: "Votre nom et votre parcours professionnel public",
    heldEmail: ({ email, provider, date }) => `Votre adresse e-mail personnelle (${email}), trouvée par ${provider} le ${date}`,
    heldEmailNoProvenance: (email) => `Votre adresse e-mail personnelle (${email})`,
    heldMessages: "Les e-mails que nous vous avons envoyés et vos réponses",
    chooseLabel: "Votre choix",
    choices: {
      talent_pool: {
        title: "Rester dans le Talent Pool",
        description: (workspace) =>
          `${workspace} conserve vos coordonnées pendant 2 ans et ne vous contacte que pour des postes qui correspondent à votre parcours. Vous pouvez en sortir à tout moment.`,
      },
      this_opportunity: {
        title: "Uniquement pour cette opportunité",
        description: () => "Vos coordonnées servent uniquement pour ce poste, puis sont supprimées sous 6 mois au plus tard.",
      },
      delete: {
        title: "Supprimer mes données",
        description: () =>
          "Vos coordonnées sont supprimées immédiatement. Seule une empreinte irréversible (hash) de votre adresse e-mail est conservée, pour que vous ne soyez plus jamais contacté(e).",
      },
    },
    confirm: "Confirmer mon choix",
    update: "Mettre à jour mon choix",
    cancel: "Annuler",
    saving: "Enregistrement...",
    current: (date) => `Votre choix actuel, enregistré le ${date}.`,
    doneTitle: {
      talent_pool: "Vous êtes dans le Talent Pool",
      this_opportunity: "Nous utiliserons vos coordonnées uniquement pour cette opportunité",
      delete: "Vos données ont été supprimées",
    },
    doneBody: {
      talent_pool: ({ first, workspace, until }) =>
        `Merci ${first}. ${workspace} conserve vos coordonnées jusqu'au ${until} et ne vous contactera que pour des postes qui correspondent à votre parcours.`,
      this_opportunity: ({ first, until }) => `Merci ${first}. Nous conservons vos coordonnées jusqu'au ${until} au plus tard, uniquement pour ce poste.`,
      delete: () =>
        "Vos coordonnées ont été supprimées. Seule une empreinte irréversible (hash) de votre adresse e-mail est conservée, pour que personne utilisant Auto Recruit ne vous contacte à nouveau.",
    },
    change: "Modifier mon choix",
    legal: ({ workspace, address, email }) =>
      `${workspace} (${address}) est responsable du traitement de vos données. Auto Recruit les traite pour son compte, dans l'UE. Questions${NBSP}: ${email}.`,
    invalidTitle: "Ce lien n'est plus valide",
    invalidBody:
      "Il a peut-être déjà servi à supprimer vos données, ou il a été copié de façon incomplète. Répondez à l'e-mail reçu pour joindre directement le recruteur.",
    unavailableTitle: "Cette page est momentanément indisponible",
    unavailableBody: "Réessayez dans un instant.",
    retry: "Réessayer",
    loading: "Chargement...",
    poweredBy: "Page de consentement fournie par Auto Recruit",
    saveFailed: "Votre choix n'a pas pu être enregistré. Réessayez dans un instant.",
  },
};
