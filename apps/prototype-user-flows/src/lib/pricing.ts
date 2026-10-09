// Placeholder Credit prices. Every price shown in the UI must carry the PLACEHOLDER_PRICE_HINT.
// Shared by the client (cost shown before confirming) and the dummy backend (what is charged).

import { plural } from "./format";
import type { CreditPackSize, CreditReason, PersonKind } from "./types";

export const PLACEHOLDER_PRICE_HINT = "placeholder price";

export const PRICES = {
  surfacedProspect: 1,
  surfacedCandidate: 1,
  hiringContactFound: 1,
  verifiedEmail: 2,
  mobile: 8,
  emailSent: 1,
  /** Once per Main Domain. */
  freeTestRun: 0,
} as const;

export type PriceKey = keyof typeof PRICES;

export const PRICE_LIST: { key: PriceKey; label: string; credits: number; unit: string }[] = [
  { key: "surfacedProspect", label: "Surfaced Prospect", credits: PRICES.surfacedProspect, unit: "per Prospect" },
  { key: "surfacedCandidate", label: "Surfaced Candidate", credits: PRICES.surfacedCandidate, unit: "per Candidate" },
  { key: "hiringContactFound", label: "Hiring Contact found", credits: PRICES.hiringContactFound, unit: "per Hiring Contact" },
  { key: "verifiedEmail", label: "Verified email", credits: PRICES.verifiedEmail, unit: "per email found" },
  { key: "mobile", label: "Mobile number", credits: PRICES.mobile, unit: "per number found" },
  { key: "emailSent", label: "Email sent", credits: PRICES.emailSent, unit: "per email" },
  { key: "freeTestRun", label: "Free Test Run", credits: PRICES.freeTestRun, unit: "once per Main Domain" },
];

export const CREDIT_PACKS: { credits: CreditPackSize; priceEur: number; perCreditEur: number; label: string }[] = [
  { credits: 500, priceEur: 99, perCreditEur: 0.198, label: "Starter" },
  { credits: 2000, priceEur: 349, perCreditEur: 0.1745, label: "Team" },
  { credits: 10000, priceEur: 1490, perCreditEur: 0.149, label: "Agency" },
];

export const VAT_RATE = 0.2;

export function packPrice(credits: CreditPackSize): { netEur: number; vatEur: number; totalEur: number } {
  const pack = CREDIT_PACKS.find((p) => p.credits === credits) ?? CREDIT_PACKS[0];
  const vatEur = Math.round(pack.priceEur * VAT_RATE * 100) / 100;
  return { netEur: pack.priceEur, vatEur, totalEur: Math.round((pack.priceEur + vatEur) * 100) / 100 };
}

/** Maximum Credits for enriching one person: email always, mobile only when ticked. Charged only for values found. */
export function enrichmentCost(person: { mobile: boolean }): number {
  return PRICES.verifiedEmail + (person.mobile ? PRICES.mobile : 0);
}

export function enrichmentTotal(people: { mobile: boolean }[]): number {
  return people.reduce((sum, p) => sum + enrichmentCost(p), 0);
}

/**
 * What revealing the free trial's Previews costs on the first Credit pack: the normal price per
 * Hiring Contact found and per Surfaced Candidate, taken from that pack (ADR-0018).
 */
export function revealCost(previews: { hiringContacts: number; candidates: number }): number {
  return previews.hiringContacts * PRICES.hiringContactFound + previews.candidates * PRICES.surfacedCandidate;
}

/** Start of the Credit ledger reference for revealing a Niche's Previews ("... - <Niche>"). */
export const REVEAL_LEDGER_REF = "Free trial Previews revealed";

/** "15 Hiring Contacts and 10 Candidates": the people a first Credit pack reveals from Previews. */
export function revealedPeopleText(people: { hiringContacts: number; candidates: number }): string {
  return `${plural(people.hiringContacts, "Hiring Contact")} and ${plural(people.candidates, "Candidate")}`;
}

/** A paid (non-free) Test Run surfaces 10 Prospects and 10 Candidates. */
export const PAID_TEST_RUN_COST = 10 * PRICES.surfacedProspect + 10 * PRICES.surfacedCandidate;

/** Sourcing for one Detected Role surfaces up to 6 Candidates. */
export const ROLE_SOURCING_MAX_CANDIDATES = 6;
export const ROLE_SOURCING_MAX_COST = ROLE_SOURCING_MAX_CANDIDATES * PRICES.surfacedCandidate;

/** The email kind offered for each person kind (Candidates never get a work email). */
export function emailKindFor(kind: PersonKind): "work_email" | "personal_email" {
  return kind === "candidate" ? "personal_email" : "work_email";
}

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  pack_purchase: "Credit pack",
  auto_top_up: "Auto top-up",
  surfaced_prospect: "Surfaced Prospects",
  surfaced_candidate: "Surfaced Candidates",
  hiring_contact_found: "Hiring Contacts found",
  verified_email: "Verified emails",
  mobile: "Mobile numbers",
  email_sent: "Emails sent",
  free_test_run: "Free Test Run",
};
