# Cold email platforms for a multi-tenant, API-driven setup

Checked: 2026-10-09 (findings may drift; re-verify before relying on prices or plan gates).

## Bottom line

Smartlead is the only one of the three main platforms where isolated customer sub-accounts can be created entirely through the API, but it is weak on EU data location.
Instantly has the best API but makes isolated per-customer accounts impractical.
lemlist keeps its data in France but has no API to create sub-accounts.
EmailBison creates workspaces by API at a flat price, but its DPA and hosting were not checked.
No EU-hosted mailbox infrastructure option could be verified from any vendor.
Reply webhooks are poorly documented everywhere, so the product should keep its own thread records and poll as well as listen.

## Comparison

| | Smartlead | Instantly | lemlist | EmailBison |
|---|---|---|---|---|
| Create sub-accounts by API | **Yes**: `POST /api/v1/client/save` returns the client's own API key. Webhooks can be scoped to one client. | **No.** You cannot create a workspace by API. You can only invite an existing one, and the invite must be accepted. Once linked, one key can act as any sub-workspace via the `x-as-workspace` header. | **No** create endpoint. Each account needs its own API key. No agency or white-label offer on the pricing page. | **Yes**: `POST /api/workspaces/v1.1` with a super-admin key. |
| Cost of the model | Pro $94/mo plus $29 per customer per month. Unlimited Prime ($379/mo) includes 3 customers. API and webhooks start at Pro. | Every workspace needs its own subscription. Webhooks need Hyper Growth ($97/mo) or above, so roughly $97 per customer. | Email plan $69/mo list ($55 on yearly billing). API on all plans. | One flat plan: $599/mo for 500k emails, on your own branded instance with dedicated IPs. |
| Buy domains and mailboxes by API | SmartSenders order API, which needs support to enable it. Google or Outlook $4.50 per mailbox per month, $13 per domain per year. DNS set up automatically. Cannot be moved off Smartlead. | DFY order API, with a free quote mode. Google $5, AirMail $4, pre-warmed $10 per mailbox per month. Domain $15/yr. Microsoft is $20 per domain per month for 50-100 mailboxes. DNS set up automatically. A 2024 changelog says US IPs only. | Buying is in-app only, no API documented. | Not checked |
| Warmup | Included. Controlled by API. Docs say 14+ days, or 21-30 for new domains. | Included and unlimited. Enable/disable by API, settings can be passed when adding a mailbox. Instantly's blog says 2-3 weeks. | lemwarm included. Start, pause and settings by API. | Not checked |
| Reply webhook | Exists, but the docs contradict each other (`EMAIL_REPLY` with `reply_body`, or `EMAIL_REPLIED` with `reply.body` and `message_id`). Retries at 1m, 5m, 15m, 1h, 6h, then the webhook is disabled. | `reply_received` includes the full reply text and HTML (`reply_text`, `reply_html`) and the sending mailbox. Emails have `thread_id` and `message_id`. Retry policy not documented. | `emailsReplied` exists, but no reply body field is documented. Fetch the text with Get Contact Messages. | Retries when your server takes over 15s to answer. Reply payload not checked. |
| Reply in-thread by API | `POST /campaigns/{id}/reply-email-thread` with `email_stats_id`. Docs don't say which mailbox sends it. | `POST /api/v2/emails/reply` with `reply_to_uuid` and `eaccount` (the sending mailbox). | `POST /inbox/email` with `replyToActivityId` and `sendUserMailboxId`. Threads via In-Reply-To. | `POST /api/replies/{id}/reply` with `sender_email_id`. |
| API rate limits | Pro 120/min and 3,000/hr. Standard 60/min. Enterprise is custom. Client keys default to 60/min. | 100/sec and 6,000/min, shared by the whole workspace. | 20 requests per 2 seconds per key. | Not checked |
| GDPR | DPA with an Australian company (521 Products Pty Ltd), EU standard contract clauses. The DPA names AWS Sydney but the sub-processor list says AWS USA. No EU hosting. | DPA with a US company (Foo Monk LLC), EU standard contract clauses, 15 days' notice before new sub-processors. AWS and Google Cloud in the USA. No EU hosting. | Help center says all data stays in France on OVH, nothing leaves the EEA. DPA online. No sub-processor list found. | Not checked |

Saleshandy:

- Client management and white-label exist, but only in the dashboard, with no client API documented.
- A reply webhook exists (docs dated 2024).
- Not a strong option.

## Mailbox infrastructure you own

- Infraforge: API included and DNS set up automatically.
- Infraforge mailbox slots are $4/mo billed quarterly (about $3.33 on yearly billing), minimum 10.
- Infraforge domains are $14/yr, and a dedicated IP is $99/mo.
- Infraforge's homepage and pricing page do not mention EU servers, data residency or GDPR; they only show a SOC2 badge and a DPA link.
- Zapmail: documented API covering domains, mailboxes, DNS records, separate workspaces and webhooks, with limits of 5/sec and 20/min.
- Mailforge: the API covers domains, DNS, mailboxes and workspaces.
- Maildoso: no primary API docs found.
- Typical cost: $3-5 per mailbox per month and $13-15 per domain per year.
- No EU-hosted mailbox option could be verified from any vendor.

## Recommendation from the research

1. Sending platform: Smartlead is the closest fit for one master account with one isolated sub-account per customer.
   - Negotiate Enterprise for higher rate limits and an EU hosting answer in writing.
   - Before committing, test the real reply webhook payload and reply threading in a sandbox.
   - Its GDPR position (Australian company, US or Sydney hosting) will need a transfer impact assessment for French customers.
2. Ask EmailBison for a demo.
   - Workspace creation by API at a flat price scales better than $29-97 per customer once there are many customers.
   - Get its DPA and hosting location first.
3. Avoid Instantly for per-customer isolation.
   - It would mean a subscription per customer and no API to create workspaces.
   - It only works with a single workspace and customer separation handled in our backend.
4. Avoid lemlist despite France hosting, because it has no API to create sub-accounts and cannot support a master-account model.
5. Buy domains and mailboxes outside the sending platform.
   - Use an API-first provider such as Infraforge, Zapmail or Mailforge, and connect mailboxes over SMTP/IMAP.
   - SmartSenders mailboxes cannot leave Smartlead, so this avoids lock-in.
6. Keep a vendor-neutral sending layer in the backend.
   - Store each email's Message-ID and thread ID in our own database.
   - Pull replies periodically as well as listening to webhooks, because retry behaviour and payloads are poorly documented everywhere.

## Unverified

- Which Instantly plan unlocks the API (only a third party, Nango, says Hyper Growth).
- Instantly DFY domain ownership (only a third party, CostBench, claims customers do not own them).
- EmailBison's DPA and hosting, and its "unlimited workspaces" (third-party claim).
- EmailBison's domain and mailbox purchasing, warmup, reply payload and rate limits (not checked).
- Smartlead's real reply payload, and whether its rate limit is per key or per plan (its docs say both).
- Infraforge EU hosting.
- Zapmail's pricing (no primary source found).
- Mailforge's pricing (not checked).
- Maildoso's pricing (third-party sites quote about $1.90-2.50 per mailbox).

## Sources

Smartlead:

- https://api.smartlead.ai/api-reference/clients/create
- https://www.smartlead.ai/pricing.md
- https://api.smartlead.ai/guides/rate-limits
- https://api.smartlead.ai/core/webhooks
- https://api.smartlead.ai/reference/email-reply-webhooks
- https://api.smartlead.ai/api-reference/inbox/reply.md
- https://api.smartlead.ai/api-reference/smart-senders/place-order.md
- https://helpcenter.smartlead.ai/en/articles/255-smartsenders-step-by-step-walkthrough
- https://api.smartlead.ai/guides/email-warmup.md
- https://api.smartlead.ai/api-reference/email-accounts/warmup-settings
- https://helpcenter.smartlead.ai/en/articles/430-how-client-level-api-keys-work-in-smartlead
- https://www.smartlead.ai/dpa
- https://helpcenter.smartlead.ai/en/articles/137-smartlead-sub-processors

Instantly:

- https://developer.instantly.ai/guides/workspace-group.md
- https://developer.instantly.ai/api-reference/workspacegroupmember/create-workspace-group-member.md
- https://help.instantly.ai/en/articles/6718773-create-a-separate-workspace-and-invite-team-members
- https://help.instantly.ai/en/articles/8678006-agency-white-labeling
- https://help.instantly.ai/en/articles/10273259-instantly-plans-overview
- https://help.instantly.ai/en/articles/6261906-webhooks
- https://developer.instantly.ai/getting-started/rate-limit.md
- https://developer.instantly.ai/api-reference/dfyemailaccountorder/place-a-dfy-email-account-order.md
- https://developer.instantly.ai/guides/webhook-events.md
- https://developer.instantly.ai/api-reference/email/reply-to-an-email.md
- https://developer.instantly.ai/api-reference/email/get-email.md
- https://feedback.instantly.ai/changelog/rocket-done-for-you-email-and-domain-set-up
- https://instantly.ai/blog/warmup-plan-for-ai-reply-agent/
- https://instantly.ai/dpa
- https://help.instantly.ai/en/articles/8177025-instantly-sub-processors

lemlist:

- https://developer.lemlist.com/api-reference/getting-started/multiple-accounts.md
- https://developer.lemlist.com/api-reference/getting-started/rate-limits.md
- https://developer.lemlist.com/api-reference/endpoints/inbox/send-email.md
- https://developer.lemlist.com/api-reference/endpoints/webhooks/add-webhook.md
- https://www.lemlist.com/pricing
- https://help.lemlist.com/en/articles/10213761
- https://lemlist.com/legal/dpa

EmailBison:

- https://docs.emailbison.com/workspaces/creating-workspaces.md
- https://docs.emailbison.com/master-inbox/responding-to-messages.md
- https://docs.emailbison.com/webhooks/events-deliveries-and-attempts.md
- https://emailbison.com/pricing

Saleshandy:

- https://docs.saleshandy.com/en/articles/9271780-saleshandy-client-management-built-for-agencies
- https://docs.saleshandy.com/en/articles/9184111-reply-received-webhook

Mailbox infrastructure:

- https://www.infraforge.ai/pricing
- https://www.infraforge.ai/
- https://help.salesforge.ai/en/articles/10333644-how-to-use-the-mailforge-api
- https://docs.zapmail.ai/
