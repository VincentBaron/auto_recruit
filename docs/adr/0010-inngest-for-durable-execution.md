# Inngest runs our long-lived processes, self-hosted in the EU

Multi-day Sequences, waits for human input, scheduled agent runs and retries against Exa, enrichment and email providers all run as Inngest functions.
Temporal was considered and is the more mature durable-execution engine, but Inngest was chosen for its TypeScript-native step functions that live alongside the app code and its lighter operational footprint.
Inngest Cloud runs only in the US, so we self-host the Inngest server (Postgres and Redis) next to the app in the EU; its SSPL licence does not affect us because we do not offer Inngest as a service.
