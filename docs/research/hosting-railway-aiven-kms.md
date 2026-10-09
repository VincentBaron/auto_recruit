# Hosting: Railway, Aiven Postgres and EU key management

Checked: 2026-10-09 (findings may drift; re-verify before relying on prices or plan gates).

## Bottom line

Railway has one EU region, EU West Metal in Amsterdam, and services and volumes can be pinned there.
Railway staff say all logs (application, deploy, build, HTTP) are stored in US West whatever the deploy region, and Railway's DPA makes no EU residency commitment.
Railway Postgres is now technically capable (HA with failover, PITR, PgBouncer, pgvector in the official image), but it is a template container on a volume and Railway support will not tune databases.
Aiven (Aiven Oy, Finland) offers managed Postgres in Netherlands and Paris regions, and its DPA keeps personal data in the EEA when an EEA hosting sub-processor is chosen.
For envelope encryption, Google Cloud KMS is available in Paris and the Netherlands; OVHcloud KMS is a French alternative without a formal GA statement.

## 1. Railway regions

Railway has one EU region: EU West Metal in Amsterdam (`europe-west4-drams3a`).
It runs on Railway Metal, hardware Railway owns.
The docs don't name the datacenter operator.
Services can be pinned to a region, and volumes follow their service.
Storage buckets have a fixed region, `ams` for Amsterdam.

### Logs

Railway staff wrote on their forum in September 2026: "all logs (application, deploy, build, HTTP) are stored in US West regardless of deploy region".
A second staff reply says "California".
Backups and PITR data follow the deploy region.
Support staff may access data from the US or other countries.

## 2. Railway Postgres and Redis

### Postgres

Postgres is a container from a template (the official `postgres-ssl` image) running on a volume.
Railway now adds features you switch on yourself:
- Volume backups: daily kept 6 days, weekly kept 27 days, monthly kept 89 days.
- PITR via pgBackRest, with a window of about 4 weeks and WAL archived every 60 seconds; a restore creates a separate new service and you switch over by hand.
- HA with automatic failover (Patroni, etcd and HAProxy), 2-7 replicas, Postgres 14-18, official images only.
- In-place major version upgrades with a revert option.
- PgBouncer, in transaction mode by default.

Railway support won't tune your database.
pgvector is in the official image: the Dockerfile installs `postgresql-17-pgvector=0.8.*`.
This contradicts the docs, which say the templates ship no extensions.

### Limits

- 3,000 read and 3,000 write IOPS per volume, at any size.
- Up to 1 TB on Pro; more needs Enterprise.
- One volume per service, and volumes can't be used with replicas.
- Redeploying a service with a volume causes brief downtime.

### Redis

Redis is the stock Docker image with volume backups and optional HA (Sentinel).
The docs say nothing about AOF/RDB persistence or maxmemory.

### Note on row-level security

The researcher inferred (not from the docs) that with PgBouncer in transaction mode, the tenant should be set with `SET LOCAL` or `set_config(...,true)` inside each transaction.

## 3. Railway compliance

The contracting entity is Railway Corporation, San Francisco.
The DPA is signed via DocuSign.
It includes the 2021 EU SCCs (Irish law), the UK addendum and the EU-US DPF, and gives 10 days' notice before new sub-processors.
It says "primary processing" is in the US and makes no EU residency commitment.
The Trust Center lists SOC 2 Type 2, SOC 3, HIPAA, GDPR and DPF.
There is no ISO 27001.
The published sub-processor list (Fathom, Cloudflare, Causal, Customer.io, Stripe) has no locations, and it leaves out GCP, AWS and DataPacket, which staff call active sub-processors.
Enterprise adds dedicated hosts, SSO, environment RBAC, audit logs and SLAs.
The HIPAA BAA is an add-on with a minimum monthly spend.

## 4. Railway networking and platform

- Private networking between services in one environment (`*.railway.internal`, WireGuard).
- Static outbound IPs on Pro: IPv4, tied to the region, possibly shared with other customers.
- Custom domains get automatic Let's Encrypt TLS.
- HTTP requests can run up to 15 minutes; WebSockets have no limit.
- Secrets: sealed variables are hidden in the UI and API; no documented integration with an external secrets manager was found.
- Separate environments per stage, plus PR environments created and deleted automatically.
- Horizontal replicas are set by hand; there is no metric-based autoscaling.
- Cron jobs run at most every 5 minutes, in UTC, and a run is skipped if the previous one is still going.
- Health checks run only at deploy time and give zero-downtime deploys, except for services with a volume.

## 5. Inngest on Railway

There is no official Inngest or Railway guide.
Marketplace templates come from the community.
For example, "Inngest" by A3A runs Caddy with basic auth, Redis 8.2 and Postgres 18, uses the unpinned `inngest:latest` image, and shows 1 deploy.

Inngest's own docs say:
- Single-node mode is labelled beta.
- External storage is configured with `INNGEST_POSTGRES_URI` and `INNGEST_REDIS_URI`.
- Ports are 8288 (API/UI) and 8289 (Connect).
- The dashboard and `/metrics` have no auth, so keep them private or behind a proxy.
- Old Postgres rows are never deleted, which is a GDPR retention issue.
- Support for self-hosted instances isn't guaranteed.

The licence is SSPL, converting to Apache 2.0 three years after each release.
The SDKs are Apache 2.0.

## 6. EU managed Postgres alternatives

| Provider | EU region | PITR | HA | pgvector |
|---|---|---|---|---|
| Aiven | Paris on AWS, GCP and OVH (see section 7 for Netherlands) | Backups kept 2, 14 or 30 days (Startup, Business, Premium) | Automatic failover on Business and Premium | Yes |
| Supabase | Paris and Frankfurt | 7, 14 or 28 days as an add-on (about $100-400/month) | Only in private alpha (Multigres), not covered by the SLA | Yes |
| Neon | Frankfurt and London; no Paris | 7 days (Launch) or 30 days (Scale) | Storage replicated, but compute is restarted rather than failed over (1-10 minutes if an availability zone fails) | Yes |
| Crunchy Bridge | AWS Paris and Frankfurt | 10 days | Hot standby (not on Hobby) | Yes |
| PlanetScale Postgres | Frankfurt, Dublin and London; Paris not confirmed | Yes, retention figure not found | Primary plus 2 replicas across availability zones by default, failover under 30 seconds | 0.8.5 |

Crunchy Bridge has been owned by Snowflake since June 2025, and its changelog is still active.

## 7. Aiven for PostgreSQL in detail

Netherlands regions: `google-europe-west4`, `azure-westeurope`, `do-ams`, `upcloud-nl-ams`, plus OCI `eu-amsterdam-1` (BYOC only).
The docs list no separate Eemshaven region; that is just where `google-europe-west4` physically sits.
Paris regions: `aws-eu-west-3`, `google-europe-west9`, `azure-france-central`, `avn-ovh-par`, plus OCI `eu-paris-1` (BYOC only).
The Business plan starts at $180 per month, with 2 nodes, automatic failover and 14-day backups.
It runs on the same clouds as Startup (AWS, DO, GCP, Azure, OVH, UpCloud).
Backups are stored in object storage in the service's own region.
The company is Aiven Oy, Helsinki, Finland.
DPA section 9: if you pick an EEA hosting sub-processor, Aiven must store personal data in the EEA.
It guarantees the EEA, not the exact region; the April 2023 sub-processor list says the selected region.

## 8. EU key management services

| Service | Regions | Price | Notes |
|---|---|---|---|
| Google Cloud KMS | europe-west9 (Paris) and europe-west4 (Netherlands), including HSM | Software keys $0.06 per key version per month and $0.03 per 10k operations; HSM keys about $1-2.50 per key | Reachable from outside Google Cloud with a service account key |
| AWS KMS | eu-west-3 (Paris) | $1 per key per month and $0.03 per 10k requests, 20k free requests a month | Reachable from outside AWS with an IAM access key |
| Scaleway Key Manager | Paris, Amsterdam, Warsaw, Milan (Scaleway SAS) | €0.06 per key version and €0.03 per 10k operations | Has `generate-data-key`; authenticates with an `X-Auth-Token` API key |
| OVHcloud KMS | Listed as "Available in all regions"; Paris endpoint `eu-west-par.okms.ovh.net` | $0.063 per key per month, unlimited API calls | REST datakey endpoint; authenticates with a personal access token (PAT) or service account |

## Recommendations from the research

Running compute on Railway in Amsterdam is workable, and Railway Postgres is now technically adequate.
Before committing, get two things from Railway in writing: whether EU log storage is available, and the region of the PITR bucket.
Until then, keep personal data out of logs.
For a stronger EU-only guarantee on the main database, use a managed provider such as Aiven Business, connected from Railway over TLS with Railway's static IPs allowlisted.
Aiven `google-europe-west4` is multi-zone for HA and a few milliseconds from Amsterdam; `upcloud-nl-ams` is the choice for EU-owned providers only.
Run Inngest on its own Railway Postgres and Redis, with the image version pinned and a retention cleanup job.
For KMS, use Google Cloud KMS in europe-west4 if a US provider is acceptable, otherwise OVHcloud KMS in eu-west-par (French, flat price, has a datakey API).
Because Railway is a US company, US legal access to data (CLOUD Act) applies whatever region is chosen; this is the researcher's reading, not legal advice.

## Unverified

Where Railway stores metrics, which edge location public traffic enters through, and which region holds the PITR bucket Railway auto-creates are not covered by the docs.
Whether Inngest supports Redis Sentinel was not verified.
The Amsterdam-Paris latency was not measured.
Whether the Aiven Business plan is offered in each specific region (there is no per-region table), and whether PITR is offered per plan, could not be verified; check with `avn service plans` or in the console.
Scaleway Key Manager's GA status is unverified: the API path is still `v1alpha1` and the product page makes no GA claim.
OVHcloud KMS is orderable but has no formal GA statement.
Google Cloud KMS and AWS KMS access from outside their clouds was not re-checked against their docs.
The RLS note about PgBouncer transaction mode is the researcher's inference.

## Sources

Railway:
- https://docs.railway.com/deployments/regions
- https://docs.railway.com/platform/railway-metal
- https://docs.railway.com/reference/volumes
- https://station.railway.com/questions/processing-countries-and-remote-support-a54ea717
- https://docs.railway.com/reference/backups
- https://docs.railway.com/volumes/point-in-time-recovery
- https://docs.railway.com/databases/postgresql-ha
- https://docs.railway.com/databases/postgresql-major-upgrade
- https://docs.railway.com/databases/postgresql-pgbouncer
- https://docs.railway.com/databases
- https://github.com/railwayapp-templates/postgres-ssl/blob/main/Dockerfile.17
- https://docs.railway.com/databases/redis
- https://railway.com/legal/dpa
- https://trust.railway.com
- https://trust.railway.com/item/subprocessors
- https://docs.railway.com/enterprise/compliance
- https://docs.railway.com/networking/public-networking/specs-and-limits
- https://docs.railway.com/reference/scaling
- https://docs.railway.com/reference/healthchecks

Inngest on Railway:
- https://railway.com/deploy/inngest
- https://www.inngest.com/docs/platform-and-operations/self-host-inngest
- https://github.com/inngest/inngest/blob/main/LICENSE.md

EU managed Postgres:
- https://aiven.io/docs/platform/reference/list_of_clouds
- https://aiven.io/docs/products/postgresql/concepts/high-availability
- https://aiven.io/pricing?product=pg
- https://aiven.io/docs/platform/concepts/service_backups
- https://aiven.io/invoice
- https://aiven.io/dpa
- https://supabase.com/docs/guides/platform/backups
- https://neon.com/docs/introduction/high-availability
- https://docs.crunchybridge.com/concepts/backups
- https://planetscale.com/docs/postgres/extensions

Key management:
- https://docs.cloud.google.com/kms/docs/locations
- https://cloud.google.com/kms/pricing
- https://aws.amazon.com/kms/pricing/
- https://www.scaleway.com/en/developers/api/key-manager
- https://www.scaleway.com/en/docs/key-manager/faq/
- https://www.ovhcloud.com/en/identity-security-operations/key-management-service/
- https://docs.ovhcloud.com/en/guides/manage-and-operate/kms/kms-usage
