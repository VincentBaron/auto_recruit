# Sensitive personal data is encrypted by the application, and every access is audited

OAuth tokens and contact details (emails, phone numbers) are envelope-encrypted by the application, on top of the database's own encryption at rest: each value gets a data key, and data keys are wrapped by a versioned master key.
The master key is a sealed Railway variable held by the application services, never stored in the database, so a database dump, a leaked backup or SQL-level access exposes nothing; only a compromise of the application environment itself would.
A managed key service (for example Google Cloud KMS in `europe-west4`) can take over the master key later by re-wrapping the data keys, without changing how values are stored.
Every read or export of personal data and every outreach action is written to an audit log (who, when, what), because Data Requests, CNIL inspections and the AI Act's logging duties all need that trail.
