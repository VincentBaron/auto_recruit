# The main database runs on Railway Postgres, so the whole system is operated from one place

All personal data lives in the main Postgres database, which runs as Railway Postgres in the EU West (Amsterdam) region with high availability (automatic failover across replicas), point-in-time recovery, PgBouncer and pgvector.
Operating and monitoring everything from Railway was preferred over a separately managed Aiven Postgres (Business plan in `google-europe-west4`), which offered managed restores and database support but a second console and a public network path.
The cost of that choice is ours to carry: a point-in-time restore creates a new service that we switch over to by hand, so a written and rehearsed restore runbook is required, and Railway does not support or tune the database.
With PgBouncer in transaction mode, the Workspace used by row-level security is set per transaction (`SET LOCAL`), never per session.
Inngest's own Postgres and Redis run as separate Railway services.
