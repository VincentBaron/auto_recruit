# Markdown files in a private repo instead of a database

In phase 1, Auto Recruit has one user, its author, so everything lives as markdown files in a private git repo (`~/recruit-desk`) that Claude Code reads and rewrites through the skills of the Auto Recruit plugin: no database, no server, no web app.
Git gives history and backup for free, every fact can be read and corrected by hand, and the plugin (skills and conventions) stays separate from the people data so that it can later become the product agencies plug into their own tools through an API or MCP server.

## Consequences

- One fact lives in one file: `CALL_LIST.md` owns who is called next and when; each Prospect or Candidate file owns who they are and what happened on each Attempt.
- Deduplication and "never propose again" rely on searching the files (LinkedIn URL), `SKIPPED.md` and `DO_NOT_CALL.md`; this holds for thousands of people, not millions.
- Multiple Recruiters, Claims, Credits and data isolation between agencies are deliberately absent and come back with the agency product.
