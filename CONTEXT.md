# Auto Recruit

An agentic recruitment agency run from Claude.
Agents find companies likely to hire and candidates likely to move within a Recruiter's Niche, find their phone numbers and prepare what to say.
The Recruiter makes the calls; agents never contact anyone by email or by voice.

## Language

### Market

**Recruiter**:
The person who sets up Niches, approves Batches and makes the calls.
_Avoid_: User, agent

**Niche**:
A Recruiter's specialisation: the sectors, company sizes, locations and role types they place.
A Recruiter can have several.
_Avoid_: Vertical, segment, market

**Niche Profile**:
The Recruiter-approved description of a Niche that the agents work from: target companies, target roles, candidate profile, the Signals to look for and the Pitches.
It comes out of a discussion with the Recruiter and is refined each time they Skip someone with a reason.
_Avoid_: ICP, config, persona

### Companies and people

**Prospect**:
A company that could become a Client.
_Avoid_: Lead, account, target company

**Hiring Contact**:
A person at a Prospect who is called about hiring, such as a founder, CTO or Head of Talent.
_Avoid_: Prospect (for the person), decision maker, lead

**Candidate**:
A person who could be placed in a role at a Prospect or Client.
A Candidate is never the same record as a Hiring Contact, even when it is the same human.
_Avoid_: Talent, profile, applicant

**Client**:
A Prospect that has signed with the Recruiter to fill roles.
_Avoid_: Customer, account

**Detected Role**:
An open role at a Prospect inferred from public evidence such as a job posting.
_Avoid_: Job, opening, vacancy, mandate

### Agents

**Prospection Agent**:
The agent that finds and ranks Prospects and their Hiring Contacts for one Niche.
_Avoid_: BD agent, lead-gen agent

**Sourcing Agent**:
The agent that finds and ranks Candidates for one Niche, either for the Niche at large or for a Detected Role.

### Signals

**Signal**:
A dated, observable fact suggesting a Prospect is likely (or unlikely) to hire or a Candidate is likely (or unlikely) to move, such as a job posting, a funding round or a job change.
Agents rank people by judging their Signals; there is no score.
_Avoid_: Trigger, intent, event, score

**Why Now**:
The one-sentence, plain-language summary of the Signals that make a Hiring Contact or Candidate worth calling now.
_Avoid_: Reason, insight, highlight

### Sourcing

**Batch**:
The Hiring Contacts and Candidates an agent proposes from one search for a Niche, each with its Why Now, and never two Hiring Contacts from the same Prospect.
The Recruiter removes the people they don't want and approves the rest, which finds their phone numbers and puts them on the Call List.
_Avoid_: Shortlist (a recruitment term for Candidates presented to a Client), results, lead list

**Surfaced**:
Proposed in a Batch and not yet approved or Skipped.

**Skipped**:
Removed from a Batch by the Recruiter, optionally with a reason, and never proposed again.
A Prospect is Skipped when the Recruiter removes its Hiring Contact from a Batch, and is never searched again.
_Avoid_: Dismissed, rejected

**Enrichment**:
Finding a phone number for a Hiring Contact or Candidate.
Email addresses are never looked for.
_Avoid_: Lookup, reveal

### Calling

**Call List**:
A Recruiter's standing queue of Hiring Contacts and Candidates to call, in two sections, each entry with its Call Sheet.
Due callbacks come first; people not reached come back after a delay until they are reached or set aside.
You call a Hiring Contact, never a Prospect: the Prospect is the company the Hiring Contact belongs to.
_Avoid_: Today, todo list, feed, leads list, call queue

**Pitch**:
What the Recruiter says to one audience of a Niche: who they are, what they offer, what they ask for and how to answer the usual objections.
Each Niche has one Pitch for Hiring Contacts and one for Candidates.
_Avoid_: Brief, script, template

**Call Sheet**:
What the Recruiter needs during one call: who the person is, their Why Now, an opener adapted from the Pitch, and what happened on previous calls.
_Avoid_: Script, card, brief

**Attempt**:
One dialling of a Hiring Contact or Candidate, whatever its Call Outcome.

**Call Outcome**:
What happened on one Attempt: No Answer, Voicemail, Callback, Interested, Not Now, Not Interested, Wrong Number or Do Not Call.
It decides whether and when the person comes back on the Call List.
_Avoid_: Disposition, status, result

**Reached**:
Spoken to on a call at least once.
_Avoid_: Contacted

**Do-Not-Call List**:
The people, and the Prospects, who must never be called again because they asked.
_Avoid_: Suppression List, blacklist
