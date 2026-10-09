# LLM providers and Inngest: EU data processing

Checked: 2026-10-09 (findings may drift; re-verify before relying on prices or plan gates).

## Bottom line

OpenRouter offers EU in-region routing on its Business and Enterprise plans, with 72 models served from EU endpoints, but OpenRouter itself is a US company.
The Vercel AI SDK can call EU endpoints directly (Claude and Gemini on Vertex, Bedrock, Azure, Mistral) and also supports OpenRouter as a provider.
Mistral is French and offers a contractual EU-only endpoint at 1.1x list price.
Inngest Cloud runs only in the US.
Inngest can be self-hosted (SSPL licence), but its single-node mode is labelled beta, support is not guaranteed, and old Postgres rows are never cleaned up.
Inngest's encryption middleware encrypts step outputs, function outputs and `event.data.encrypted` inside our own infrastructure.

## 1. OpenRouter

### Company

OpenRouter, Inc., 169 Madison Ave, New York, USA.
It is governed by New York law.

### EU in-region routing

EU residency is available on the Business and Enterprise plans only.
Requests to `https://eu.openrouter.ai/api/v1` are decrypted in the EU, routed only to EU endpoints, and "never leave" the region.
If no EU endpoint can serve a model, the request fails with a 404 instead of falling back to a non-EU endpoint.
OpenRouter's own prompt and response logging is skipped on regional endpoints.
A guardrail (`allowed_data_regions: europe`) can block non-EU domains with a 403.
Web search, files, the Batch API and Auto Router are not available on the EU domain.
With your own provider keys (BYOK), you must still deploy your Bedrock, Vertex or Azure resources in the EU yourself.

### EU model list

A live call to `eu.openrouter.ai/api/v1/models` returned 72 models.
Claude Opus, Sonnet and Haiku 5.5, Claude 4.x and others run on `google-vertex/europe` and/or `amazon-bedrock/eu-west-1`.
Mistral models run on `mistral/eu`, Gemini on `google-vertex/eu`, and GPT models on `azure/eu`.
Tools, `response_format` and `structured_outputs` are listed as supported on these endpoints.

### Per-request controls

These sit inside the `provider` object:
- `data_collection: "deny"` (the default is `"allow"`).
- `zdr: true`, which combines with account-level ZDR settings and can only add enforcement, never turn it off.
- `only`, `order`, `ignore`, `allow_fallbacks` (default true), `require_parameters`.

ZDR does not cover plugins or server tools.
ZDR is available on every plan.

### DPA

The DPA is built into the Terms for business use.
The Business plan can get a signed copy, and Enterprise can customise it.
The Enterprise DPA gives 72 hours' breach notice and 30 days' notice of new sub-processors, but AI model providers are excluded from that notice.
The privacy policy relies on SCCs for transfers.

### Fees

Inference is billed at the provider's list price.
The credit-purchase fee is 5.5% on Standard and 8% on Business (as the page states, even though Business costs more), with discounts on Enterprise.
BYOK is free up to $25k per month of list-price usage, then 5%.

### Normalisation across providers

Tool calling uses one OpenAI-style format across providers.
JSON-schema structured output is supported, but strictness varies by provider, so use `require_parameters: true`.
A "Response Healing" plugin can repair malformed JSON.
Prompt caching is not uniform.
OpenAI, DeepSeek and Gemini implicit caching are automatic.
Anthropic (including on Bedrock and Vertex) and explicit Gemini caching need `cache_control`.
Routing stays on the same provider (sticky) for 10 minutes, but setting `provider.order` turns that off.

### The researcher's own inference

OpenRouter remains a US processor even when routing in the EU.
Whether that is acceptable needs a legal call.

## 2. Vercel AI SDK

Checked version: `ai` 7.0.135, Apache-2.0, on npm.

### Providers

Official providers include `@ai-sdk/anthropic`, `@ai-sdk/google-vertex` (Gemini, plus Claude via `@ai-sdk/google-vertex/anthropic` with a configurable `location`), `@ai-sdk/amazon-bedrock` (Converse API, `region`), `@ai-sdk/azure` and `@ai-sdk/mistral`.
OpenRouter is listed under community providers (`@openrouter/ai-sdk-provider`, in a repository owned by OpenRouterTeam).

### Structured output

Structured output is done through `generateText` or `streamText` with `Output.object()`, using Zod or JSON schema.

### Limitations

Strict tool mode is not supported on Bedrock or on Vertex-Anthropic; it is ignored, with a warning.
Bedrock structured output for Anthropic models defaults to a JSON-tool fallback for some models.
Prompt caching is set per provider through `providerOptions`.
It is in preview on Bedrock and pre-GA for Claude on Vertex.
Vertex-Anthropic lacks some Anthropic tools (code execution, web fetch).

## 3. Self-hosted gateways

### LiteLLM

LiteLLM is an MIT-licensed, OpenAI-compatible proxy for 100+ providers.
It offers virtual keys, budgets, fallbacks, load balancing and logging.
It needs Postgres, and Redis is recommended.
SSO and audit logs are paid Enterprise features.

### Portkey

Portkey is now sold as "Prisma AIRS AI Gateway" after Palo Alto Networks acquired it in 2026.
The open-source gateway (MIT) can be self-hosted.
Enterprise offers VPC or hybrid setups where data stays in your environment and Portkey hosts the control plane.
No primary source confirms an EU-hosted region for Portkey's SaaS.

## 4. Mistral AI

### Company

Mistral AI SAS, 15 rue des Halles, Paris, France.

### Hosting

Data is "hosted in the EU by default".
Some features can transfer data outside the EU under Art. 46 safeguards, and Enterprise can switch those features off.
For a contractual guarantee, use the regional endpoint `api.eu.mistral.ai`, served from data centres in the EU and EFTA, at 1.1x list price.
The global `api.mistral.ai` makes "no commitment" on location.
Control-plane data (keys, billing, analytics) may be handled outside the region.

### DPA

The DPA is built into the agreement, effective 2026-07-27, under French law.
There are 10 days to object to a new sub-processor.
Mistral says it cannot sign the DPA offline.

### ZDR

ZDR is available on request only, for paid plans and stateless endpoints.
It does not cover Agents, Conversations, Batch or Files.

## 5. Inngest

### Inngest Cloud location

No EU region was found.
Inngest Cloud runs in AWS us-east-2 (Ohio) plus bare metal in Ashburn, Virginia, and its databases are in the US.
"Multi-region data support" sits in the roadmap Backlog.

### Sub-processors

All sub-processors are in the US: AWS, GCP, ClickHouse (which stores event and step data), PlanetScale and Fivetran.
Vercel is listed as "Global".

### DPA

A standard signed DPA is available for paid plans, requested through a support ticket.

### Self-hosting

Self-hosting has been supported since 1.0, and the latest release is v1.46.0 (2026-10-06).
`inngest start` runs as a single binary using SQLite and an embedded Redis by default.
Production setups use `--postgres-uri` and `--redis-uri`, and there is a Helm chart.
The single-node mode is labelled "Beta", and support for self-hosted installs is not guaranteed.
Old Postgres rows are never cleaned up automatically.
`/metrics` has no authentication by default.

### Licence

The server is under SSPL, converting to Apache-2.0 three years after each release (per LICENSE.md on GitHub).
The SDKs (`inngest` 4.22.0) are Apache-2.0.

### Encryption middleware

`@inngest/middleware-encryption` 2.0.0 is available, also for Python; Go is not supported yet.
Encryption and decryption happen in your own infrastructure.
It encrypts all step outputs, function outputs, and only `event.data.encrypted`.
Other event fields stay in plaintext.
Key rotation is supported through fallback keys.
The algorithm is not stated on the page.

### Retention on Inngest Cloud

Trace and log history is 24 hours on Free, 7 days on Pro and 14 days on Business.
For Enterprise, the pricing page says 90 days but the limits page says up to 365 days, so the docs conflict.

## Unverified

The Mistral 30-day default retention for abuse monitoring appeared only in a search snippet, because the privacy policy page did not load.
Whether Inngest Cloud actually deletes event and step payloads when the retention window ends could not be confirmed.
No primary source confirms an EU-hosted region for Portkey's SaaS.
That OpenRouter remains a US processor under EU routing, and that this needs a legal call, is the researcher's inference.

## Sources

OpenRouter:
- https://openrouter.ai/terms
- https://openrouter.ai/docs/guides/features/in-region-routing
- https://openrouter.ai/docs/guides/features/sovereign-ai
- https://openrouter.ai/docs/features/provider-routing
- https://openrouter.ai/docs/features/zdr
- https://openrouter.ai/pricing
- https://openrouter.ai/privacy
- https://openrouter.ai/terms-of-service-enterprise
- https://openrouter.ai/docs/guides/features/tool-calling
- https://openrouter.ai/docs/features/structured-outputs
- https://openrouter.ai/docs/features/prompt-caching

Vercel AI SDK:
- https://ai-sdk.dev/providers/ai-sdk-providers
- https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex
- https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock
- https://ai-sdk.dev/providers/community-providers/openrouter

Self-hosted gateways:
- https://docs.litellm.ai/docs/simple_proxy
- https://portkey.ai/pricing
- https://portkey.ai/docs/self-hosting/hybrid-deployments/architecture

Mistral:
- https://docs.mistral.ai/inference/regional-inference
- https://help.mistral.ai/en/articles/347629
- https://legal.mistral.ai/terms/data-processing-addendum/
- https://docs.mistral.ai/admin/monitor-comply/zero-data-retention

Inngest:
- https://www.inngest.com/docs/platform-and-operations/cloud-architecture-and-security
- https://www.inngest.com/security
- https://roadmap.inngest.com/request
- https://trust.inngest.com/subprocessors
- https://www.inngest.com/docs/self-hosting
- https://github.com/inngest/inngest/blob/main/LICENSE.md
- https://www.inngest.com/docs/features/middleware/encryption-middleware
- https://www.inngest.com/pricing
- https://www.inngest.com/docs/usage-limits/inngest
