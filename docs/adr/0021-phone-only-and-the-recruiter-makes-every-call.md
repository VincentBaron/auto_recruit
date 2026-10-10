# Phone only, and the Recruiter makes every call

Auto Recruit reaches Hiring Contacts and Candidates by phone only, and the Recruiter is always the one talking: agents find people, find their phone numbers, prepare the Call Sheet and log what happened, but never email anyone and never place or hold a call themselves.
Email outreach was dropped to keep the product simple: doing it well means owning deliverability (mailboxes, warmup, sending caps, reply detection), which is a product of its own; Recruiters who want to email can reuse the people and do it with their own tools.

## Considered Options

- An AI voice agent that makes the calls: rejected because calling private individuals through an automated system needs their prior consent (CPCE L34-5), the EU AI Act requires saying it is an AI at the start of the call (art. 50, from 2 August 2026), and ARCEP requires dedicated verified numbers for automated calls; a cold call that opens with "I am an AI" also loses most of its value. See `docs/research/phone-calling.md`.
- A dialler that rings several numbers at once: rejected because ARCEP counts parallel or predictive dialling as automated even when a human talks, while one call per explicit command from the Recruiter is not.
