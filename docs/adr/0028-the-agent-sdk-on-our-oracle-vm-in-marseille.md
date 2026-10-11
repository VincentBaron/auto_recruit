# The Claude Agent SDK runs the Desks on our Oracle VM in Marseille

The chat is served by one process built on the Claude Agent SDK, which loads the `auto-recruit` plugin as it is and runs each turn with Opus inside one Recruiter's Desk folder, reaching Exa through its MCP server.
It runs on the Oracle VM we already have (4 ARM cores, 24 GB, in Marseille), which is far more than a handful of Recruiters need and keeps candidates' personal data in France.
The process runs as its own Unix user that owns the Desks, so the other projects and the Claude Code sessions on the same VM cannot read them; each Desk is pushed every night to its own private GitHub repo as a backup.

## Consequences

- A turn can read and write only its Recruiter's Desk folder and has no shell beyond reading the date, so one Recruiter's turn can never touch another's Desk.
- The Telegram webhook and the scheduler for the pushes and the running Exa searches live in the same process.
- If the VM is lost, a Desk is restored from its last nightly push.

## Considered Options

- Claude Managed Agents: hosted with scheduling built in, but in beta, not eligible for Zero Data Retention, and the Desk would live in memory stores that keep old versions for 30 days instead of in git.
- Railway: no server to look after, but its volumes suit a git-backed Desk less well and the VM is already paid for.
