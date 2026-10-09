// Pure helpers: where the Recruiter is, what "these" means, and which prompts to suggest.
// Everything is derived from the state and the pathname, so it renders identically on server and client.

import type { ActionName, ClientState, FeedItemRef, Prospect } from "@/lib/types";
import { plural } from "@/lib/format";
import { MCP_TOOL_NAMES } from "@/lib/labels";

export interface ChatContext {
  /** Where the Recruiter is: "Feed", "Fintory", "Campaigns"... */
  pageLabel: string;
  /** Sent with every message so "enrich these" acts on the right people. */
  selection: FeedItemRef[];
  /** Short explanation of `selection` for the context bar, null when nothing is selected. */
  selectionLabel: string | null;
  /** Prompts the canned agent understands, adapted to the page. */
  suggestions: string[];
}

const STATIC_PAGES: [RegExp, string][] = [
  [/^\/feed(\/|$)/, "Feed"],
  [/^\/inbox(\/|$)/, "Inbox"],
  [/^\/digest(\/|$)/, "Digest"],
  [/^\/campaigns\/new(\/|$)/, "New Campaign"],
  [/^\/campaigns\/?$/, "Campaigns"],
  [/^\/niches\/?$/, "Niches"],
  [/^\/credits(\/|$)/, "Credits"],
  [/^\/onboarding(\/|$)/, "Niche setup"],
  [/^\/settings\/mailboxes(\/|$)/, "Sending Mailboxes"],
  [/^\/settings\/voice(\/|$)/, "Voice Profile"],
  [/^\/settings\/team(\/|$)/, "Team"],
  [/^\/settings\/api(\/|$)/, "API & MCP"],
  [/^\/settings\/privacy(\/|$)/, "Data & privacy"],
  [/^\/signup(\/|$)/, "Sign up"],
  [/^\/?$/, "Home"],
];

function routeParam(pathname: string, pattern: RegExp): string | null {
  const m = pathname.match(pattern);
  return m ? decodeURIComponent(m[1]) : null;
}

/** "fintechs" for a Fintech Prospect, "companies" otherwise (the agent matches on the company name). */
function companyWord(p: Prospect): string {
  return /tech$/i.test(p.sector) ? `${p.sector.toLowerCase()}s` : "companies";
}

function claimedByOther(claim: { recruiterId: string } | null, meId: string | null): boolean {
  return claim !== null && claim.recruiterId !== meId;
}

export function chatContext(state: ClientState | null, pathname: string, feedSelection: FeedItemRef[]): ChatContext {
  const path = pathname || "/";
  if (!state) return { pageLabel: pageLabelOnly(path), selection: [], selectionLabel: null, suggestions: [] };

  const meId = state.derived.currentRecruiter?.id ?? null;
  const hasWorkspace = state.workspace !== null;
  // The free trial only shows Previews, and the agent refuses anything that spends Credits or
  // drafts Campaigns (ADR-0018): never suggest those prompts there.
  const freeTrial = state.derived.isFreeTrial;
  const suggestions: string[] = [];
  let pageLabel = pageLabelOnly(path);
  let selection: FeedItemRef[] = [];
  let selectionLabel: string | null = null;

  // Entity pages.
  const prospectId = routeParam(path, /^\/prospects\/([^/]+)/);
  const candidateId = routeParam(path, /^\/candidates\/([^/]+)/);
  const campaignId = routeParam(path, /^\/campaigns\/([^/]+)/);
  const nicheId = routeParam(path, /^\/niches\/([^/]+)/);

  const prospect = prospectId ? state.prospects.find((p) => p.id === prospectId) : undefined;
  const candidate = candidateId ? state.candidates.find((c) => c.id === candidateId) : undefined;
  const campaign = campaignId && campaignId !== "new" ? state.campaigns.find((c) => c.id === campaignId) : undefined;
  const niche = nicheId ? state.niches.find((n) => n.id === nicheId) : undefined;

  if (prospect) {
    pageLabel = prospect.name;
    const contacts = state.hiringContacts
      .filter((h) => h.prospectId === prospect.id && h.lifecycle === "surfaced" && !h.proposed && !claimedByOther(h.claim, meId))
      .sort((a, b) => a.rank - b.rank);
    if (contacts.length > 0) {
      selection = contacts.map((h) => ({ kind: "hiring_contact", id: h.id }));
      selectionLabel = `${plural(contacts.length, "Hiring Contact")} at ${prospect.name}`;
      if (!freeTrial) suggestions.push(`Enrich the Hiring Contacts at ${prospect.name}`);
    }
    if (!freeTrial) suggestions.push(`Find 10 more ${companyWord(prospect)} like ${prospect.name}`);
    suggestions.push(`Explain why ${prospect.name} is ranked here`);
  } else if (candidate) {
    pageLabel = candidate.name;
    if (candidate.lifecycle === "surfaced" && !claimedByOther(candidate.claim, meId)) {
      selection = [{ kind: "candidate", id: candidate.id }];
      selectionLabel = candidate.name;
      if (!freeTrial) suggestions.push("Enrich this Candidate (email only)");
    }
    suggestions.push(`Explain why ${candidate.name} is a good Fit`);
  } else if (campaign) {
    pageLabel = campaign.name;
  } else if (niche) {
    pageLabel = /\/test-run(\/|$)/.test(path) ? `Test Run - ${niche.name}` : niche.name;
  }

  // An explicit multi-select (Feed rows) always wins over what the page implies.
  if (feedSelection.length > 0) {
    selection = feedSelection;
    const people = feedSelection.filter((s) => s.kind !== "prospect");
    const companies = feedSelection.filter((s) => s.kind === "prospect");
    selectionLabel = `${formatSelected(people.length, companies.length)} selected`;
    if (!freeTrial) {
      if (people.length > 0) suggestions.unshift(`Enrich these ${people.length}`);
      const firstCompany = companies.length > 0 ? state.prospects.find((p) => p.id === companies[0].id) : undefined;
      if (firstCompany) suggestions.unshift(`Find 10 more ${companyWord(firstCompany)} like ${firstCompany.name}`);
    }
  }

  if (hasWorkspace) {
    // On a Prospect page the page's own prompts already cover "find more like" and "explain why".
    // The first Prospect comes from the server's ranking, so the chip names the one the agent and the Feed put first.
    const topId = state.derived.rankedProspectIds[0];
    const top = prospect || !topId ? undefined : state.prospects.find((p) => p.id === topId);
    if (top) {
      if (!freeTrial) suggestions.push(`Find 10 more ${companyWord(top)} like ${top.name}`);
      suggestions.push(`Explain why ${top.name} is ranked first`);
    }
    if (freeTrial) {
      suggestions.push("What does the free trial include?");
      suggestions.push("How do I buy Credits?");
    } else {
      // With nothing selected, the agent enriches the top Surfaced Candidates of the Recruiter's own Niches,
      // never one claimed by someone else. With a selection (Feed rows, the Hiring Contacts of a Prospect
      // page, a Candidate page) it enriches that selection instead, so the prompt would not mean what it says.
      const myNicheIds = new Set(state.niches.filter((n) => n.ownerId === meId).map((n) => n.id));
      const canEnrichTop = state.candidates.some(
        (c) => c.lifecycle === "surfaced" && c.fit.aboveThreshold && c.nicheIds.some((id) => myNicheIds.has(id)) && !claimedByOther(c.claim, meId),
      );
      if (selection.length === 0 && canEnrichTop) suggestions.push("Enrich the top 5 Candidates");
      const workingNiches = state.niches.filter((n) => n.status === "active" || n.status === "testing");
      const myNiche = (niche && workingNiches.includes(niche) ? niche : undefined) ?? workingNiches.find((n) => n.ownerId === meId) ?? workingNiches[0];
      const sector = myNiche?.profile.sectors[0]?.toLowerCase();
      if (myNiche && sector) suggestions.push(`Draft a Campaign for my ${sector} Niche`);
      const unhandled = state.derived.unhandledReplies;
      if (unhandled > 0) suggestions.push(`Summarise my ${plural(unhandled, "unhandled reply", "unhandled replies")}`);
      suggestions.push("How many Credits do I have?");
    }
  } else {
    suggestions.push("What can you do?");
  }

  return { pageLabel, selection, selectionLabel, suggestions: dedupe(suggestions).slice(0, 6) };
}

function pageLabelOnly(path: string): string {
  for (const [pattern, label] of STATIC_PAGES) if (pattern.test(path)) return label;
  if (/^\/prospects\//.test(path)) return "Prospect";
  if (/^\/candidates\//.test(path)) return "Candidate";
  if (/^\/campaigns\//.test(path)) return "Campaign";
  if (/^\/niches\//.test(path)) return "Niche";
  return "Auto Recruit";
}

function formatSelected(people: number, companies: number): string {
  const parts: string[] = [];
  if (people > 0) parts.push(plural(people, "person", "people"));
  if (companies > 0) parts.push(plural(companies, "Prospect"));
  return parts.join(" and ");
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The MCP tool the panel calls (ADR-0008), named as on the API & MCP page: "enrich" -> "enrich_people". */
export function toolName(actionName: ActionName): string {
  return MCP_TOOL_NAMES[actionName] ?? actionName.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
