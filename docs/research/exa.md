# Exa capabilities for prospection and sourcing

Checked: 2026-10-09 (findings may drift; re-verify before relying on prices or plan gates).

## Bottom line

The hosted Exa MCP exposes generic web search and fetch by default; people and company search tools are deprecated there, and Monitors and webhooks are not exposed.
The Search API has `people` and `company` categories with structured entities, but no job-postings category, no open-to-work field, and no date filters on those two categories.
Dated signals (funding, hires, layoffs) have to come from the `news` category.
Exa Monitors give recurring, deduplicated searches pushed to a webhook.
Exa can return emails and phones (Exa Agent, Fiber via Exa Connect, Websets), but provenance is weak: per-field citations are optional URLs, the email/phone lookups do not document their source, and Fiber is US-only with no GDPR position.
No Exa path returns an email verification status.
Suggested split from the research: Exa Monitors for news-based company signals, Agent for people lists, Websets only if its UI and once-a-day cron are wanted.

## 1. Exa MCP server

- Default tools: `web_search_exa` (params `query`, `numResults`) and `web_fetch_exa` (params `urls[]`, `maxCharacters`, default 3000).
- Opt-in tools: `web_search_advanced_exa` (`category`, include/exclude domains, published-date range, `userLocation`, `additionalQueries`, summaries, highlights, `maxAgeHours`, subpages) and `agent_run` (`query`, `outputSchema`, `systemPrompt`, `input.data`, `input.exclusion`, `dataSources` up to 5 Exa Connect providers, `previousRunId`, `effort`, `runId`).
- There is a conflict on `agent_run`: the docs say it is on by default after OAuth or API-key sign-in, while the README table and `src/toolRegistry.ts` mark it `enabled:false, requiresUserProvidedApiKey`.
- Safest is to pass every wanted tool explicitly in `?tools=...`, because an explicit list replaces the defaults.
- Deprecated tools, all off by default: `people_search_exa`, `linkedin_search_exa`, `company_research_exa`, `deep_search_exa`, `deep_researcher_start/check`, `crawling_exa`, `get_code_context_exa`.
- Hosted at `https://mcp.exa.ai/mcp`, or local via `npx exa-mcp-server` with `EXA_API_KEY`.
- Keyless use is limited to 3 QPS and 150 calls/day (changelog 2026-02-02).
- Auth: OAuth via `?login`, or an API key via `x-api-key`, `Authorization: Bearer`, or `?exaApiKey=`.

## 2. Search categories and fields

- Categories: `company`, `people`, `news`, `publication`, `personal site`, `financial report`.
- `people` replaced `linkedin` on 2025-12-19 and covers "1B+ public profiles... not just LinkedIn".
- `pdf`, `github` and `tweet` are being deprecated.
- There is no job-postings category; the docs only say general search "can retrieve job postings".
- `company` and `people` reject `startPublishedDate`, `endPublishedDate` and `excludeDomains` with a 400.
- Use `news` for date-bounded signals like funding rounds or hires.
- Other filters: `includeDomains`/`excludeDomains` (up to 1,200, path prefixes and wildcards allowed), `userLocation` (country or lat/long), up to 100 results.
- Structured `entities` on results:
  - Person: name, location, `workHistory`, `educationHistory`.
  - Company: name, `foundedYear`, workforce, HQ, `financials` (fundingTotal, fundingLatestRound, revenue), `webTraffic`.
- Results also carry text, highlights, and a summary with an optional JSON `schema`.
- There is no open-to-work field and no contact field.
- Search `outputSchema` is limited to 10 properties and 2 nesting levels.

## 3. Websets

- An async list builder: a query, a `count` (a target, not a guarantee), an entity type (`company|person|article|research_paper|custom`), 1-5 `criteria`, and `maxPeoplePerCompany`.
- Verification: each item gets a per-criterion `satisfied: yes|no|unclear` plus `reasoning` and `references`.
- Only items matching all criteria are kept.
- Person items: name, position, company, location, work and education history, LinkedIn URLs for companies and schools.
- Company items: employees, industry, financials, webTraffic.
- Enrichment formats: `text|date|number|options|email|phone|url`, each result with reasoning and references.
- Monitors: 5-field cron plus timezone, at most once per day.
- Monitor `behavior` is `search` (or `refresh`, though the spec is inconsistent) with `append|override`.
- Imports and exclusions: import CSVs or URLs, and use `exclude`/`scope` against other imports or websets.
- Webhooks: 19 event types, for example `webset.item.created`, `webset.item.enriched`, `monitor.run.completed`, with signature verification.
- Not in the main Exa MCP.
- A separate hosted server at `https://websetsmcp.exa.ai/mcp` has 29 tools but no monitor tools.
- The docs now say "Starting a new list-building or enrichment workflow? Use Exa Agent."

## 4. Contact data

Contact data is available only through paid add-ons, never plain Search.

- Exa Agent: request fields typed `format: "email"` or `"phone"` in `outputSchema`.
- Agent pricing: $0.02 per email and $0.07 per phone, charged only per contact found.
- `usage` reports `emails` and `phoneNumbers` counts.
- Exa Connect Fiber.ai (`dataSources:[{provider:"fiber"}]`) reveals work email, personal email and phone.
- Fiber costs 2-5 credits at $0.02 each, and no-match calls are free.
- Fiber claims "850M+ people, 30M+ jobs" and tracks LinkedIn job changes.
- Websets also offers email and phone enrichment.
- Exa documents nothing about sourcing, verification, accuracy or GDPR for these values.
- The docs say "Schema adherence validates shape, not facts" and "Verify results before using them for outreach."

## 5. Contact-data provenance (follow-up fact check)

### Exa Agent

- Response shape (`AgentRunOutput` / `AgentGrounding` / `AgentCitation`): `output.grounding: [{ field: string, citations: [{ url (required), title? }], confidence?: "low"|"medium"|"high"|null }]`.
- Citations are per field, but returned only "when emitted".
- A citation has only `url` and `title`; nothing marks web versus data-provider origin.
- Email and phone lookups are billed separately (`usage.emails`, `usage.phoneNumbers`); pricing calls it "An Agent lookup that returns an email address or phone number".
- Where those email and phone values come from is not documented.

### Fiber

- Normal reveal emails: `{email, type, status: valid|risky|unknown|invalid|null}`.
- Phones: `{number, type}`.
- Instant reveal adds `deliverabilityScore` (0-100) and `isCatchAll`, and "does not re-verify addresses".
- No source or last-verified date on any value.
- Fiber's privacy policy (last updated Aug 30, 2024) lists sources as "Data brokers", "Other customers" (data customers share with it), and "Public sources... such as social media profiles".
- It states "the Service is not intended to be used outside of the United States."
- GDPR is mentioned nowhere in its privacy policy, terms, or docs.
- Contact Reveal takes a LinkedIn identifier as input.

### Websets enrichments

- Shape: `{format: text|date|number|options|email|phone|url, result: string[]|null, reasoning, references: [{title, snippet, url}]}`.
- `references` covers the whole result, not each value in the `result` array.
- The docs only say Websets "searches for" contact information.

### Verification

- No deliverability or verification field exists anywhere in Exa's spec.
- Emails must be verified separately, or Fiber must be called directly.

### GDPR and DPA

- Exa DPA: customer is controller, Exa is processor; EU SCCs Module 2 plus the UK Addendum.
- DPA Annex 1 covers "account information... or any Personal Data contained in User Input" and does not mention contact data Exa returns.
- Exa's privacy policy (updated June 29, 2026) says "publicly available data is not considered 'personal information' under certain data privacy laws".
- No EU data residency is documented.
- Zero Data Retention is Enterprise-only: available for Agent, "Not currently supported" for Websets.

### Pattern worth reusing

Exa's own Google Sheets add-on adds this instruction to Agent runs: "Return only publicly listed business or organization contact details that are source-verifiable... Do not guess email patterns".

## 6. Pricing and rate limits

- Search: instant $4 per 1k requests, fast/auto $7, deep-lite/deep $12, deep-reasoning $15.
- Search prices cover up to 10 results; each result above 10 adds $1 per 1k.
- Contents: $1 per 1k pages per content type.
- Answer: $5 per 1k.
- Search Monitors: $15 per 1k runs.
- Agent: fixed effort from $0.012 (minimal) to $1.00 (xhigh).
- Agent `auto` and `ultra` are metered at $0.10 per ACU plus $0.005 per search, capped at $5 and $20 by default.
- Free tier: $10 per month.
- Rate limits: 10 QPS for search and answer, 5 QPS for deep search, 100 QPS for contents.
- Agent: 5 QPS and 50 active runs.
- Websets: 20 QPS.
- Spending $1k within 30 days raises the limit to 25 QPS.

## 7. Other notable points

- Exa Monitors API (`/monitors`, separate from Websets monitors): a search plus `outputSchema`, run on an interval (minimum 1h), filtered by date, deduplicated against results it already returned, delivered to an HMAC-signed webhook.
- `/research` was retired on 2026-04-01; use search `type: "deep-reasoning"` or the Agent instead.
- `/findSimilar` is deprecated in the spec.
- Agent `input.exclusion` is "not a strict identity guarantee", so deduplicate downstream.
- Batch API (`/search`, `/agent/runs` as JSONL) is Enterprise-only and in beta.

## Unverified

- Whether `agent_run` is on by default in the MCP (docs and code disagree).
- How Websets monitors avoid returning items already seen (docs only describe `append` and say duplicates are "automatically handled").
- Where Websets and Agent email and phone data comes from, and how accurate it is.
- Websets pricing: the live billing page was blocked by a bot check, so figures come from a search-engine snapshot: credits separate from API credits, Starter $49/mo for 8k credits, Pro $449/mo for 100k, a matched result 10 credits, an email or phone 5, other enrichments 2.
- Field-path syntax (e.g. `companies[0].funding`) is documented only for Deep Search, not for Agent.
- Whether Fiber's `status`, `deliverabilityScore` and `isCatchAll` fields pass through Exa Connect into Agent output.
- Whether Websets uses third-party providers for contact data.
- Exa's sub-processor list: the DPA link redirects to a page with no list, and trust.exa.ai needs JavaScript to render.

## Sources

- https://exa.ai/docs/get-started/exa-mcp
- https://github.com/exa-labs/exa-mcp-server
- https://exa.ai/docs/changelog
- https://exa.ai/docs/reference/search
- https://exa.ai/docs/exa-spec.yaml
- https://exa.ai/docs/search/data/companies-people
- https://exa.ai/docs/websets/quickstart
- https://exa.ai/docs/websets/api/monitors/create-a-monitor
- https://exa.ai/docs/websets/api/events/types
- https://github.com/exa-labs/websets-mcp-server
- https://exa.ai/docs/agent/quickstart
- https://exa.ai/docs/agent/connect/fiber
- https://exa.ai/docs/agent/best-practices
- https://exa.ai/pricing
- https://exa.ai/docs/admin/billing
- https://exa.ai/docs/admin/pricing
- https://websets.exa.ai/billing
- https://exa.ai/docs/monitors/quickstart
- https://exa.ai/docs/batch/quickstart
- https://exa.ai/dpa
- https://exa.ai/privacy-policy
- https://exa.ai/docs/admin/security/zero-data-retention
- https://api.fiber.ai/ai-docs/syncQuickContactReveal.md
- https://api.fiber.ai/ai-docs/instantContactReveal.md
- https://www.fiber.ai/privacy
- https://docs.fiber.ai/enrichment/contact-reveal
- https://github.com/exa-labs/exa-for-sheets (Code.gs)
