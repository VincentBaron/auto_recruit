---
name: batch
description: Find new Hiring Contacts and Candidates for a Niche with Exa, propose them as a Batch for the Recruiter to prune and approve, then find their phone numbers and put them on the Call List. Use when the Recruiter wants more people to call, the Call List runs low, or they want to get back to a Batch left open in an earlier session.
argument-hint: "<niche-slug> [hiring contacts | candidates] [size, default 20] | --resume [niche-slug]"
allowed-tools: Bash(date *)
---

You build one Batch for one Niche, get the Recruiter's approval, and turn the approved people into Call List entries ready to dial.
Read [`../../DESK.md`](../../DESK.md) first: it holds the desk's files, identity rules and formats, including the Batch file `batches/<niche-slug>.md`.
Then read `niches/<slug>.md`; when the Niche does not exist, run the `niche` skill first.

The Batch file is how a Batch survives the end of a session: write every step to it as it happens, never only to the chat.

## 0. Resume an open Batch

List `batches/`.
With `--resume`, open the Batch of the given Niche, or the only open one; when several are open and none is named, list them (Niche, Status, how many people still Surfaced) and ask which.
Without `--resume`, when the Niche already has an open Batch, resume it instead of searching again, and say so in one line.

Pick up at the Batch's Status:

- `Searching`: call `agent_run` again with the saved Search run id until it finishes, then go on to step 1's ranking. In the Telegram bot stop once the Batch is `Proposed`: the bot tells the Recruiter it is ready. From Claude Code go on to step 2.
- `Proposed`: go on with the review (step 2) at the first person still `Surfaced`; the decisions already recorded stay.
- `Approved`: go to step 3; people already `Applied` are done, and a saved Phone run id is polled, never run again.

## 1. Search

Search with the Exa MCP tools: `agent_run` builds structured lists of people and companies (ask for name, title, company, domain, location, LinkedIn URL and dated Signals with their source URL, never phone numbers at this stage); `web_search_advanced_exa` checks Signals (`news` for funding, hires and reorganisations, general search for job postings).
As soon as `agent_run` returns a run id, create `batches/<niche-slug>.md` with Status `Searching` and the Search run id.
When `agent_run` returns a run still in progress, call it again with its `runId` until it finishes.
Pass every LinkedIn URL already in the desk and the domain of every ruled-out Prospect as exclusions, then drop anyone and any Prospect the identity rules say is known: Exa's exclusion is not a strict guarantee.

- **Hiring Contacts**: find Prospects with a fresh hiring Signal for the Niche's roles first, then the one best Hiring Contact at each (the Niche's titles, in order): never two people from the same Prospect.
- **Candidates**: find people who match the Niche's Candidate criteria and carry a Signal that they would move.

Keep the people whose Signals are dated and sourced, rank them by judgement (strongest and freshest Signals first), and write each a Why Now: one plain sentence naming the dated facts.
Write them all to the Batch file, each `Surfaced`, and set its Status to `Proposed`.

## 2. Review, one person at a time

Show one person at a time, in the order of the Batch file, never the whole list: on a phone a long list does not fit one screen.
Each card is `4/20`, the name, title and company, the Why Now, and the full LinkedIn URL (`https://` included) so the Recruiter can open it straight from the chat:

```
4/20
Léa Morel
CTO, Acme (Paris)
Two FDE postings since the Series B in August
https://www.linkedin.com/in/leamorel
```

Ask `keep, skip, or keep the rest?` and wait.
In the Telegram bot the bot itself shows the cards with **Keep**, **Skip** and **Keep the rest** buttons and writes each decision to the Batch file; from Claude Code you show the cards and write them yourself.

- **Keep**: set the person's Decision to `Approved` and show the next card.
- **Skip**: set it to `Dropped`, then ask `why? (optional)`; the Recruiter answers with a reason or "no reason".
  Record the reason on the Decision line (`Dropped - too junior`) the moment it is given.
  Say that skipping a Hiring Contact skips their Prospect too, so it is never searched again.
- **Keep the rest**: set every person still `Surfaced` to `Approved` and end the review.

Write each decision to the Batch file as it happens: a review that stops resumes at the first person still `Surfaced`, with the position counted over the whole Batch.
When no one is `Surfaced` any more, set the Status to `Approved`; no extra "go" is needed.
Done when every person is `Approved` or `Dropped`.

## 3. Apply the Recruiter's choices

Mark each person `Applied` in the Batch file as soon as their outcome below is written to the desk, so a resumed Batch never repeats it.

1. Add each dropped person to `SKIPPED.md` with the reason.
   For a dropped Hiring Contact, add their Prospect to `SKIPPED.md` as well, with the same reason, before marking them `Applied`.
   When a reason states a rule ("too junior", "no agencies"), update the matching section of the Niche Profile and say in one line what changed.
2. Find phone numbers for the approved people only: one `agent_run` with the approved people as input data and a `phone` field typed `format: "phone"`.
   Save its run id in the Batch file as the Phone run before waiting on it.
   Keep anyone without a number: they go on like the others, with `Phone: not found (Exa, 2026-10-12)`.
3. For each approved person, create or extend their file (`prospects/<domain-slug>.md` or `candidates/<name-slug>.md`) with Signals, Detected Roles, phone, Why Now and a Call Sheet.
   The Call Sheet adapts the Niche's Pitch to this person: who they are in one line, an opener in the language of the calls that names their Why Now, the angle, and the objection to watch for.
4. Add them to `CALL_LIST.md`, due in the next working half-day, and renumber.
5. Once everyone is `Applied`, delete the Batch file: each person's facts now live in their own file or in `SKIPPED.md`.

## 4. Report

Say how many were approved, how many numbers were found (Exa charges about $0.07 per number found), how many people were skipped and which Prospects were skipped.
List by name the people kept without a number, so the Recruiter can find one another way, then show the top of the Call List and offer `call 1`.
