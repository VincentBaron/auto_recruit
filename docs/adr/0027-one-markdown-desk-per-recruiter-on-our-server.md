# One markdown Desk per Recruiter, on our server

Auto Recruit now has a handful of Recruiters, invited one by one, and each gets their own Desk: the same markdown files as before (`DESK.md`), in their own folder versioned with git, on our server.
We kept markdown rather than moving to a database because the plugin's skills run on it unchanged, every fact stays readable and fixable by hand, and a few thousand people per Recruiter fit easily in files.
Only one agent turn writes to a Desk at a time, so a Recap arriving while a Batch is being applied waits rather than overwriting it.

## Consequences

- Push messages are timed by reading the Due column of each Desk's `CALL_LIST.md`; no other index exists.
- Exa and the phone numbers are bought on our accounts, and each Recruiter has a monthly Allowance that we raise by hand.
- A Recruiter gets in only through a personal invite link; anyone else who opens the chat is told we will be in touch, and we are notified.
- A database, self-serve signup and billing come back with the agency product, as ADR 0022 planned.

## Considered Options

- A database with the agent calling tools such as `record_attempt`: easier queries and concurrency, but every skill rewritten and no more fixing a fact by opening its file.
