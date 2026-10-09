# PROTOTYPE - user flows (throwaway)

This app is throwaway prototype code.
It exists to answer one question, and it must never be promoted to production.

## The question

Do the MVP user flows of Auto Recruit feel right end to end, in the right order, with nothing missing or in the way?

Two sub-questions are explored with switchable variants (`?variant=`):

- **Feed** (`/feed`): A "Table" (dense multi-select table), B "Split" (ranked list with a detail pane), C "Triage" (one item at a time with keyboard shortcuts).
- **Niche setup** (`/onboarding/niche`): A "Chat" (conversation with the setup agent, Niche Profile drafted live beside it), B "Wizard" (stepped form with agent suggestions).

Everything else is one coherent design.

## Run it

From the repo root: `pnpm prototype`, then open http://localhost:3100.

## Ground rules

- The domain language is `CONTEXT.md` at the repo root: every label, button and message uses its terms exactly, and never a word listed under `_Avoid_` (no "lead", "ICP", "token", "blacklist", "inbox" for the Feed, "tone" for Voice Profile, and so on).
- The decisions in `docs/adr/` are product rules the prototype must make visible (see "Domain rules the UI must show").
- The backend is a **dummy**: an in-memory store on the Next.js server, reset on restart. Nothing is real: no Exa, no LLM, no email, no payment.
- The UI only talks to the dummy backend through `fetch` (API-first, ADR-0008). No component imports the store directly.
- A thin banner at the top of every page says: "PROTOTYPE - dummy backend, nothing here is real".
- English UI. Email drafts are in French for French recipients and English otherwise. The Consent Page has a FR/EN toggle.
- All people and companies are fictional. Never use real company or person names.
- Never use the em dash character in code, copy or comments. Use "-" instead.

## Stack

- Next.js 16 (App Router, TypeScript, React 19), Tailwind CSS v4 (`@tailwindcss/postcss`, `@import "tailwindcss";`), no component library, no state library, no other runtime dependency except `lucide-react` for icons.
- In Next.js 16, `params` and `searchParams` passed to pages and route handlers are Promises; client components using `useSearchParams` must sit under a `<Suspense>` boundary. When unsure about an API, read the docs shipped in `node_modules/next/dist/docs/` before guessing.
- System font stack (no `next/font` network fetch).
- Port 3100 for `dev` and `start`.

## Architecture of the dummy backend

- `src/server/store.ts`: the single in-memory state (on `globalThis` so it survives hot reloads), seed scenarios, and every action as a pure-ish function `(state, payload) => result` that mutates the state and appends audit events.
- `src/server/sim.ts`: the simulation engine (advance the simulated day, run agents, send emails within caps, generate replies, apply retention, expire Claims, build the Digest).
- `src/app/api/state/route.ts`: `GET` returns the full state as JSON.
- `src/app/api/actions/[name]/route.ts`: `POST` runs the named action with the JSON body as payload and returns `{ ok, result?, error? }`.
- `src/lib/api.ts` (client): `useAppState()` hook (fetches `/api/state` after mount, refetches every 2 seconds and after every action; returns `null` until loaded) and `act(name, payload)` (typed by an `Actions` map shared from `src/lib/types.ts`).
- Every action name and payload type is declared once in `src/lib/types.ts` so screens get autocompletion.

## Simulated time

- The simulated date lives in state (`clock.today`, ISO `YYYY-MM-DD`), starting on Monday 2026-10-12.
- Real wall-clock time is only used server-side to animate in-progress agent runs (a Test Run takes about 6 seconds, with visible steps: "Searching with Exa", "Extracting Signals", "Judging Fit", "Scoring", "Finding Hiring Contacts").
- Never call `Date.now()`, `new Date()` or `Math.random()` inside React render. Dates come from state as ISO strings and are formatted with the deterministic `formatDate` / `formatRelative(iso, today)` helpers from `src/lib/format.ts`.
- Randomness in the simulation uses a seeded generator in `src/server/sim.ts` so runs are reproducible.

## Simulator bar and State drawer

- Bottom-left, a dark pill (clearly not part of the product design): simulated date, "Advance 1 day", "Advance 7 days", "Run agents now", "Inject reply..." (pick a Contacted recipient and a Reply Category), "Load scenario" (New user, Established workspace), "Reset".
- A "State" button opens a right-hand drawer rendering the full state as readable sections (Workspace and Credits, Niches, counts per lifecycle state, Claims, Sending Mailboxes with ramp and caps, Suppression List, Data Requests, last 30 audit events), with a "What changed" list after each action.
- Bottom-centre, only on routes with variants, the variant switcher pill (left arrow, `A (Table)`, right arrow; keyboard arrows cycle when no input is focused; updates `?variant=` with `router.replace`).

## Data model

Defined once in `src/lib/types.ts`.

- **Workspace**: id, name, plan (`free_trial` | `paid`), credits, autoTopUp, mainDomains, freeTestRunUsedBy (domain).
- **Recruiter**: id, name, email, role (`owner` | `recruiter`).
- **Niche**: id, ownerId, name, status (`draft` | `testing` | `active` | `paused`), profile (NicheProfile), schedule (days, time, prospectsPerRun default 25, candidatesPerRun default 40), setupMessages (chat transcript), testRun (status, startedAtMs, step, items with labels), lastRunOn.
- **NicheProfile**: sectors, companySize {min, max}, locations, roleTypes, seniority, candidateProfile (text), fitThreshold (0-100), signalWeights (type, label, weight, halfLifeDays, enabled, negative), searchStrategy (list of query descriptions).
- **Signal**: id, type, label, date, evidenceUrl, points (the weight before decay). Prospect types: `job_posting`, `job_posting_stale` (open more than 30 days or reposted), `funding_round`, `new_leader`, `headcount_growth`, `expansion`, `layoffs` (negative). Candidate types: `tenure_sweet_spot`, `employer_turbulence`, `title_stagnation`, `recently_started` (negative), `recently_promoted` (negative).
- **Signal Strength** = clamp(0, 100, sum of points x 0.5^(ageDays / halfLifeDays)), computed by the store and returned with a per-Signal breakdown so the UI can explain every score line by line.
- **Prospect**: id, nicheIds, name, domain, sector, headcount, location, latestFunding, fit, signals, signalStrength, breakdown, detectedRoleIds, hiringContactIds, status (`surfaced` | `dismissed` | `in_campaign` | `replied` | `closed`), closedUntil, dismissReason, hasNewSignal, surfacedOn.
- **Detected Role**: id, prospectId, title, postedOn, sourceUrl, stale, sourcedCandidateIds.
- **Hiring Contact**: id, prospectId, name, title, rank (1-3), lifecycle, contactValues, claim, profileUrl.
- **Candidate**: id, nicheIds, name, headline, currentTitle, currentEmployer, location, tenureMonths, workHistory, fit, signals, signalStrength, breakdown, lifecycle, contactValues, surfacedOn, deleteOn (surfacedOn + 25 days while not Contacted), consent (`talent_pool` | `this_opportunity` | `delete` | null), consentRecordedOn, retainUntil (90 days after the first email without Consent, not extended by a reply; 2 years from the Talent Pool choice), article14NoticeSentOn, claim, forDetectedRoleId, profileUrl, dismissReason.
- **Lifecycle**: `surfaced` | `dismissed` | `enriched` | `contacted` | `replied` | `consented` | `suppressed`.
- **Preview**: in the free trial, Hiring Contacts and Candidates are never shown with identity: only an anonymised one-line summary (for example "Senior Backend Engineer, 6 years, fintech, Paris - strong move signals") plus counts. Revealed on the first Credit purchase and charged then at the normal price, per Hiring Contact found and per Surfaced Candidate, taken from the pack; the checkout shows that cost before payment (ADR-0018).
- **Contact value**: id, kind (`work_email` | `personal_email` | `mobile`), value, verification (`valid` | `catch_all` | `invalid` | `unverified`), provenance {provider (`exa` | `dropcontact` | `fullenrich` | `bettercontact`), method (`cited_public_page` | `pattern_and_smtp_check` | `provider_waterfall`), sourceUrl, foundOn}.
- **Claim**: recruiterId, campaignId, since, expiresOn (90 days after last activity).
- **Campaign**: id, nicheId, ownerId, name, audience (`hiring_contacts` | `candidates`), brief {angle, callToAction, detectedRoleId}, sequence (1 to 3 steps with delayDays), sendingWindow {days, start, end, recipientTimezone: true}, autonomy (`review_all` | `review_first_n` | `auto`), reviewFirstN, mailboxIds, autoAddRule {minSignalStrength} or null, status (`draft` | `active` | `paused`).
- **Recipient**: id, campaignId, personKind, personId, mailboxId, state (`awaiting_review` | `scheduled` | `sent` | `replied` | `stopped`), currentStep, messages, stopReason.
- **Message**: id, step, language, subject, body, footer, status (`draft` | `approved` | `sent`), sentOn, editedByRecruiter.
- **Reply**: id, recipientId, receivedOn, body, category (`interested` | `not_now` | `not_interested` | `opt_out` | `out_of_office` | `referral` | `bounce`), suggestedNextStep, draftResponse, handled, responseSentOn.
- **Sending Mailbox**: id, recruiterId, address, provider (`google` | `microsoft`), domain, health {spf, dkim, dmarc, domainAgeDays, blocklisted}, rampDay, dailyCap, sentToday, status (`warming` | `active` | `paused` | `refused`), statusReason.
- **Voice Profile**: recruiterId, language (`fr` | `en`), source (`mailbox_scan` | `pasted_examples`), styleGuide (bullet list), examples, learnedFromEdits.
- **Credit ledger entry**: id, on, delta, reason, ref.
- **Suppression List entry**: hash (displayed truncated), addedOn, reason, scope (`all_workspaces`).
- **Data Request**: id, personQuery, receivedOn, dueOn (+30 days), kind (`access` | `export` | `delete`), status, resolution.
- **Audit event**: id, on, actor, action, target.
- **Digest**: on, sections (new replies by Reply Category with suggested next step, best new Feed items, Sending Mailbox health, Credits remaining, Candidates deleted by retention).

## Placeholder Credit prices

Shown with a "placeholder price" hint, kept in one config object in `src/lib/pricing.ts`: Surfaced Prospect 1, Surfaced Candidate 1, Hiring Contact found 1, verified email 2, mobile 8, email sent 1, free Test Run 0 (once per company domain).
Revealing the free Test Run's people on the first Credit purchase is not free: each revealed Hiring Contact and Candidate is charged at these prices, after the pack's Credits are added.
Credit packs: 500, 2 000, 10 000.

## Seed scenarios

- **New user**: nothing exists; the app starts on the landing page.
- **Established workspace** (default after sign-up shortcuts): Workspace "Atelier Talent" (paid, 1 840 Credits), Owner Vincent Baron, Recruiter Camille Martin; Niches "Fintech backend engineers - Series A-C - Paris" (active) and "Healthtech product designers - remote EU" (active); about 25 Prospects and 40 Candidates in the Feed with varied Signals, ages and one with a new Signal; 3 Detected Roles; 2 active Campaigns (one to Hiring Contacts, one to Candidates) with recipients in every state and 6 unhandled replies covering every Reply Category; 3 Sending Mailboxes on lookalike domains (one warming on ramp day 6, one active, one paused for bounces) plus one refused because it is on the Main Domain; a French and an English Voice Profile; one open Data Request due in 9 days; a Suppression List with 4 entries; one Candidate claimed by Camille.

## Simulation rules (Advance 1 day)

1. Move the clock one day.
2. For each active Niche whose schedule includes the new weekday: surface new Prospects and Candidates from a seeded pool, only those above the Fit threshold, charge Credits per Surfaced item, add a new Signal to one or two existing Prospects (`hasNewSignal`), recompute Signal Strength. Stop cleanly and say so when Credits run out.
3. Delete Candidates whose `deleteOn` has passed and who were never Contacted (audit event and Digest line "deleted under the 25-day retention rule"), and Candidates whose `retainUntil` has passed: 90 days after the first email without Consent, or the end of the consented period (2 years for the Talent Pool).
4. For each active Campaign, send due messages within Sending Mailbox caps (ramp from 5 per day to 30 per mailbox over about 21 days, 60 per domain per day), weekdays only, in the sending window; follow-ups after their delay; never message a recipient who replied, bounced or is on the Suppression List; one Hiring Contact per Prospect in an active Sequence at a time; a reply from anyone at a Prospect stops all outreach to that Prospect.
5. Generate scripted replies for some recipients after 1 to 4 days, deterministic per recipient, covering every Reply Category.
6. Apply automatic effects: Opt-out adds to the Suppression List immediately, and for a Candidate also deletes their data at once (only the hash is kept, as with "Delete my data" on the Consent Page), while a Hiring Contact stays stored as suppressed B2B prospect data; Bounce marks the email invalid, tries the next provider (charging Credits only if found) and pauses the mailbox if its bounce rate goes over 3%; Out of Office pauses the Sequence until the return date; Referral proposes the referred person as a new Hiring Contact; Not interested closes the Prospect for 6 months or stops the Candidate (data deleted, hash kept).
7. Advance mailbox ramps, expire Claims inactive for 90 days, build the Digest.

## Domain rules the UI must show

- The Feed ranks by Signal Strength among items above the Fit threshold, and every score has a line-by-line explanation (ADR-0006).
- In the free trial, Hiring Contacts and Candidates are Previews only; Enrichment and Campaigns lead to buying Credits. Revealing them on the first pack is charged at the normal price, and the checkout says so before payment (ADR-0018).
- Enrichment is a Recruiter's explicit multi-select. Mobile numbers are ticked per person, never by default. Every contact value shows its Provenance (ADR-0005).
- Candidates are never emailed at their current employer's address: work emails are not offered for Candidates.
- A Surfaced Candidate shows a retention countdown ("deleted in 18 days unless contacted").
- Candidate and Hiring Contact are never linked, even for the same human (ADR-0003). Nothing in the UI suggests merging them.
- Adding someone to a Campaign creates a Claim; people claimed by another Recruiter show "Claimed by Camille Martin" and cannot be added.
- Every email shows its footer: sender identity and one-click opt-out on all emails, the Article 14 Notice on emails to Candidates, and a short AI-assistance note (ADR-0002, ADR-0005).
- In the app, our agents never send a reply: the Recruiter sends it, with the drafted response pre-filled (ADR-0002). Replies to Candidates include the Consent Page link.
- Opt-outs land on the Suppression List and apply across all Workspaces. A Candidate who opts out is deleted immediately and only the hash is kept (ADR-0019).
  Once a Candidate is deleted, by any path, nothing stored names them any more: audit events, Digests, the chat, the Credit ledger and their emails say "Deleted Candidate"; an open Data Request keeps the requester's name and address until it is answered.
- Sending Mailboxes on a Main Domain are refused with an explanation; caps are 30 per mailbox and 60 per domain per day; new mailboxes ramp up; the setup discloses the Google Workspace / Microsoft 365 terms risk (ADR-0017).
- Signing in never asks for mailbox access; connecting a Sending Mailbox or scanning for the Voice Profile is a separate consent (ADR-0014).
- Every Credit-spending action shows its cost before confirming, including from the chat panel.

## Screens and routes

| Route | Owner agent | Must contain |
|---|---|---|
| `/` | setup | Landing: one-sentence pitch, "Start free with Google" / "with Microsoft" (work accounts only), what the free Test Run gives |
| `/signup` | setup | Fake OAuth consent (identity scopes only), Workspace name, Main Domain declaration, then to Niche setup |
| `/onboarding/niche` | setup | Variant A Chat, Variant B Wizard; both end with a drafted Niche Profile and "Review Niche Profile" |
| `/niches` | setup | List of Niches with status, schedule, last run, per-run volumes, Credits used last 7 days |
| `/niches/[id]` | setup | Niche Profile review and edit (sectors, sizes, locations, roles, candidate profile, Fit threshold slider, Signal weights table with enable, weight, half-life), schedule and per-run volumes, activate / pause, "Launch free Test Run" when not used |
| `/niches/[id]/test-run` | testrun | Live agent steps while running; results: 10 Prospects in full with Signals and Detected Roles, Hiring Contacts and Candidates as Previews in the free trial; good / bad labels; proposed Niche Profile adjustments to accept; "Buy Credits to reveal people and switch agents on" |
| `/credits` | testrun | Balance, packs (fake Stripe checkout with VAT line), auto top-up toggle, placeholder price list, ledger grouped by day and reason |
| `/feed` | feed | Variants A/B/C; tabs Prospects / Candidates; Niche filter; Signal Strength and Fit with explanation; new-Signal badge; retention countdown on Candidates; Detected Role chips; multi-select Enrich and Dismiss (with reason); Claim badges; Previews in free trial |
| `/prospects/[id]` | people | Company facts, Signals timeline with evidence links, Signal Strength breakdown, Detected Roles with "Source for this role", up to 3 ranked Hiring Contacts with Enrich and Claim state, activity and audit trail |
| `/candidates/[id]` | people | Profile, work history, Signals, Fit, contact values with Provenance and verification, retention countdown or Consent status, Article 14 Notice status, Claim, campaigns, Data Request shortcut |
| `/campaigns` | campaigns | List with audience, status, recipients per state, replies, mailboxes |
| `/campaigns/new` | campaigns | Steps: Niche and audience, Brief (angle, call to action, optional Detected Role), Sequence (1-3 steps, delays), Sending Mailboxes and window, autonomy (review all / review first N / automatic), recipients (from Enriched people; auto-add rule by Signal Strength), draft preview for three recipients with footer, launch |
| `/campaigns/[id]` | campaigns | Recipients table by state, review queue (approve, edit then approve; edits count toward the Voice Profile), per-recipient thread, pause / resume |
| `/inbox` | inbox | Replies grouped or filtered by Reply Category, the thread, suggested next step, drafted response editable, "Send" by the Recruiter, recategorize, automatic effects explained (Suppression List, paused until date, proposed Hiring Contact, next provider tried) |
| `/digest` | inbox | The daily Digest rendered as the email the Recruiter receives |
| `/consent/[token]` | inbox | Public Candidate-facing page in the Workspace's name, FR/EN, three choices, confirmation, no app chrome |
| `/settings/mailboxes` | settings | Sending Mailboxes with health, ramp, caps and status; "Connect a mailbox" (Google / Microsoft consent, Main Domain refusal); assisted setup (lookalike domain registered in your name, DNS configured, mailboxes created in your own tenant via admin consent); terms-risk disclosure |
| `/settings/voice` | settings | Voice Profiles FR / EN, read-only mailbox scan consent, style guide, examples, edits learned, paste examples |
| `/settings/team` | settings | Members and roles, invite a Recruiter, Niche ownership |
| `/settings/api` | settings | API Keys acting for a named Recruiter, create / revoke, MCP server URL and how AI clients connect |
| `/settings/privacy` | settings | Data Requests with due dates (find person, export with Provenance, delete keeping the hash), Suppression List, audit log |
| chat panel (all pages) | chat | Slide-over "Ask" panel; canned agent that can answer and act ("find 10 more fintechs like Fintory", "enrich these 5", "draft a Campaign for my fintech Niche"), always confirming Credit-spending or contacting actions with their cost |

## File ownership

- **foundation**: everything outside the route folders below, including `package.json`, configs, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/**`, `src/server/**`, `src/lib/**`, `src/components/ui/**`, `src/components/shell/**`, `src/components/domain/**`, and the stub `src/components/chat/chat-panel.tsx`. It also creates a placeholder `page.tsx` for every route.
- **Screen agents** own only their routes' `page.tsx` files (and any other files inside those route folders) plus `src/components/screens/<area>/**`. They read everything but never edit files they do not own; when they need a new store action or shared component they write it locally or list it as a need.
- **chat** owns `src/components/chat/**`.

## Design direction

- Calm, dense, professional SaaS (think Linear or Attio): neutral zinc greys, one indigo accent, generous but efficient spacing, 14px base text, clear hierarchy, tabular numbers for scores and Credits.
- Left sidebar: Feed, Inbox (with unhandled count), Campaigns, Niches, Credits; Settings group (Sending Mailboxes, Voice Profile, Team, API & MCP, Data & privacy). Top bar: Workspace name, simulated date, Credits balance, "Ask" button.
- Empty, loading and error states for every list. Loading renders the same skeleton on server and client (`useAppState()` returns `null` until mounted).
- Works at 1280px and above; at 390px the layout must not overflow horizontally (sidebar collapses).
- No hydration mismatches: no `typeof window` branches in render, no non-deterministic values in render, locale-independent formatting, valid HTML nesting.

## Flows to walk through

1. New user: landing, sign up with Google, Niche setup (both variants), Niche Profile edit, free Test Run, labels, adjustments, paywall, buy Credits (the checkout shows the reveal cost), people revealed and charged, schedule, activate.
2. Daily triage: Feed (all three variants), explanations, select five Candidates, Enrich with one mobile ticked, Credits charged, Provenance visible, Dismiss with reason.
3. Detected Role: Prospect detail, "Source for this role", sourced Candidates, enrich a Hiring Contact.
4. Campaign to Hiring Contacts: create with a Detected Role in the Brief, review the first drafts, edit one, launch, advance days, sends within caps, replies.
5. Campaign to Candidates: footer with the Article 14 Notice, no work emails offered.
6. Inbox: every Reply Category, send a drafted response to an Interested Candidate (with Consent Page link), recategorize one, see automatic effects.
7. Consent Page: open from the reply, choose Talent Pool, Candidate becomes Consented with a 2-year retention.
8. Digest after advancing a day.
9. Sending Mailboxes: assisted setup, Main Domain refusal, ramp, auto-pause.
10. Voice Profile scan and edits learned.
11. Team, Claims, API Keys and MCP.
12. Data Request: find, export with Provenance, delete keeping the hash, audit log.
13. Chat panel: find more Prospects with a confirmed Credit cost.
14. Retention: advance 25 days, never-Contacted Candidates are deleted and the Digest says so.
