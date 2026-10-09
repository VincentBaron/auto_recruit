# Hosting on Railway's EU region, with no personal data in logs

The web app, API, MCP server, self-hosted Inngest (with its own Postgres and Redis) and our telemetry stack run on Railway's EU West region in Amsterdam.
Railway stores all platform logs in the US whatever the deploy region, so personal data must never reach logs: logs carry identifiers only, a redaction step strips anything else, and our own logs and traces go to an OpenTelemetry collector and self-hosted Langfuse in the same EU region.
EU-owned hosts (Scaleway, Clever Cloud) were considered; Railway was kept for its developer experience, since US companies are in the data path anyway (Google, Microsoft, OpenRouter) and the commitment we make is that personal data is stored and processed in the EU.
Self-hosted Inngest never deletes old rows on its own, so a cleanup job applies our retention rules to it, its version is pinned, and its dashboard and metrics endpoint stay private.
