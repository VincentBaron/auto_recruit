// Canned Outreach Agent: Campaign emails (FR for French recipients, EN otherwise), footers with
// sender identity, one-click opt-out, Article 14 Notice for Candidates and an AI-assistance note,
// scripted replies for every Reply Category and the drafted responses the Recruiter sends.

import { addDays, diffDays } from "@/lib/dates";
import { formatDate, formatDateFr } from "@/lib/format";
import type {
  AppState,
  Brief,
  Candidate,
  CampaignAudience,
  DetectedRole,
  EmailFooter,
  HiringContact,
  Language,
  Message,
  PersonKind,
  Prospect,
  ReplyCategory,
  SequenceStep,
  SignalType,
} from "@/lib/types";
import { PROVIDER_LABELS, RETENTION } from "@/lib/labels";
import { firstName, recruiterName } from "./helpers";
import { hashString } from "./rng";
import { newId } from "./runtime";

/** Public links in emails use the product's public domain, like the opt-out and privacy links. */
const PUBLIC_ORIGIN = "https://go.autorecruit.example";

/** The Consent Page link sent to Candidates. The app opens the same page at the relative /consent/<token>. */
export function consentUrl(token: string): string {
  return `${PUBLIC_ORIGIN}/consent/${token}`;
}

export function consentToken(seed: string): string {
  return `c${hashString(`consent|${seed}`).toString(16).padStart(8, "0")}${hashString(`k|${seed}`).toString(36).slice(0, 4)}`;
}

/* ------------------------------------------------------------------ */
/* French copy                                                         */
/* ------------------------------------------------------------------ */

const NNBSP = " ";
const NBSP = " ";

/**
 * French typography: a narrow no-break space before ? ! ; and inside « », a no-break space before :.
 * Templates write a plain space before those signs; URLs ("https://") are never touched.
 */
export function fr(text: string): string {
  return text
    .replace(/ ([?!;])/g, `${NNBSP}$1`)
    .replace(/ :/g, `${NBSP}:`)
    .replace(/« /g, `«${NNBSP}`)
    .replace(/ »/g, `${NNBSP}»`);
}

/** "de Dropcontact", "d'Exa", "d'un fournisseur": elision before a vowel or a mute h. */
function deFr(word: string): string {
  return /^[aeiouyàâäéèêëîïôöûùüh]/i.test(word) ? `d'${word}` : `de ${word}`;
}

function isFrench(text: string): boolean {
  return /\s(je|vous|des|les)\s/i.test(` ${text} `);
}

/** The line appended to a response to a Candidate, with the Consent Page link. */
export function consentLinkLine(language: Language, link: string): string {
  return language === "fr" ? fr(`Pour choisir comment je conserve vos coordonnées : ${link}`) : `To choose how I keep your details: ${link}`;
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

export function buildFooter(
  state: AppState,
  opts: { senderId: string; senderEmail: string; language: Language; personKind: PersonKind; key: string; reviewed: boolean; person?: Candidate | HiringContact },
): EmailFooter {
  const ws = state.workspace;
  const sender = state.recruiters.find((r) => r.id === opts.senderId);
  const senderName = sender?.name ?? "Recruiter";
  const workspaceName = ws?.name ?? "Workspace";
  const address = ws?.address ?? "";
  const isFr = opts.language === "fr";
  const optOutUrl = `${PUBLIC_ORIGIN}/u/${hashString(`optout|${opts.key}`).toString(36)}`;
  const privacyUrl = `${PUBLIC_ORIGIN}/privacy/${hashString(`privacy|${opts.key}`).toString(36)}`;
  const days = RETENTION.contactedNoConsentDays;
  let article14Notice: string | null = null;
  if (opts.personKind === "candidate") {
    const provider = opts.person?.contactValues.find((v) => v.kind === "personal_email")?.provenance.provider;
    const providerLabel = provider ? PROVIDER_LABELS[provider] : isFr ? "un fournisseur" : "a provider";
    // The notice also appears on follow-ups: it says "our first email", never "this email".
    article14Notice = isFr
      ? fr(
          `Pourquoi recevez-vous cet e-mail : ${workspaceName} (responsable de traitement, ${address}) a trouvé votre profil professionnel public et traite vos nom, parcours professionnel et adresse e-mail pour vous proposer des postes correspondants, sur la base de l'intérêt légitime. Votre adresse provient ${deFr(providerLabel)}, avec une source enregistrée. Sans accord de votre part pour rejoindre notre Talent Pool, vos données sont supprimées ${days} jours après notre premier message, même si vous répondez. Vous pouvez y accéder, les exporter, les supprimer ou vous opposer à tout moment : ${privacyUrl}. Si vous vous désinscrivez ou vous opposez, elles sont supprimées immédiatement et seule une empreinte irréversible (hash) de votre adresse e-mail est conservée, pour que vous ne soyez plus jamais contacté(e). Auto Recruit traite ces données pour notre compte, dans l'UE.`,
        )
      : `Why you are receiving this email: ${workspaceName} (data controller, ${address}) found your public professional profile and processes your name, professional background and email address to tell you about roles that match it, on the basis of legitimate interest. Your address comes from ${providerLabel}, with a recorded source. Unless you agree to join our Talent Pool, your data is deleted ${days} days after our first email, even if you reply. You can access, export or delete it, or object, at any time: ${privacyUrl}. If you unsubscribe or object, it is deleted immediately and only a one-way hash of your email address is kept, so that you are never contacted again. Auto Recruit processes this data on our behalf, in the EU.`;
  }
  const aiNote = isFr
    ? opts.reviewed
      ? `Rédigé avec l'aide d'une IA et relu par ${senderName}.`
      : `Rédigé avec l'aide d'une IA et envoyé pour le compte de ${senderName}.`
    : opts.reviewed
      ? `Drafted with AI assistance and reviewed by ${senderName}.`
      : `Drafted with AI assistance and sent on behalf of ${senderName}.`;
  return {
    senderName,
    senderTitle: sender?.title ?? "Recruiter",
    senderEmail: opts.senderEmail,
    workspaceName,
    workspaceAddress: address,
    optOutUrl,
    optOutLabel: isFr ? fr("Ne plus recevoir mes messages : désinscription en un clic") : "Don't want to hear from me again? Unsubscribe in one click",
    article14Notice,
    aiNote,
  };
}

/* ------------------------------------------------------------------ */
/* Brief in French: the angle and the call to action                   */
/* ------------------------------------------------------------------ */

interface CampaignLike {
  nicheId: string;
  ownerId: string;
  audience: CampaignAudience;
  brief: Brief;
  sequence: SequenceStep[];
  autonomy?: "review_all" | "review_first_n" | "auto";
}

function cityOf(location: string): string {
  return location.split(",")[0].trim();
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function sentence(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Role titles stay in English in French emails, as French tech job titles do: "Senior Backend Engineers". */
function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (/^(of|and|in|at|for)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function pluralTitle(role: string): string {
  const r = titleCase(role);
  return /s$/i.test(r) ? r : `${r}s`;
}

const SECTOR_FR: Record<string, string> = { payments: "paiement", banking: "banque", insurance: "assurance", "b2b saas": "SaaS B2B" };

function sectorFr(sector: string): string {
  const s = sector.trim().toLowerCase();
  return SECTOR_FR[s] ?? s;
}

/** "in Paris" -> "à Paris", "remote across Europe" -> "en remote partout en Europe". */
function placeFr(where: string | undefined): string {
  if (!where) return "";
  const w = where.trim();
  if (/^remote across europe$/i.test(w)) return "en remote partout en Europe";
  if (/^across europe$/i.test(w)) return "partout en Europe";
  const m = w.match(/^in (.+)$/i);
  if (!m) return w;
  const place = m[1].trim();
  if (/^remote/i.test(place)) return "en remote partout en Europe";
  if (/^(france|europe|the eu|eu)$/i.test(place)) return `en ${place.replace(/^the /i, "")}`;
  return `à ${place}`;
}

/** "Series A-C" -> "en Series A-C", "fast-growing" -> "en forte croissance", "Seed to Series A" -> "de la Seed à la Series A". */
function stagesFr(stages: string): string {
  const s = stages.trim();
  if (!s) return "";
  if (/^fast-growing$/i.test(s)) return "en forte croissance";
  const range = s.match(/^(.+?) to (.+)$/i);
  if (range) return `de la ${range[1]} à la ${range[2]}`;
  return `en ${s}`;
}

const EXTRA_FR: [RegExp, string][] = [
  [/^with salary bands shared upfront$/i, "avec des fourchettes de salaire partagées dès le départ"],
  [/^fully remote$/i, "en full remote"],
  [/^with a vetted shortlist in under two weeks$/i, "avec une shortlist qualifiée en moins de deux semaines"],
];

function extraFr(extra: string | undefined): string | null {
  if (!extra) return "";
  for (const [re, text] of EXTRA_FR) if (re.test(extra.trim())) return text;
  return null;
}

/** Splits "Series A-C fintech" into stages "Series A-C" and sector "fintech" (the last word). */
function stagesAndSector(text: string): { stages: string; sector: string } {
  const words = text.trim().split(/\s+/);
  return { sector: words[words.length - 1] ?? "", stages: words.slice(0, -1).join(" ") };
}

function joinFr(parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * The French rendering of a Brief angle: verbatim when it is already French, else a translation of the
 * angle templates the Campaign wizard and the chat agent suggest. Null when neither applies.
 */
export function angleFr(angle: string): string | null {
  const a = angle.trim().replace(/\.$/, "");
  if (!a) return null;
  if (isFrench(a)) return fr(sentence(a));
  const where = "(in [^,]+?|remote across Europe|across Europe)";
  // "I place senior backend engineers with fintech teams in Paris, and two strong profiles are available now"
  // ("two strong Go engineers": the skill is kept, "deux candidat(e)s Go solides").
  let m = a.match(new RegExp(`^I place (.+?) with (.+?) teams(?: ${where})?, and (?:two|2) strong (?:([\\w+#.-]+) )?(?:profiles|candidates|engineers|designers|people) are available now$`, "i"));
  if (m) {
    const skill = m[4] ? `${m[4]} ` : "";
    return fr(`J'accompagne des équipes ${joinFr([sectorFr(m[2]), placeFr(m[3])])} sur le recrutement de ${pluralTitle(m[1])}, et deux candidat(e)s ${skill}solides sont disponibles en ce moment.`);
  }
  // "I specialise in backend engineer hiring for Series A-C fintech companies, with a vetted shortlist in under two weeks"
  m = a.match(/^I speciali[sz]e in (.+?) hiring for (.+?) companies(?:, (.+))?$/i);
  if (m) {
    const { stages, sector } = stagesAndSector(m[2]);
    const extra = extraFr(m[3]);
    if (extra !== null) return fr(`Je me spécialise dans le recrutement de ${pluralTitle(m[1])} pour les entreprises ${joinFr([sectorFr(sector), stagesFr(stages)])}${extra ? `, ${extra}` : ""}.`);
  }
  // "I work with Series A-C fintech companies in Paris hiring senior backend engineers, with salary bands shared upfront"
  const normalised = a.replace(/\b(\w*tech)s\b/gi, "$1 companies");
  m = normalised.match(new RegExp(`^I work with (.+?) (companies|teams)(?: ${where})? hiring (.+?)(?:, (.+))?$`, "i"));
  if (m) {
    const { stages, sector } = stagesAndSector(m[1]);
    const extra = extraFr(m[5]);
    if (extra !== null) {
      const who = m[2].toLowerCase() === "teams" ? "des équipes" : "des entreprises";
      return fr(`J'accompagne ${who} ${joinFr([sectorFr(sector), stagesFr(stages), placeFr(m[3])])} qui recrutent des ${pluralTitle(m[4])}${extra ? `, ${extra}` : ""}.`);
    }
  }
  // "A fintech team I know well is hiring a backend engineer and your background matches what they look for"
  m = a.match(/^A (.+?) team I know well is hiring an? (.+?) and your background matches what they look for$/i);
  if (m) return fr(`Une équipe ${sectorFr(m[1])} que je connais bien recrute un(e) ${titleCase(m[2])} et votre parcours correspond à ce qu'elle recherche.`);
  return null;
}

function ctaEn(cta: string): string {
  const c = cta.trim().replace(/[.?!]+$/, "");
  return c ? `Would you be open to ${lowerFirst(c)}?` : "Would you be open to a short call this week?";
}

const WEEKDAYS_FR: [RegExp, string][] = [
  [/\bmonday\b/i, "lundi"],
  [/\btuesday\b/i, "mardi"],
  [/\bwednesday\b/i, "mercredi"],
  [/\bthursday\b/i, "jeudi"],
  [/\bfriday\b/i, "vendredi"],
];

/** "this week" -> "cette semaine", "next week" -> "la semaine prochaine", "Thursday or Friday" -> "jeudi ou vendredi". */
function timingFr(cta: string): string {
  if (/\bthis week\b/i.test(cta)) return "cette semaine";
  if (/\bnext week\b/i.test(cta)) return "la semaine prochaine";
  if (/\btomorrow\b/i.test(cta)) return "demain";
  if (/\btoday\b/i.test(cta)) return "aujourd'hui";
  const days = WEEKDAYS_FR.filter(([re]) => re.test(cta)).map(([, d]) => d);
  return days.join(" ou ");
}

/** The call to action in French, keeping its specifics: duration and timing. */
export function ctaFr(cta: string): string {
  const c = cta.trim().replace(/[.?!]+$/, "");
  if (!c) return fr("Seriez-vous disponible pour un court appel cette semaine ?");
  if (isFrench(c) || /\b(appel|échange|semaine|lundi|mardi|mercredi|jeudi|vendredi)\b/i.test(c)) return fr(`${c.charAt(0).toUpperCase()}${c.slice(1)} ?`);
  if (/right person/i.test(c)) return fr("Pourriez-vous m'indiquer la bonne personne à qui en parler ?");
  if (/call|chat|talk|meeting|appel|échange/i.test(c)) {
    const minutes = c.match(/(\d+)[- ]?min/i)?.[1];
    const what = /chat/i.test(c) ? "échange" : "appel";
    const kind = minutes ? `un ${what} de ${minutes} minutes` : /short|quick|brief/i.test(c) ? `un court ${what}` : `un ${what}`;
    const about = /what you would want next/i.test(c) ? " sur ce que vous aimeriez pour la suite" : "";
    const when = timingFr(c);
    return fr(`Seriez-vous disponible pour ${kind}${about}${when ? ` ${when}` : ""} ?`);
  }
  return fr("Seriez-vous ouvert(e) à en discuter rapidement ?");
}

function signOff(state: AppState, senderId: string, language: Language): string {
  const name = firstName(recruiterName(state, senderId));
  const voice = state.voiceProfiles.find((v) => v.recruiterId === senderId && v.language === language);
  const fromVoice = voice?.styleGuide.find((s) => /signs off/i.test(s));
  if (language === "fr") return `${fromVoice && /bonne/i.test(fromVoice) ? "Bonne journée" : "Belle journée"},\n${name}`;
  return `${fromVoice && /cheers/i.test(fromVoice) ? "Cheers" : "Best"},\n${name}`;
}

/* ------------------------------------------------------------------ */
/* Campaign emails                                                     */
/* ------------------------------------------------------------------ */

/** Signal types of a Prospect or Candidate, best contribution first. */
function rankedSignals(p: Prospect | Candidate): SignalType[] {
  return [...p.breakdown.lines].filter((l) => l.contribution > 0).sort((a, b) => b.contribution - a.contribution).map((l) => l.type);
}

function topSignal(p: Prospect | Candidate, variant = 0): SignalType | null {
  const types = rankedSignals(p);
  return types.length === 0 ? null : types[variant % types.length];
}

/** The Prospect's own Detected Role: the freshest one, open roles first. */
function ownRole(state: AppState, prospect: Prospect | undefined): DetectedRole | undefined {
  if (!prospect) return undefined;
  return state.detectedRoles
    .filter((r) => r.prospectId === prospect.id)
    .sort((a, b) => Number(a.stale) - Number(b.stale) || (a.postedOn < b.postedOn ? 1 : -1))[0];
}

/** One factual sentence about a Prospect Signal (only facts the Signal itself records). */
function prospectFact(sig: SignalType | null, ctx: { company: string; sector: string; role: DetectedRole | undefined; roundLabel: string | null; isFr: boolean; age: number | null }): string | null {
  const { company, role, isFr, age } = ctx;
  switch (sig) {
    case "job_posting":
      if (!role) return null;
      if (age === null) return isFr ? `J'ai vu que ${company} recrute un(e) ${role.title}.` : `I saw ${company} is hiring a ${role.title}.`;
      return isFr
        ? `J'ai vu que ${company} recrute un(e) ${role.title} (annonce publiée il y a ${age} jour${age > 1 ? "s" : ""}).`
        : `I saw ${company} is hiring a ${role.title} (posted ${age} day${age > 1 ? "s" : ""} ago).`;
    case "job_posting_stale":
      if (!role) return null;
      return isFr ? `J'ai remarqué que votre annonce ${role.title} est en ligne depuis plus d'un mois.` : `I noticed your ${role.title} posting has been open for over a month.`;
    case "funding_round":
      return isFr ? `Félicitations pour votre ${ctx.roundLabel ?? "levée de fonds"}.` : `Congratulations on the ${ctx.roundLabel ?? "new round"}.`;
    case "new_leader":
      return isFr ? `J'ai vu que ${company} a accueilli un nouveau leader technique.` : `I saw ${company} recently welcomed a new technology leader.`;
    case "headcount_growth":
      return isFr ? `${company} a beaucoup grandi ces six derniers mois.` : `${company} has grown fast over the last six months.`;
    case "expansion":
      return isFr ? `J'ai vu que ${company} ouvre un nouveau bureau.` : `I saw ${company} is opening a new office.`;
    default:
      return null;
  }
}

function hiringContactEmail(state: AppState, c: CampaignLike, h: HiringContact, step: number, variant: number): { subject: string; body: string } {
  const prospect = state.prospects.find((p) => p.id === h.prospectId);
  const niche = state.niches.find((n) => n.id === c.nicheId);
  const company = prospect?.name ?? "your company";
  // The Brief's Detected Role is used only when it is at this recipient's company; otherwise the
  // Prospect's own roles and Signals are the hook (never claim another company's role).
  const briefRole = c.brief.detectedRoleId ? state.detectedRoles.find((r) => r.id === c.brief.detectedRoleId) : undefined;
  const role = briefRole && briefRole.prospectId === h.prospectId ? briefRole : ownRole(state, prospect);
  const isFr = h.language === "fr";
  const first = firstName(h.name);
  const sector = prospect?.sector ?? niche?.profile.sectors[0] ?? "tech";
  const city = prospect ? cityOf(prospect.location) : "Paris";
  const roleWord = niche?.profile.roleTypes[0] ?? "engineering";
  const subject1 = isFr ? (role ? `Votre recrutement ${role.title}` : `Recrutement chez ${company}`) : role ? `${role.title} at ${company}` : `${roleWord} hiring at ${company}`;
  const age = role ? Math.max(1, diffDays(state.clock.today, role.postedOn)) : null;
  const factCtx = { company, sector, role, roundLabel: prospect?.latestFunding?.round ?? null, isFr, age };
  const angle = isFr
    ? angleFr(c.brief.angle) ?? fr(`J'accompagne des équipes ${sectorFr(sector)} à ${city} sur leurs recrutements, et des candidat(e)s solides sont disponibles en ce moment.`)
    : sentence(c.brief.angle) || `I work with ${sector.toLowerCase()} teams in ${city} and have candidates who could interest you.`;
  const cta = isFr ? ctaFr(c.brief.callToAction) : ctaEn(c.brief.callToAction);
  const sign = signOff(state, c.ownerId, h.language);
  const hello = isFr ? `Bonjour ${first},` : `Hi ${first},`;
  if (step === 1) {
    const sig = role && variant === 0 ? (role.stale ? "job_posting_stale" : "job_posting") : prospect ? topSignal(prospect, variant) : null;
    const hook =
      prospectFact(sig, factCtx) ??
      (isFr ? `Je suis de près ce que fait ${company} dans la ${sector.toLowerCase()}.` : `I follow ${company}'s work in ${sector.toLowerCase()} closely.`);
    return { subject: subject1, body: `${hello}\n\n${fr2(isFr, hook)} ${angle}\n\n${cta}\n\n${sign}` };
  }
  if (step === 2) {
    // One line from a real Signal not used as the first hook, else the Brief's angle: no invented facts.
    const firstHook = role && variant === 0 ? (role.stale ? "job_posting_stale" : "job_posting") : prospect ? topSignal(prospect, variant) : null;
    const isPosting = (t: SignalType | null) => t === "job_posting" || t === "job_posting_stale";
    const other = prospect ? rankedSignals(prospect).find((t) => t !== firstHook && !(isPosting(t) && isPosting(firstHook))) ?? null : null;
    const line = prospectFact(other, factCtx) ?? angle;
    const intro = isFr ? "Je me permets de revenir vers vous suite à mon précédent message." : "I'm following up on my previous message.";
    return { subject: `Re: ${subject1}`, body: `${hello}\n\n${intro} ${fr2(isFr, line)}\n\n${cta}\n\n${sign}` };
  }
  const body = isFr
    ? fr(`${hello}\n\nDernier message de ma part sur ce sujet. Si le moment n'est pas le bon, aucun souci : répondez simplement « plus tard » et je reviendrai vers vous dans quelques mois.\n\n${sign}`)
    : `${hello}\n\nLast note from me on this. If the timing is wrong, no problem: just reply "later" and I'll check back in a few months.\n\n${sign}`;
  return { subject: `Re: ${subject1}`, body };
}

/** French typography for French sentences only. */
function fr2(isFr: boolean, text: string): string {
  return isFr ? fr(text) : text;
}

function candidateEmail(state: AppState, c: CampaignLike, cand: Candidate, step: number, variant: number): { subject: string; body: string } {
  const niche = state.niches.find((n) => n.id === c.nicheId);
  const role = c.brief.detectedRoleId ? state.detectedRoles.find((r) => r.id === c.brief.detectedRoleId) : undefined;
  const prospect = role ? state.prospects.find((p) => p.id === role.prospectId) : undefined;
  const isFr = cand.language === "fr";
  const first = firstName(cand.name);
  const sector = (prospect?.sector ?? niche?.profile.sectors[0] ?? "tech").toLowerCase();
  const city = prospect ? cityOf(prospect.location) : cityOf(cand.location);
  const stage = prospect?.latestFunding?.round ?? (isFr ? "en forte croissance" : "fast-growing");
  const roleTitle = role?.title ?? cand.currentTitle;
  const subject1 = isFr ? `Poste de ${roleTitle} à ${city}` : `${roleTitle} role in ${city}`;
  const hello = isFr ? `Bonjour ${first},` : `Hi ${first},`;
  const cta = isFr ? ctaFr(c.brief.callToAction) : ctaEn(c.brief.callToAction);
  const sign = signOff(state, c.ownerId, cand.language);
  // The role pitched (the Brief's Detected Role), else the Brief's angle.
  const roleLine = role
    ? isFr
      ? `Une entreprise que j'accompagne, une ${sectorFr(sector)} ${prospect?.latestFunding ? `en ${stage}` : stage} basée à ${city}, recrute un(e) ${roleTitle}.`
      : `A company I work with, a ${stage} ${sector} company in ${city}, is hiring a ${roleTitle}.`
    : isFr
      ? angleFr(c.brief.angle) ?? `J'accompagne des entreprises ${sectorFr(sector)} qui recrutent des personnes au parcours proche du vôtre.`
      : sentence(c.brief.angle) || `I work with ${sector} companies hiring people with a background like yours.`;
  if (step === 1) {
    const tenureYears = Math.floor(cand.tenureMonths / 12);
    let hook: string;
    switch (topSignal(cand, variant)) {
      case "tenure_sweet_spot":
        hook = isFr
          ? `Cela fait plus de ${tenureYears} an${tenureYears > 1 ? "s" : ""} que vous êtes chez ${cand.currentEmployer}, c'est souvent le moment où l'on regarde la suite.`
          : `You have been at ${cand.currentEmployer} for over ${tenureYears} year${tenureYears > 1 ? "s" : ""} now, which is often when people start looking at what's next.`;
        break;
      case "employer_turbulence":
        hook = isFr ? `J'ai vu l'actualité récente chez ${cand.currentEmployer}.` : `I saw the recent news at ${cand.currentEmployer}.`;
        break;
      default:
        hook = isFr ? `Votre parcours chez ${cand.currentEmployer} a retenu mon attention.` : `Your background at ${cand.currentEmployer} caught my eye.`;
    }
    return { subject: subject1, body: `${hello}\n\n${fr2(isFr, `${hook} ${roleLine}`)}\n\n${cta}\n\n${sign}` };
  }
  if (step === 2) {
    // No invented facts or timing: the role pitched or the Brief's angle, then the call to action.
    const line = role ? roleLine : isFr ? angleFr(c.brief.angle) ?? roleLine : sentence(c.brief.angle) || roleLine;
    const intro = isFr ? "Je me permets de revenir vers vous suite à mon précédent message." : "I'm following up on my previous message.";
    return { subject: `Re: ${subject1}`, body: `${hello}\n\n${fr2(isFr, `${intro} ${line}`)}\n\n${cta}\n\n${sign}` };
  }
  const body = isFr
    ? fr(`${hello}\n\nDernier message de ma part. Si ce n'est pas le bon moment, aucun souci, et sans réponse vos données seront supprimées comme indiqué ci-dessous.\n\n${sign}`)
    : `${hello}\n\nLast note from me. If now is not the right time, no problem; without a reply your data is deleted as explained below.\n\n${sign}`;
  return { subject: `Re: ${subject1}`, body };
}

/** Drafts one Sequence email for one recipient. */
export function draftMessage(
  state: AppState,
  campaign: CampaignLike,
  person: HiringContact | Candidate,
  personKind: PersonKind,
  step: number,
  senderEmail: string,
  variant = 0,
): Message {
  const content =
    personKind === "candidate"
      ? candidateEmail(state, campaign, person as Candidate, step, variant)
      : hiringContactEmail(state, campaign, person as HiringContact, step, variant);
  const footer = buildFooter(state, {
    senderId: campaign.ownerId,
    senderEmail,
    language: person.language,
    personKind,
    key: `${person.id}|${step}`,
    reviewed: campaign.autonomy !== "auto",
    person,
  });
  return {
    id: newId("msg"),
    step,
    language: person.language,
    subject: content.subject,
    body: content.body,
    footer,
    status: "draft",
    sentOn: null,
    editedByRecruiter: false,
    originalBody: null,
    origin: "campaign",
  };
}

/* ------------------------------------------------------------------ */
/* Replies                                                             */
/* ------------------------------------------------------------------ */

export interface ReplyContext {
  personName: string;
  personKind: PersonKind;
  language: Language;
  senderName: string;
  company: string | null;
  address: string | null;
  today: string;
  outOfOfficeUntil: string;
  /** The first sending day after the Out of Office return date. */
  resumeOn: string;
  referral: { name: string; title: string } | null;
  /** Picks one of the canned reply bodies (the recipient id), so two people never write the same reply. */
  variantKey: string;
}

/** 0, 1 or 2: which canned body, availability and slot a reply uses. */
function variantOf(key: string): number {
  return hashString(`reply|${key}`) % 3;
}

/** When an Interested person is available, per variant: what they wrote, and what the response proposes. */
const CANDIDATE_SLOTS = [
  { en: "Thursday after 6pm", fr: "jeudi après 18h" },
  { en: "Tuesday at lunchtime", fr: "mardi à l'heure du déjeuner" },
  { en: "Friday morning", fr: "vendredi matin" },
] as const;

const HIRING_CONTACT_SLOTS = [
  { en: "Thursday at 3pm", fr: "Jeudi 15h" },
  { en: "Wednesday at 10am", fr: "Mercredi 10h" },
  { en: "Monday at 5pm", fr: "Lundi 17h" },
] as const;

export function replyBody(category: ReplyCategory, ctx: ReplyContext): string {
  const isFr = ctx.language === "fr";
  const me = firstName(ctx.personName);
  const sender = firstName(ctx.senderName);
  const cand = ctx.personKind === "candidate";
  const v = variantOf(ctx.variantKey);
  const pick = (en: string[], frTexts: string[]) => (isFr ? fr(frTexts[v]) : en[v]);
  switch (category) {
    case "interested":
      if (cand)
        return pick(
          [
            `Hi ${sender},\n\nThanks for reaching out. I'm not actively looking, but I'd like to hear more. Could you call me Thursday after 6pm?\n\n${me}`,
            `Hi ${sender},\n\nYour timing is good: I've been thinking about my next step. Could we talk Tuesday at lunchtime?\n\n${me}`,
            `Hi ${sender},\n\nThanks, this sounds interesting. I'm free Friday morning for a call, if that works for you.\n\n${me}`,
          ],
          [
            `Bonjour ${sender},\n\nMerci pour votre message. Je ne cherche pas activement, mais j'aimerais en savoir plus. Vous pouvez m'appeler jeudi après 18h ?\n\n${me}`,
            `Bonjour ${sender},\n\nVotre message tombe bien : je réfléchis justement à la suite. Pouvons-nous en parler mardi à l'heure du déjeuner ?\n\n${me}`,
            `Bonjour ${sender},\n\nMerci, cela m'intéresse. Je suis disponible vendredi matin pour un appel, si cela vous convient.\n\n${me}`,
          ],
        );
      return pick(
        [
          `Hi ${sender},\n\nGood timing, we're struggling to fill this role. Could you introduce the candidates? I'm free Thursday afternoon for a call.\n\n${me}`,
          `Hi ${sender},\n\nYour email lands at the right moment: this hire is taking longer than planned. Could we talk Wednesday morning?\n\n${me}`,
          `Hi ${sender},\n\nInterested. Could you introduce the candidates you mentioned? Monday end of day works for a call.\n\n${me}`,
        ],
        [
          `Bonjour ${sender},\n\nBon timing, nous avons du mal à pourvoir ce poste. Pouvez-vous me présenter les candidat(e)s ? Je suis disponible jeudi après-midi pour un appel.\n\n${me}`,
          `Bonjour ${sender},\n\nVotre message arrive au bon moment : ce recrutement prend plus de temps que prévu. Pouvons-nous en parler mercredi matin ?\n\n${me}`,
          `Bonjour ${sender},\n\nIntéressé(e). Pouvez-vous me présenter les candidat(e)s dont vous parlez ? Lundi en fin de journée me conviendrait pour un appel.\n\n${me}`,
        ],
      );
    case "not_now":
      if (cand)
        return pick(
          [
            `Hi ${sender},\n\nThanks for your message. The timing is not right: I've just taken on a new project. Could you get back to me in January?\n\n${me}`,
            `Hi ${sender},\n\nI'm not moving before the end of the year, but I'll be more open in early January.\n\n${me}`,
            `Hi ${sender},\n\nThanks. Not right now, but feel free to reach out again in January.\n\n${me}`,
          ],
          [
            `Bonjour ${sender},\n\nMerci pour votre message. Ce n'est pas le bon moment : je viens de prendre en charge un nouveau projet. Pouvez-vous me recontacter en janvier ?\n\n${me}`,
            `Bonjour ${sender},\n\nJe ne bouge pas avant la fin de l'année, mais je serai plus disponible début janvier.\n\n${me}`,
            `Bonjour ${sender},\n\nMerci. Pas tout de suite, mais n'hésitez pas à revenir vers moi en janvier.\n\n${me}`,
          ],
        );
      return pick(
        [
          `Hi ${sender},\n\nThanks, but we've just filled the role internally. We'll be hiring again in Q1, ping me in January.\n\n${me}`,
          `Hi ${sender},\n\nThe timing is wrong: our hiring budget is frozen until the end of the year. Get back to me in early January.\n\n${me}`,
          `Hi ${sender},\n\nNot right now, we're reorganising the team. Reach out again in January, it will be easier.\n\n${me}`,
        ],
        [
          `Bonjour ${sender},\n\nMerci, mais nous venons de pourvoir le poste en interne. Nous recruterons à nouveau au premier trimestre, recontactez-moi en janvier.\n\n${me}`,
          `Bonjour ${sender},\n\nLe timing n'est pas le bon : nos budgets de recrutement sont gelés jusqu'à la fin de l'année. Revenez vers moi début janvier.\n\n${me}`,
          `Bonjour ${sender},\n\nPas pour le moment, nous réorganisons l'équipe. Recontactez-moi en janvier, ce sera plus simple.\n\n${me}`,
        ],
      );
    case "not_interested":
      if (cand)
        return pick(
          [`Hi,\n\nThanks, but I'm happy where I am.\n\n${me}`, `Hi,\n\nNo thank you, I'm not looking to change roles.\n\n${me}`, `Hi,\n\nThanks for your message, but this is not for me.\n\n${me}`],
          [`Bonjour,\n\nMerci, mais je suis très bien là où je suis.\n\n${me}`, `Bonjour,\n\nNon merci, je ne souhaite pas changer de poste.\n\n${me}`, `Bonjour,\n\nMerci pour votre message, mais cela ne m'intéresse pas.\n\n${me}`],
        );
      return pick(
        [`Hi,\n\nThanks, but we don't work with agencies at the moment.\n\n${me}`, `Hi,\n\nThanks, we only hire directly.\n\n${me}`, `Hi,\n\nThanks, but we have no need for this kind of role.\n\n${me}`],
        [
          `Bonjour,\n\nMerci, mais nous ne travaillons pas avec des cabinets en ce moment.\n\n${me}`,
          `Bonjour,\n\nMerci, nous recrutons uniquement en direct.\n\n${me}`,
          `Bonjour,\n\nMerci, mais nous n'avons pas de besoin sur ce type de poste.\n\n${me}`,
        ],
      );
    case "opt_out":
      return pick(["Please remove me from your list.", "Please stop contacting me.", "Unsubscribe me, please."], ["Merci de ne plus me contacter.", "Merci de me retirer de votre liste.", "Je ne souhaite plus recevoir vos messages."]);
    case "out_of_office": {
      const en = formatDate(ctx.outOfOfficeUntil);
      const frDate = formatDateFr(ctx.outOfOfficeUntil);
      return pick(
        [
          `I'm out of the office until ${en} with limited access to email. I'll get back to you when I return.`,
          `Hello, I'm on leave until ${en} included. I'll read your message when I'm back.`,
          `Away until ${en}. For anything urgent, please write again after that date.`,
        ],
        [
          `Je suis absent(e) jusqu'au ${frDate} avec un accès limité à mes e-mails. Je vous répondrai à mon retour.`,
          `Bonjour, je suis en congés jusqu'au ${frDate} inclus. Je traiterai votre message à mon retour.`,
          `Absent(e) jusqu'au ${frDate}. Pour toute urgence, merci de m'écrire à nouveau après cette date.`,
        ],
      );
    }
    case "referral": {
      const ref = ctx.referral ?? { name: isFr ? "un(e) collègue" : "a colleague", title: "Head of Talent" };
      return pick(
        [
          `Hi ${sender},\n\nI'm not the right person for this. Please reach out to ${ref.name}, our ${ref.title}, who runs this hiring.\n\n${me}`,
          `Hi ${sender},\n\n${ref.name} (${ref.title}) handles this hiring on our side: please write to them directly.\n\n${me}`,
          `Hi ${sender},\n\nThanks. For this role, please talk to ${ref.name}, ${ref.title}.\n\n${me}`,
        ],
        [
          `Bonjour ${sender},\n\nJe ne suis pas la bonne personne pour ce sujet. Contactez plutôt ${ref.name}, notre ${ref.title}, qui gère ces recrutements.\n\n${me}`,
          `Bonjour ${sender},\n\nC'est ${ref.name} (${ref.title}) qui s'occupe de ces recrutements chez nous : je vous invite à lui écrire directement.\n\n${me}`,
          `Bonjour ${sender},\n\nMerci. Pour ce poste, voyez plutôt avec ${ref.name}, ${ref.title}.\n\n${me}`,
        ],
      );
    }
    case "bounce":
      return `Delivery to the following recipient failed permanently:\n\n    ${ctx.address ?? "unknown address"}\n\nTechnical details of permanent failure:\n550 5.1.1 The email account that you tried to reach does not exist.`;
  }
}

/**
 * The subject of a reply. An Out of Office prefix is in the recipient's language (their mail client
 * writes it); a bounce comes from the mail server, in English.
 */
export function replySubject(category: ReplyCategory, originalSubject: string, language: Language): string {
  if (category === "bounce") return "Delivery Status Notification (Failure)";
  if (category === "out_of_office") return language === "fr" ? fr(`Réponse automatique : ${originalSubject}`) : `Automatic reply: ${originalSubject}`;
  return originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`;
}

/** The response the Recruiter will send (edited or not). Null when no response is needed. */
export function draftResponse(category: ReplyCategory, ctx: ReplyContext, consentLink: string | null): string | null {
  const isFr = ctx.language === "fr";
  const first = firstName(ctx.personName);
  const sender = firstName(ctx.senderName);
  const sign = isFr ? `Belle journée,\n${sender}` : `Best,\n${sender}`;
  const cand = ctx.personKind === "candidate";
  const v = variantOf(ctx.variantKey);
  switch (category) {
    case "interested":
      if (cand)
        return isFr
          ? fr(
              `Bonjour ${first},\n\nMerci pour votre retour ! Je vous appelle ${CANDIDATE_SLOTS[v].fr} avec plaisir.\n\nAvant notre échange, pouvez-vous me dire comment vous souhaitez que je conserve vos coordonnées ? Cela prend dix secondes : ${consentLink ?? ""}\n\n${sign}`,
            )
          : `Hi ${first},\n\nThanks for getting back to me! Happy to call you ${CANDIDATE_SLOTS[v].en}.\n\nBefore we talk, could you tell me how you'd like me to keep your details? It takes ten seconds: ${consentLink ?? ""}\n\n${sign}`;
      return isFr
        ? fr(`Bonjour ${first},\n\nAvec plaisir. Je vous présente les candidat(e)s aujourd'hui. ${HIRING_CONTACT_SLOTS[v].fr} vous convient-il pour en parler ?\n\n${sign}`)
        : `Hi ${first},\n\nGreat to hear. I'll introduce the candidates today. Would ${HIRING_CONTACT_SLOTS[v].en} work for a call?\n\n${sign}`;
    case "not_now":
      return isFr ? fr(`Bonjour ${first},\n\nC'est noté, merci. Je reviens vers vous début janvier.\n\n${sign}`) : `Hi ${first},\n\nNoted, thank you. I'll get back to you early January.\n\n${sign}`;
    case "not_interested":
      if (cand)
        return isFr
          ? fr(`Bonjour ${first},\n\nC'est noté, merci pour votre réponse. J'ai supprimé vos coordonnées.\n\n${sign}`)
          : `Hi ${first},\n\nUnderstood, thanks for your reply. I've deleted your details.\n\n${sign}`;
      return isFr
        ? fr(`Bonjour ${first},\n\nC'est noté, merci de m'avoir répondu. Je ne vous relancerai pas.\n\n${sign}`)
        : `Hi ${first},\n\nUnderstood, thanks for letting me know. I won't follow up.\n\n${sign}`;
    case "referral":
      return isFr
        ? fr(`Bonjour ${first},\n\nMerci beaucoup, je contacte ${ctx.referral?.name ?? "votre collègue"} directement.\n\n${sign}`)
        : `Hi ${first},\n\nThank you, I'll reach out to ${ctx.referral?.name ?? "your colleague"} directly.\n\n${sign}`;
    case "opt_out":
    case "out_of_office":
    case "bounce":
      return null;
  }
}

/** The next step once the Recruiter sent their response to an Interested reply. */
export function nextStepAfterInterestedResponse(personKind: PersonKind, personLabel: string, variantKey: string): string {
  const first = firstName(personLabel);
  const v = variantOf(variantKey);
  return personKind === "candidate" ? `Call ${first} ${CANDIDATE_SLOTS[v].en}.` : `Call ${first} ${HIRING_CONTACT_SLOTS[v].en} and introduce the candidates.`;
}

export function suggestedNextStep(
  category: ReplyCategory,
  ctx: ReplyContext & { closedUntil?: string; bounceFound?: { provider: string } | null },
): string {
  const cand = ctx.personKind === "candidate";
  const v = variantOf(ctx.variantKey);
  switch (category) {
    case "interested":
      return cand
        ? `Send the drafted response with the Consent Page link, then call ${CANDIDATE_SLOTS[v].en}.`
        : `Introduce the candidates and confirm ${HIRING_CONTACT_SLOTS[v].en}.`;
    case "not_now":
      return `Follow up on ${formatDate(addDays(ctx.today, 84))}.`;
    case "not_interested":
      return cand
        ? "Nothing else to do: the Candidate's data is deleted and only the hash stays on the Suppression List."
        : `Nothing else to do: ${ctx.company ?? "the Prospect"} is closed until ${formatDate(ctx.closedUntil ?? addDays(ctx.today, 182))}. Sending the drafted thank-you is optional.`;
    case "opt_out":
      return cand
        ? "Nothing to do: the Candidate's data is deleted and only the hash stays on the Suppression List, for every Workspace."
        : "Nothing to do: the address is on the Suppression List for every Workspace.";
    case "out_of_office":
      return `Nothing to do: the Sequence resumes on ${formatDate(ctx.resumeOn)}.`;
    case "referral":
      return `Accept ${ctx.referral?.name ?? "the referred person"} as a Hiring Contact, then add them to the Campaign.`;
    case "bounce":
      return ctx.bounceFound
        ? `New email found by ${ctx.bounceFound.provider}: the email is sent again on the next sending day.`
        : "No other email found: outreach to this person stopped.";
  }
}
