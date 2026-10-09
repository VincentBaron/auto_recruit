# Auto Recruit

An agentic operating system for agency recruiters.
Agents find companies likely to hire and candidates likely to move within a recruiter's niche, rank them by signals, and run email outreach to both.

## Language

### Tenancy

**Workspace**:
An isolated recruiting business (an agency or a freelance recruiter) with its own Recruiters, Niches, data and outreach.
_Avoid_: Account, tenant, organization

**Recruiter**:
A person working in a Workspace who prospects, sources and runs outreach.
_Avoid_: User, agent

**Owner**:
A Recruiter who also manages the Workspace's members, Credits and API Keys.
_Avoid_: Admin

**Credit**:
The prepaid unit a Workspace spends, at a fixed price per outcome such as a Surfaced Prospect, a verified email or a sent email.
_Avoid_: Token

**API Key**:
The credential an integration uses to act for one Workspace, and on behalf of a named Recruiter whenever it contacts people.
_Avoid_: Token, secret

### Market

**Niche**:
A Recruiter's specialisation: the sectors, company sizes, locations and role types they place.
A Workspace can have several, each owned by one Recruiter.
_Avoid_: Vertical, segment, market

**Niche Profile**:
The structured, Recruiter-approved description of a Niche that the agents work from: target companies, target roles, candidate profile, signals and search strategy.
_Avoid_: ICP, config, persona

**Test Run**:
A small agent run whose results the Recruiter marks good or bad to tune a Niche Profile before the agents are switched on.
_Avoid_: Calibration, preview, trial

### Companies and people

**Prospect**:
A company that could become a Client.
_Avoid_: Lead, account, target company

**Hiring Contact**:
A person at a Prospect who is contacted about hiring, such as a founder, CTO or Head of Talent.
_Avoid_: Prospect (for the person), decision maker, lead

**Candidate**:
A person who could be placed in a role at a Prospect or Client.
A Candidate is never the same record as a Hiring Contact, even when it is the same human.
_Avoid_: Talent, profile, applicant

**Client**:
A Prospect that has signed with the Workspace to fill roles.
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

**Outreach Agent**:
The agent that writes each Campaign email for one recipient, from the sender's Voice Profile, the Campaign's Brief and the recipient's context.

### Ranking

**Signal**:
A dated, observable fact suggesting a Prospect is likely (or unlikely) to hire or a Candidate is likely (or unlikely) to move, such as a job posting, a funding round or a job change.
_Avoid_: Trigger, intent, event

**Preview**:
An anonymised, unstored summary of a Hiring Contact or Candidate, shown before a Workspace pays to reveal who they are.
_Avoid_: Teaser, blurred profile

**Fit**:
How closely a Prospect or Candidate matches a Niche Profile, regardless of timing.
_Avoid_: Match score, relevance

**Signal Strength**:
How favourable the timing is for a Prospect or Candidate, derived from its Signals and fading as they age.
_Avoid_: Intent score, priority, heat

**Why Now**:
The one-sentence, plain-language summary of the Signals that make a Prospect or Candidate worth contacting now.
_Avoid_: Reason, insight, highlight

**Today**:
A Recruiter's daily worklist: the replies waiting for their answer, then the best Surfaced Prospects and Candidates across their Niches.
_Avoid_: Feed, Inbox, dashboard, leads list

**Digest**:
A Recruiter's daily summary of new replies, the best new Surfaced Prospects and Candidates, Sending Mailbox health and remaining Credits.
_Avoid_: Report, newsletter, daily update

### Lifecycle

**Surfaced**:
Found by an agent above the Niche's Fit threshold and not yet acted on.

**Skipped**:
Set aside by a Recruiter before any contact, optionally with a reason.
_Avoid_: Dismissed, rejected

**Enriched**:
Holding verified contact details.

**Contacted**:
Having received at least one Campaign email.

**Replied**:
Having answered a Campaign email.

**Consented**:
A Candidate who agreed to be kept in the Workspace's Talent Pool.

**Talent Pool**:
The Consented Candidates of a Workspace.
_Avoid_: Vivier, CV database, pipeline

**Claim**:
A Recruiter's exclusive right to contact a Hiring Contact or Candidate, taken by adding them to a Campaign and lapsing after inactivity.
_Avoid_: Ownership, lock

### Outreach

**Reach Out**:
A Recruiter's decision to contact a Surfaced Hiring Contact or Candidate, which finds their email, takes the Claim and drafts the first Campaign email for the Recruiter to send.
_Avoid_: Enrich, add to campaign, approve

**Campaign**:
Outreach to either Hiring Contacts or Candidates within one Niche, defined by a Brief and a Sequence, which recipients can join at any time.
Each Niche has exactly one Campaign per audience, created with it.
_Avoid_: Sequence, blast

**Brief**:
A Campaign's angle, call to action and optional Detected Role.
_Avoid_: Template, prompt

**Sequence**:
A Campaign's ordered emails: a first email and its follow-ups, with delays between them.
_Avoid_: Cadence, flow

**Sending Mailbox**:
A Google Workspace or Microsoft 365 mailbox, belonging to one Recruiter and never on a Main Domain, that Campaign emails are sent from.
_Avoid_: Inbox, sender account, email account

**Main Domain**:
A domain a Workspace uses for its website and everyday email, which Campaign emails are never sent from.
_Avoid_: Primary domain, company domain

**Reply Category**:
How a reply to a Campaign email is classified: Interested, Not Now, Not Interested, Opt-out, Out of Office, Referral or Bounce.
_Avoid_: Sentiment, status

**Voice Profile**:
A Recruiter's writing style in one language, learnt from their sent emails and from their edits to drafts.
_Avoid_: Tone, persona, style guide

### Compliance

**Enrichment**:
Finding verified contact details (email, phone) for a Hiring Contact or Candidate.
_Avoid_: Lookup, reveal

**Provenance**:
The recorded origin of a piece of personal data: where it came from, when, and by what means.
_Avoid_: Source, lineage

**Article 14 Notice**:
The information a Candidate must receive about where their data came from and how it is used, at the latest in the first email they receive.
_Avoid_: Privacy notice, disclaimer

**Consent Page**:
The page, in a Workspace's name, where a Candidate chooses to join the Talent Pool, be considered for one opportunity only, or have their data deleted.
_Avoid_: Opt-in form, preference center

**Data Request**:
A person's request to access, export or delete the data a Workspace holds about them, due within one month.
_Avoid_: DSAR, GDPR request, ticket

**Suppression List**:
The people and companies that must never be contacted again, typically because they opted out.
_Avoid_: Blacklist, do-not-contact list
