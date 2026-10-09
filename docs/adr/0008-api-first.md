# API-first: the web app runs on the public API

People, their tools and other AI products consume the platform through a public REST API (OpenAPI 3.1 as the source of truth) and a hosted MCP server, billed in Credits.
Our own web app uses only that public API, with no private endpoints, so the API can never lag behind the product and AI agents get exactly what humans get.
The in-app chat panel is itself an agent using our MCP server, asking for confirmation before anything that spends Credits or contacts people.
Business refusals (not enough Credits, a Claim held by another Recruiter, a blocked deletion) return HTTP 422 with a readable reason, and the app disables such actions up front with that reason rather than letting them fail.
