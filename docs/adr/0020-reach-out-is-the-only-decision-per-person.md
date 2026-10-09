# Reach Out is the Recruiter's only decision per person

Auto Recruit is built for solo, non-technical recruiters whose working day is LinkedIn and Gmail, so the app asks one decision per Prospect or Candidate: Reach Out or Skip.
Reach Out finds the email, takes the Claim and drafts the first Campaign email, which the Recruiter edits if they wish and sends on the spot; follow-ups then go out unless the person replies, and Reach Out on a Prospect goes to its top-ranked Hiring Contact unless the Recruiter picks another.
Each Niche gets one Campaign per audience when it is created, with an agent-drafted Brief the Recruiter edits in plain words, so there is no campaign builder, no separate Enrichment step and no review queue.
A human still decides who is contacted (ADR-0006), mobile numbers still need their own explicit click (ADR-0005), and replies that need a human are still sent by the Recruiter (ADR-0002).

## Considered Options

- A campaign builder (audience, Brief, Sequence, mailboxes, sending window, autonomy, recipients): rejected because a solo recruiter thinks "I want to talk to this person", not "I want to configure a sequence"; custom Campaigns can be added later if real users ask.
- A separate Enrichment step before outreach: rejected because ADR-0005 only requires an explicit action for mobile numbers, and the extra step adds a decision without adding control.
- A queue of drafts to approve, or autonomy levels that send without review: rejected because a queue is easy to forget and sending unseen drafts erodes the Recruiter's trust in what goes out in their name.
