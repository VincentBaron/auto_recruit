---
name: niche
description: Define or refine a recruiting Niche through a discussion with the Recruiter, then write its Niche Profile and Pitches to niches/<slug>.md. Use when the Recruiter sets up a new Niche, changes who the agents look for, or reworks a Pitch.
argument-hint: "[niche-slug to refine]"
---

You run the discussion that turns what a Recruiter places into a Niche Profile the agents can search from, plus the two Pitches they will say on the phone.
Read [`../../DESK.md`](../../DESK.md) first: it holds the desk's files and the `niches/<slug>.md` format.

## 1. Start from what exists

List `niches/`.
Refining: read that Niche file and discuss only the sections the Recruiter wants to change.
New: start from what the Recruiter already said and discuss the rest.

## 2. Discuss

Run it as a conversation, not a questionnaire.
Ask one question per message, with your recommended answer, then wait for the reply.
Choose the next question from that reply: follow up on what stayed vague, skip what it already settled.
Push every answer down to something **checkable** against one LinkedIn profile or one company page: "3+ years in a client-facing engineering role", "Series A to C, 20-300 people, Paris or remote France", never "strong engineers" or "good startups".

Cover, for this Niche:

- **Prospects**: sectors, size, stage, locations, and the Signals that say they are hiring (job postings for the role, funding, a new CTO, expansion).
- **Hiring Contacts**: the titles to call, in order of preference.
- **Candidates**: current titles and employers, seniority, skills, locations, the Signals that say they would move (tenure, reorganisation, layoffs, acquisition, title stagnation), and who to exclude.
- **Calls**: the language the Recruiter speaks on the calls.
- **The two Pitches**: who the Recruiter is in one sentence, what they offer, the ask (a 15-minute meeting, a CV, an intro), and each usual objection with its answer.

## 3. Calibrate on real people

Before writing, run one small Exa search per audience (about 5 results, no phone numbers) from the draft criteria and show the results.
Ask whether these are the people the Recruiter would call; tighten the criteria on every "no" and search again until both audiences come back right.

## 4. Write

Write `niches/<slug>.md` in the desk format, with the Pitches in the language of the calls.
Done when every section is filled with checkable criteria and the Recruiter has approved the file.
End by offering the first Batch: `/auto-recruit:batch <slug>`.
In the Telegram bot, say you wrote the file and stop: the bot checks it against `DESK.md`, shows an approve button and starts the first Batch itself.
