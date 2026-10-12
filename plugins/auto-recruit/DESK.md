# The desk

The desk is the repo the Recruiter runs Auto Recruit from: plain markdown files, one fact in one place, nothing else.
Every skill of this plugin reads and writes these files and keeps them in the formats below.
A file is created the first time it has content.

## Files

| File | Holds | Written by |
|---|---|---|
| `niches/<slug>.md` | One Niche Profile and its two Pitches | `niche`, refined by `batch` |
| `CALL_LIST.md` | Who is called next, and when | `batch`, `call` |
| `prospects/<domain-slug>.md` | One Prospect: its Signals, Detected Roles and Hiring Contacts, each with phone, Call Sheet and Attempts | `batch`, `call` |
| `candidates/<name-slug>.md` | One Candidate: Signals, phone, Call Sheet and Attempts | `batch`, `call` |
| `batches/<niche-slug>.md` | The open Batch of a Niche, until every person in it is applied | `batch` |
| `SKIPPED.md` | People never to propose again, with the reason | `batch` |
| `DO_NOT_CALL.md` | People and Prospects never to call again | `call` |
| `TODO.md` | The Recruiter's tasks that are not calls | `call` |

`CALL_LIST.md` owns the queue (who and when); a person's file owns who they are and what happened.
A person leaves the Call List without leaving their file: the history stays.

## Identity

- A person is known by their LinkedIn URL, written `https://www.linkedin.com/in/<handle>`.
- A Prospect is known by its domain (`acme.com` lives in `prospects/acme-com.md`).
- Before proposing anyone, search the whole desk for their LinkedIn URL: a person found in `prospects/`, `candidates/`, `batches/`, `SKIPPED.md` or `DO_NOT_CALL.md` is known and is never proposed again.
- A Prospect is ruled out, and none of its people is proposed as a Hiring Contact, when it is in `SKIPPED.md` (searched once and not chosen), in `DO_NOT_CALL.md`, or already has a file in `prospects/`.
- A Batch proposes at most one Hiring Contact per Prospect.
- A Candidate and a Hiring Contact are separate records even when they are the same human.
- Phone numbers are written in international format (`+33612345678`), followed by where and when they were found: `+33612345678 (Exa, 2026-10-12)`.
- A person without a working number stays on the Call List, and their file says why: `Phone: not found (Exa, 2026-10-12)` or `Phone: wrong, was +33612345678 (Recruiter, 2026-10-13)`.
  A number the Recruiter finds elsewhere replaces it as `+33612345678 (Recruiter, 2026-10-14)`.

## Dates

Get today's date and time from the shell (`date "+%Y-%m-%d %H:%M %A"`); never assume it.
A due slot is a date plus `am` (before 13:00), `pm` (from 14:00) or an exact `HH:MM`: `2026-10-13 pm`, `2026-10-15 15:00`.
Working days are Monday to Friday.

## `CALL_LIST.md`

```md
# Call List

Updated 2026-10-12 18:40.

## Hiring Contacts

| # | Who | Prospect | Due | Why Now |
|---|---|---|---|---|
| 1 | Léa Morel, CTO | [Acme](prospects/acme-com.md) | 2026-10-13 10:00 | Callback she asked for |
| 2 | Paul Girard, Head of Talent | [Nexo](prospects/nexo-io.md) | 2026-10-13 am | Posted 2 FDE roles in September after a Series B |

## Candidates

| # | Who | Now | Due | Why Now |
|---|---|---|---|---|
| 3 | [Hugo Martin](candidates/hugo-martin.md) | Solutions Engineer, Qonto | 2026-10-13 am | 3 years in role, team just reorganised |
```

- One numbering runs across both sections, so `call 3` is never ambiguous.
- In each section, rows are sorted by Due; among rows due in the same slot, the strongest and freshest Why Now comes first.
- Renumber and update the `Updated` line every time the file is rewritten.

## `prospects/<domain-slug>.md`

```md
# Acme

acme.com - AI infrastructure, 120 people, Paris - Niche: fde
Parked until 2026-04-14 (Not Interested from Léa Morel)

## Signals

- 2026-09-30 - Posted "Forward Deployed Engineer", Paris - https://...
- 2026-08-12 - Series B, 30 M€ - https://...

## Detected Roles

- Forward Deployed Engineer, Paris, posted 2026-09-30 - https://...

## Hiring Contacts

### Léa Morel - CTO

- LinkedIn: https://www.linkedin.com/in/leamorel
- Phone: +33612345678 (Exa, 2026-10-12)
- Why Now: Two FDE postings since the Series B, no FDE on the team yet.

#### Call Sheet

- Who: CTO since 2021, ex-Datadog, hires the engineers herself.
- Opener: "Bonjour Léa, Vincent Baron. J'ai vu vos deux postes de FDE depuis la série B: je place des FDE, j'ai deux minutes?"
- Angle: she has no FDE yet, so the first hire defines the role; offer two profiles who did it before.
- Watch for: "we hire directly" - answer from the Pitch.

#### Attempts

- 2026-10-12 11:05 - No Answer
- 2026-10-12 16:40 - Callback: in a meeting, call back Tuesday 10:00
```

The `Parked until` line exists only while the Prospect is parked.

## `candidates/<name-slug>.md`

```md
# Hugo Martin

- LinkedIn: https://www.linkedin.com/in/hugomartin
- Phone: +33698765432 (Exa, 2026-10-12)
- Now: Solutions Engineer at Qonto since 2023, Paris
- Niche: fde
- Why Now: 3 years in role, and Qonto reorganised the solutions team in September.

## Signals

- 2026-09-18 - Qonto reorganises its solutions team - https://...
- 2023-09 - Joined Qonto as Solutions Engineer - https://...

## Call Sheet

- Who: ex-backend engineer turned client-facing, Python and TypeScript.
- Opener: "..."
- Angle: ...
- Watch for: ...

## Attempts

- 2026-10-13 10:20 - Voicemail (voicemail left)
```

## `niches/<slug>.md`

```md
# Forward Deployed Engineers - Paris

Calls in: French

## Prospects

Sectors, size, stage and locations, and the Signals that say they are hiring.

## Hiring Contacts

The titles to call at a Prospect, in order of preference.

## Candidates

Current titles and employers, seniority, skills, locations, the Signals that say they would move, and who to exclude.

## Pitch to Hiring Contacts

- Who I am:
- What I offer:
- The ask:
- Objections: each usual objection with its answer.

## Pitch to Candidates

- Who I am:
- What I offer:
- The ask:
- Objections:
```

Every criterion is concrete enough to check against one profile ("3+ years in a client-facing engineering role"), never a quality ("strong engineers").

## `batches/<niche-slug>.md`

```md
# Batch - fde-paris

Started 2026-10-12 18:20.
Status: Approved
Search run: run_8f2c...
Phone run: run_91ab...

## Hiring Contacts

### 1. Léa Morel, CTO at Acme (Paris)

- LinkedIn: https://www.linkedin.com/in/leamorel
- Prospect: acme.com - AI infrastructure, 120 people, Paris
- Why Now: Two FDE postings since the Series B in August.
- Signals:
  - 2026-09-30 - Posted "Forward Deployed Engineer", Paris - https://...
  - 2026-08-12 - Series B, 30 M€ - https://...
- Detected Roles:
  - Forward Deployed Engineer, Paris, posted 2026-09-30 - https://...
- Decision: Applied

## Candidates

### 2. Marc Dupuis, Solutions Engineer at Alan (Paris)

- LinkedIn: https://www.linkedin.com/in/marcdupuis
- Why Now: 3 years in role, and Alan was acquired in September.
- Signals:
  - 2026-09-10 - Alan acquired by ... - https://...
- Decision: Dropped - too junior
```

- A Niche has at most one open Batch; the file is deleted once every person in it is `Applied`.
- Status moves `Searching` (the Search run is still going), `Proposed` (being reviewed one person at a time; the Batch becomes `Approved` when the last person is decided), `Approved` (phone numbers and Call List being written).
- A person's Decision moves from `Surfaced` to `Dropped` (followed by ` - <reason>` when the Recruiter gave one) or `Approved`, then to `Applied` once their outcome is in `SKIPPED.md` or in their own file and the Call List.
- The numbers are the ones shown to the Recruiter and never change while the Batch is open.

## `SKIPPED.md`, `DO_NOT_CALL.md`, `TODO.md`

```md
# Skipped

- 2026-10-12 - Marc Dupuis - https://www.linkedin.com/in/marcdupuis - fde - too junior
- 2026-10-12 - Prospect nexo.io - fde - agency, not a fit
```

```md
# Do Not Call

- 2026-10-14 - Sophie Leroy - https://www.linkedin.com/in/sophieleroy - asked never to be called again
- 2026-10-15 - Prospect nexo.io - Head of Talent asked that nobody at Nexo is called
```

`TODO.md` follows the format the Recruiter already uses when the file exists; otherwise it starts as a `# TODO` title over a `## To do` list, one task per line, with the person's file linked.
