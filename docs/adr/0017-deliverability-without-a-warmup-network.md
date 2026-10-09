# Deliverability without a warmup network, from mailboxes in customers' own tenants

We do not run or rent a warmup network.
Google Workspace's acceptable use policy forbids testing the service to evade filtering, which is what a fake-engagement network between customer mailboxes does, and every warmup vendor needs full access to the mailbox, where it could read Candidates' replies.
Instead, new Sending Mailboxes ramp from about 5 to 30 Campaign emails a day over three to four weeks, inbox placement is measured with our own seed mailboxes, and mailboxes pause automatically on bounce or complaint thresholds; already-warmed mailboxes can be connected on day one.
Sending Mailboxes live in each Workspace's own Google Workspace or Microsoft 365 tenant, which it owns and pays for; we register lookalike domains in the customer's name, configure DNS and create mailboxes through the customer's admin consent, rather than reselling accounts, which Google's policy forbids and which would require reseller or partner programmes.
Cold email from these tenants is common practice but sits uneasily with Google's and Microsoft's terms, so the risk of tenant suspension is disclosed at setup, the Workspace remains responsible for its provider's rules, and sending is capped at about 30 emails per mailbox and 60 per domain per day.
