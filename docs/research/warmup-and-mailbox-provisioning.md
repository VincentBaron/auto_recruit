# Mailbox warmup and provisioning for cold email from Google Workspace and Microsoft 365

Checked: 2026-10-09 (findings may drift; re-verify before relying on prices or plan gates).

## Bottom line

At 30 cold emails per mailbox per day we are far below every Google and Microsoft sending limit.
The main risks are elsewhere.
Policy: both vendors treat this kind of sending as unsupported or banned outright.
Privacy: any warmup vendor gets full access to the mailbox, including candidate data.
Tenant ownership: with resold mailboxes, it is often unclear who owns the Google or Microsoft account behind them.

## A. Warmup services you can drive by API

| Vendor | API (primary docs) | How it accesses the mailbox | Price | Entity / hosting / DPA |
|---|---|---|---|---|
| MailReach | Connect inbox, account stats, spam tests, webhooks; the API itself is free | Gmail/Outlook OAuth or IMAP/SMTP; the terms say the customer gives "login and password" | $19.5 per mailbox per month list, custom above 100, includes spam-test credits; network "30k+" (vendor claim) | THE BRAIN COMPANY SAS, Paris; hosted on DigitalOcean, region not stated; no DPA found |
| lemwarm (lemlist) | Start, pause, settings per mailbox, deliverability alerts; adding a mailbox via API is SMTP/IMAP only; API on all plans | SMTP/IMAP via API; Google and Microsoft connections in the app | Standalone $24-29 per mailbox per month; network "20k+ domains" | lempire SAS, Paris; databases "exclusively within the EU"; DPA on request |
| Instantly | Most complete API: Google and Microsoft OAuth connect flows, warmup on/off (async jobs), warmup analytics, inbox-placement tests | OAuth, or IMAP/SMTP credentials | No standalone warmup; Growth $47, Hypergrowth $97 per month; network "1M+", built on "headless browsers" | Foo Monk LLC (US); data held in the US; no DPA mentioned |
| Smartlead | Add account, update warmup (`warmup_enabled`, `daily_rampup`), warmup stats | SMTP/IMAP with app passwords | Plans $39-379 per month, unlimited accounts; placement testing (SmartDelivery) $49-599 per month | Not checked |
| Warmy | API v2 exists; full endpoint list not public | Google and Microsoft connection; scopes not stated | From $49 per month, priced on warmup volume; "Full API access"; network "1M+" | Warmy Technologies LTD (Israel); hosted on AWS, region not stated; relies on SCCs, no named DPA |
| Warmforge (Salesforge) | OAuth2 or SMTP connect, stats, health, placement tests | OAuth2 or SMTP | $10 per mailbox slot per month; placement tests $39-169 per month | Entity and hosting not stated; standard DPA for EU customers |

Other vendors:
- TrulyInbox: the official pricing page lists "API access" from the Starter plan, priced on total warmup volume rather than per inbox; the API reference was not found.
- Warmup Inbox and Mailwarm: no public API could be verified.
- Mailivery: a partner API is advertised, but details are not public.

### Mailbox access

Warmup needs to find warmup emails in spam and move them.
So every one of these vendors either holds the password or uses a Google scope that can read all mail.
Google classes `gmail.modify` and `mail.google.com` as restricted scopes that require a security assessment.
In practice, each vendor can read every email in the mailbox, including candidate data.

## B. Google and Microsoft positions

### Google

The Google Workspace Acceptable Use Policy bans using Workspace "to generate, distribute, publish or facilitate unsolicited mass email… ('spam')".
It also bans testing the service "to evade filtering capabilities", and reselling End User Accounts "as added into a commercial product offered to third parties".
The Gmail Program Policies say "Don't use Gmail to distribute spam or unsolicited commercial mail", but they defer to the organisation's own agreement for Workspace accounts.
Google's sender guidelines ask for a spam rate below 0.1% and never reaching 0.3%, to "slowly increase the volume", and "don't send messages to people who didn't sign up".
Gmail sending limits in Workspace are 2,000 messages per day, 3,000 external recipients and 2,000 unique external recipients per day.
Trial accounts get 500 until $100 has been paid.

### Microsoft

Per-mailbox limits are 10,000 recipients per day and 30 messages per minute.
Microsoft says customers who need to send bulk email "should use third-party providers".
The outbound spam policy says bulk email "isn't a supported use… best-effort", and accounts over undisclosed thresholds are blocked.
The tenant external recipient rate limit (TERRL) is `500 × licenses^0.7 + 9500` external recipients per day.
New tenants get 10% of that for days 0-30 and 25% for days 31-60.
For trial tenants, the blog says 500 per day while the Learn page says 5,000; these conflict.

### Warmup networks

No explicit statement from either Google or Microsoft about warmup networks was found.
Reading the "evade filtering" clause as covering them is the researcher's interpretation, not Google's wording.

## C. Building your own warmup

1. Set up SPF, DKIM and DMARC (Google's baseline requirements).
2. Ramp volume gradually and avoid sudden doubling; Google gives no official schedule.
3. Use Google Postmaster Tools, but its data "might be missing if the total number of messages… is too low", so at 30 per day it will probably show little.
4. Keep your own seed accounts across Gmail, Workspace, Outlook.com and M365, and run placement tests on them.
5. Monitor bounces and NDRs, keep spam complaints below 0.1%, and verify lists before sending.
6. Do not build a fake-engagement network between customer mailboxes; that is exactly what the Workspace AUP clauses above target.

## D. Provisioning mailboxes for customers

### Reseller programmes

The Google Reseller API requires being an authorized reseller with a "fully executed and signed reseller contract".
Microsoft CSP's indirect route needs Microsoft AI Cloud Partner Program membership plus a distributor.
CSP direct billing needs $1M in trailing 12-month CSP revenue and a paid support plan.

### Third-party mailbox providers

| Provider | What it sells | Price | API | Ownership |
|---|---|---|---|---|
| Zapmail | Real Workspace / M365 Business Starter accounts, automated DNS | $2.50-3.90 per mailbox | Listed as a Pro-tier ($299 per month) feature, though a full API reference is public | Unclear; Smartlead's help centre mentions "admin access", but no confirmation a customer can transfer it out |
| Primeforge | Google and Microsoft mailboxes, automated DNS | $4.5 per slot (annual billing), minimum 10 | Yes | Admin access and ownership not stated |
| InboxKit (inboxautomate.com now redirects here) | Workspace and M365, DNS automated through Cloudflare | From $2.50 | REST API | Not stated |
| ScaledMail | Workspace; Outlook | Workspace $3.50 per mailbox; Outlook $50 per domain for 25 mailboxes | An API docs link exists | Not stated |

Mailforge, Infraforge and Maildoso run their own infrastructure, not Google or Microsoft, so they are incompatible with sending through the Gmail API and Graph.
Given the Google AUP's ban on reselling accounts, the tenants these providers hold carry a suspension risk.

## Recommendations from the research

Provisioning: have each customer own their Workspace or M365 tenant on their own billing, and automate DNS and user creation through admin consent.
This avoids reseller programmes and the account-resale ban.
Warmup: start with a self-built gradual ramp plus your own seed-based placement testing.
If you need to buy warmup, choose a French, EU-hosted vendor: lemwarm, or MailReach after confirming its hosting region and getting a signed DPA.
Treat any vendor's full mailbox access as a GDPR processing risk, given recruiters' candidate data.

## Unverified

Instantly's API plan gate (Hypergrowth) is a third-party claim only.
Smartlead's API plan gate was not verified.
Warmy's full API is not public.
The cancellation of Microsoft's planned 2,000 external recipients per mailbox per day limit (MERRL) in January 2026 is reported by secondary sources only.
The Microsoft SMTP basic-auth retirement timeline (Message Center MC786329, last seen as disabled by default at the end of December 2026) was not verified from a primary source.
All vendor network sizes are vendor claims.
Whether any third-party mailbox provider is an authorized Google reseller is unverified.

## Sources

Warmup services:
- https://docs.mailreach.co/
- https://www.mailreach.co/pricing
- https://www.mailreach.co/terms-of-use
- https://developer.lemlist.com/llms.txt
- https://www.lemwarm.com/pricing
- https://www.lemlist.com/privacy-policy
- https://www.lemlist.com/legal/dpa
- https://developer.instantly.ai/llms.txt
- https://instantly.ai/pricing
- https://instantly.ai/email-warmup
- https://instantly.ai/privacy
- https://api.smartlead.ai/guides/email-warmup
- https://www.smartlead.ai/pricing
- https://support.warmy.io/knowledge/how-do-i-use-warmy-c-with-an-api
- https://www.warmy.io/pricing
- https://www.warmy.io/privacy-policy
- https://help.salesforge.ai/en/articles/10333611-warmforge-api-explained
- https://www.warmforge.ai/pricing
- https://www.trulyinbox.com/pricing.md
- https://developers.google.com/workspace/gmail/api/auth/scopes

Google and Microsoft policies:
- https://workspace.google.com/intl/en/terms/use_policy/
- https://support.google.com/mail/answer/16734397
- https://support.google.com/mail/answer/81126
- https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
- https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits
- https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-protection-about
- https://techcommunity.microsoft.com/blog/exchange/introducing-exchange-online-tenant-outbound-email-limits/4372797
- https://office365itpros.com/2026/01/08/mailbox-external-recipient-rate/
- https://support.google.com/mail/answer/9981691

Provisioning:
- https://developers.google.com/workspace/admin/reseller/v1/how-tos/prerequisites
- https://learn.microsoft.com/en-us/partner-center/enroll/csp-overview
- https://zapmail.ai/llms.txt
- https://docs.zapmail.ai/
- https://www.primeforge.ai/pricing
- https://www.inboxkit.com/
- https://www.scaledmail.com/pricing
- https://www.mailforge.ai/pricing
- https://maildoso.ai/pricing
