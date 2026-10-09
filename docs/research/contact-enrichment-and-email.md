# Contact enrichment, mailbox access and cold email sending

Checked: 2026-10-09 (findings may drift; re-verify before relying on prices or plan gates).

## Bottom line

Waterfall enrichment providers (FullEnrich, BetterContact) give the broadest email and mobile coverage, with Cognism as an optional premium source for French mobiles.
Dropcontact is the French, CNIL-audited option for work emails, but it does not return phones.
No independent benchmark of French mobile coverage was found, so a 100-200 contact bake-off on the real niche is recommended before committing.
Reading Gmail (Sent folder, reply detection) requires restricted scopes, which means OAuth verification plus a yearly CASA security assessment.
Microsoft Graph has no CASA equivalent.
Cold email best practice is secondary lookalike domains, mailbox warmup, and low per-mailbox daily volumes.
Cold-email platforms (Instantly, Smartlead, lemlist) can create campaigns, add leads with per-lead copy, and push reply events by API; connecting mailboxes through them avoids running the Gmail reading layer ourselves.

## A. Contact enrichment APIs

| Provider | Public API | Returns | Waterfall | EU / GDPR | Price, email vs mobile | Verification | Search by company + role |
|---|---|---|---|---|---|---|---|
| **FullEnrich** | Yes, on Pro. Async, webhook per contact, MCP | Work email, personal email, mobile | Yes, 25+ sources | Founded in Paris; Dealroom now lists the HQ in SF (unverified). SOC 2 Type II, stores no contact DB | Email 1 credit, mobile 10, personal email 3. About €0.055/credit, so roughly €0.06 per email and €0.55 per mobile | SMTP + catch-all | Yes: v2 Search People and Look Up People |
| **BetterContact** | Yes, all plans. Async + webhook | Email + mobile | Yes, 20+ phone providers | Claims EU data residency | Email 1, mobile 10. $49 per 1K credits, so about $0.49 per mobile | Bouncer; catch-all on Pro | "Lead Finder" over 7+ DBs (role filter not verified) |
| **Kaspr** | Only "upon request" on Starter/Business. Input is a LinkedIn URL | Work email, direct email, phone | No | French. CNIL fined it €240k (Dec 2024). The order was closed 4 Mar 2026 after Kaspr deleted its database and stopped collecting from LinkedIn | €45-79/user/mo with 100-200 phone credits | n/a | No |
| **Lusha** | Enrich API: yes. Prospecting/Filters API: Scale plan only | Email + phone | No | Pricing page says nothing on GDPR | Email 1, phone 5. About $0.12/credit on Pro | "Verified" | Scale only |
| **Dropcontact** | Yes. Async + webhook, 60 req/s | Email only, plus SIREN/SIRET and job level/function | No (algorithmic, no DB) | French, EU servers, "audited against CNIL standards" | €79/mo Starter, pay on success. Mobiles only in a separate CRM product | Native + catch-all | No |
| **Apollo** | Yes. Phones come back async via webhook | Email + mobile. Personal emails withheld in GDPR regions | Optional (phone waterfall 8-25+ credits) | US | Email 1 credit, mobile +8 | Yes | People Search costs 0 credits; filters on titles, seniority, domains |
| **Hunter** | Yes, all plans including Free | Email (phone only incidentally) | No | Not stated | €49 per 2K credits. Verify 0.5 credit. No charge when nothing is found | Yes | Domain Search with seniority, department, job_titles, `decision_maker` |
| **Icypeas** | Yes, all plans | Email only (Phone Finder "coming soon") | No | GDPR claim, professional data only | $19 per 1K credits. Email 1, verify 0.1, Find People 0.02 per result | Yes | Find People |
| **lemlist** | Yes, all plans. Enrich endpoints + people DB search | Email + phone | "25+ providers" (not called a waterfall) | French | Add-on $16 per 2K credits: email 5 credits (about $0.04), phone 20 (about $0.16) | `verifyEmail` flag | People database search API |
| **Clay** | HTTP API and webhooks on Growth+ only (about $446-495/mo) | Orchestrates other providers | You build it | US | Data credits from $0.05. Your own API keys cost no data credits on any plan | Via providers | Via providers |

Other notable providers:

- Cognism: EU-focused data, phone-verified mobiles, API + MCP, sales-quoted pricing.
- Surfe: Paris office and a 15+ provider waterfall, but its API is Enterprise-only.

Best mobile coverage in France:

- No independent benchmark was found.
- The only France-specific number was a Reddit test of 100 contacts in which Kaspr found 66 phones, before Kaspr deleted its database, so it says little about Kaspr today.
- Cognism is the provider most often cited for French direct dials.
- Recommendation from the research: a waterfall (FullEnrich or BetterContact) as the default, Cognism as an optional premium source, and a 100-200 contact bake-off on the real ideal customer profile before committing.

Legal notes (France):

- B2B cold email is allowed without prior consent (opt-out) if the message relates to the person's job; every email needs an opt-out, and prospect data can be kept 3 years.
- Since 11 Aug 2026, calling consumers requires prior consent.
- B2B calls fall outside that text, but the DGCCRF has not explicitly confirmed this, which matters when calling candidates on personal mobiles.

## B. Sending and reply tracking

### Gmail API

- Reading the Sent folder needs `gmail.readonly`, a restricted scope.
- `gmail.metadata` is also restricted and returns no message bodies.
- Sending needs `gmail.send`, which is only sensitive.
- Detecting replies needs `users.watch`, which only accepts restricted scopes (`gmail.readonly`, `gmail.modify`, `gmail.metadata` or full `mail.google.com`).
- Watch setup: create a Pub/Sub topic and grant publish rights to `gmail-api-push@system.gserviceaccount.com`.
- Re-call `watch` at least every 7 days (Google recommends daily), then use `history.list` from the last `historyId`.
- Notifications are limited to 1 per second per user and some can be dropped, so keep a polling fallback.
- Restricted scopes with server-side storage require OAuth verification plus a CASA security assessment every year.
- Google's FAQ estimates about 6 weeks for restricted-scope verification.
- Assessor fees run $500-4,500, and the assessment takes 2-3 weeks (Tier 2) or 4-6 weeks (Tier 3).
- TAC Security quotes about $540-1,800 for Tier 2 (vendor page).
- Until verified, the app is capped at 100 new users.
- Internal apps used within one Google Workspace organisation are exempt.

### Microsoft Graph

- Scopes: `Mail.Read` (Sent Items and subscriptions), `Mail.Send` and `offline_access`.
- `Mail.ReadBasic` excludes message bodies.
- Reply detection: `POST /subscriptions` on `me/messages` or `me/mailFolders('inbox')/messages`.
- Maximum subscription lifetime is 10,080 minutes (under 7 days), or 1,440 minutes when notifications include resource data.
- Average notification latency is under 1 minute.
- There is no CASA equivalent.
- Publisher verification is free and needs a Microsoft Partner account.
- Without publisher verification, users cannot consent to multitenant apps where risk-based step-up consent is on, and many companies require admin consent anyway.

### Deliverability rules

- Gmail: all senders need SPF or DKIM, PTR records and TLS, and a spam rate under 0.3% (Google recommends under 0.1%).
- Gmail "bulk" means about 5,000+ messages per day to personal Gmail, and that status is permanent once reached.
- Bulk senders also need aligned DMARC and one-click unsubscribe.
- Gmail enforcement ramped up from Nov 2025 with temporary and permanent rejections.
- Yahoo: same rules, plus unsubscribes must be honoured within 2 days.
- Microsoft (Outlook.com consumer): domains sending 5,000+ messages need SPF, DKIM and aligned DMARC, enforced since 5 May 2025 with 550 5.7.515 rejections.
- Google Workspace hard-caps 2,000 messages per user per day (500 on trial accounts).
- Instantly recommends 30 campaign emails per mailbox per day plus about 10 warmup emails.
- Practitioners send from secondary lookalike domains to protect the main domain's reputation, spread volume across many mailboxes (for example 3 per domain), and warm each one up for 2-4+ weeks.
- That last point is vendor and practitioner advice, not a provider rule.

### Sending platforms

| Platform | Create campaign | Leads with per-lead copy | Reply events | Plan / price |
|---|---|---|---|---|
| **Instantly** | API v2, yes | `/leads/add` takes up to 1,000 leads, with `personalization` + `custom_variables` | Webhooks include `reply_received`, `lead_interested` and others. There is also a reply endpoint | Webhooks need Hyper Growth+ ($97/mo, $77.6 billed annually) |
| **Smartlead** | `/campaigns/create` and `/sequences` | `/campaigns/{id}/leads` takes up to 400 per request, with up to 200 custom fields | `EMAIL_REPLY`, `LEAD_CATEGORY_UPDATED` (event names are inconsistent across the docs) | API requires Pro ($94/mo, $78 billed annually); unlimited mailboxes |
| **lemlist** | Yes | Any extra fields become custom variables, plus `icebreaker`; `findEmail`/`findPhone` flags | `emailsReplied` and many others, up to 200 webhooks per workspace. Rate limit is 20 requests per 2 seconds | API on all plans, from $55-69/mo |
| **La Growth Machine** | Not listed in the API (pause/resume and edit settings only) | Leads are pushed into "audiences" | Inbox webhook sends every email and LinkedIn message. The API can also draft and send replies. Limit is 50 calls per 10 seconds | Pro, €120 per identity per month |

Design implication from the research: if the product reads Gmail Sent folders and watches for replies itself, CASA is unavoidable.
The alternative is to connect mailboxes through Instantly, Smartlead or lemlist, which handle that layer, and to request only `gmail.send` where needed.

## Unverified

- FullEnrich and BetterContact headquarters.
- BetterContact's Lead Finder role filters.
- Which Apollo plans include the API (the pricing page says Custom only, the developer FAQ says all plans have basic access).
- Whether Instantly's API itself is gated by plan (only the webhook gate is confirmed).
- Kaspr's API docs (not reviewed) and its Cognism ownership.
- Hunter's EU posture.
- Prospeo's pricing (the page did not render).
- Any France mobile-coverage figures.
- CASA assessor pricing (vendor pages only).
- Whether B2B calls are outside the 2026 consumer phone-canvassing consent rule (DGCCRF not explicit).

## Sources

- https://fullenrich.com/pricing
- https://docs.fullenrich.com/llms.txt
- https://bettercontact.rocks/pricing
- https://doc.bettercontact.rocks
- https://kaspr.io/pricing
- https://cnil.fr/en/data-scraping-kaspr-fined-eu240000
- https://cnil.fr/en/closure-order-issued-against-kaspr
- https://lusha.com/pricing
- https://docs.lusha.com/faq/api
- https://dropcontact.com/pricing
- https://developer.dropcontact.com
- https://docs.apollo.io/reference/people-enrichment
- https://docs.apollo.io/reference/people-api-search
- https://docs.apollo.io/docs/api-pricing
- https://hunter.io/pricing
- https://hunter.io/api-documentation/v2
- https://icypeas.com/pricing
- https://lemlist.com/pricing
- https://clay.com/pricing
- https://surfe.com/pricing
- https://cognism.com/pricing
- https://cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique
- economie.gouv.fr (DGCCRF démarchage téléphonique fiche)
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/guides/push
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch
- https://support.google.com/cloud/answer/13465431
- https://support.google.com/cloud/answer/7454865
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://tacsecurity.com/esof
- https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions
- https://learn.microsoft.com/en-us/graph/api/resources/subscription
- https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview
- https://support.google.com/a/answer/81126
- https://support.google.com/a/answer/14229414
- https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
- https://senders.yahooinc.com/best-practices
- techcommunity.microsoft.com (Outlook high-volume senders post)
- https://help.instantly.ai/en/articles/6222396-campaign-options
- https://help.instantly.ai/en/articles/6261906-webhooks
- https://developer.instantly.ai/webhook-events
- https://instantly.ai/pricing
- https://api.smartlead.ai/llms.txt
- https://api.smartlead.ai/api-reference/webhooks/events
- https://smartlead.ai/pricing
- https://developer.lemlist.com (add-webhook, create-lead-in-campaign, rate-limits)
- https://lagrowthmachine.com/integrations/api
- https://lagrowthmachine.com/pricing
