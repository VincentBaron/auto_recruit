# Sign-in uses Better Auth and never requests mailbox access

Accounts, sessions, organisations, roles and API Keys are handled by Better Auth inside our own Postgres, rather than a hosted identity provider such as Clerk or WorkOS, so account data stays in our EU database.
Signing in with Google or Microsoft requests identity scopes only.
Connecting a Sending Mailbox, or granting read access to learn a Voice Profile, is a separate, explicit consent with its own scopes, so nobody grants mailbox access just to log in and those tokens can be revoked independently.
