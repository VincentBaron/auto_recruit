# Auto Recruit bot

A Telegram chat on top of the `auto-recruit` plugin (ADRs 0026 to 0028). One message is usually one agent turn (a Recap is two: the Recap, then the next Call Sheet), run on the Claude Agent SDK (Opus 5.5) inside the sender's Desk folder.

- `src/engine.ts`: the conversation engine, with no Telegram types. One turn at a time per Desk, resumed session per Recruiter, a git commit after each turn.
  It also runs the calling session: the menu, the buttons of a Call Sheet card (a reply starting with 📞), Undo of a Recap (one `git reset` of the Desk's last commit, offered only while that commit is the last one), the next card after each Recap, "aide" and "stop".
- `src/desk-guard.ts`: what a turn may do: files of its own Desk only, `date` as the only shell, the Skill tool and Exa.
- `src/telegram.ts`: the Telegram adapter (long polling, typing, messages split under 4096 characters). WhatsApp will be a second adapter.
- `src/review.ts`: the Batch review, one card at a time with Keep, Skip and Keep the rest; every decision is written to the Batch file (`src/batch-file.ts`) as it happens, so a review resumes at the next undecided card.
- `src/scheduler.ts`: every minute, checks the Search run saved in each `Searching` Batch, has the agent rank the people when it ends, and says "Your Batch is ready to review" unless it is between 20:00 and 08:00 in the Recruiter's `timezone` (default `Europe/Paris`, set in `recruiters.json`).
- `src/registry.ts`: `recruiters.json` in the data folder, a list of `{ "channel": "telegram", "userId": "123", "desk": "/srv/auto-recruit/desks/1", "name": "Camille Dupont", "timezone": "Europe/Paris", "language": "fr" }`. Invites append to it.
- `src/concierge.ts`: the front door. Vincent's admin lines (`invite Camille Dupont`, `raise Camille to 6 Batches`, `give Camille €30 more for numbers`) work only from `ADMIN_TELEGRAM_ID`; `/start <code>` creates a Desk once; strangers get "On vous recontacte" and Vincent a ping; Allowance and failure pings go to Vincent.
- `src/allowance.ts`: monthly Allowance per Desk (default 4 Batches, €50). A Batch starts when its `batches/*.md` file is created; spend is the `Phone: ... (Exa, date)` lines of the month times `PHONE_PRICE_EUR` (default 0.5). The tool gate refuses past it. Files `invites.json`, `allowances.json`, `enrichment-failures.json` live in the data folder.
- `src/niche-file.ts`: checks a `niches/<slug>.md` against the `DESK.md` format. The first conversation: the concierge sends the welcome (Telegram first name and language, French by default) and tells the engine to run the `niche` skill as a chat; a Niche written in a turn is checked (one fix turn if wrong), then offered with an approve button; approving starts the first Batch and says the bot will write when it is ready.
- `src/dpa.ts`: the data processing agreement of ADR 0029. The welcome message links `DPA_URL` and asks the Recruiter to accept it with a button (or "j'accepte"); until then the concierge answers every message with the same ask and no agent turn runs. The acceptance and its date are `dpaAcceptedAt` in `recruiters.json`; then the first question of the Niche discussion comes. A Recruiter registered before this existed is asked once too.
- `src/erasure.ts`: "Efface Sophie Leroy" (also `supprime`, `oublie`, `erase`, `forget`, `delete`, `remove` followed by a first and last name) is done by the concierge, not by an agent turn, between two turns of the Desk: the person's files go, their sections, list items and rows go from every other file, and one line (date, name, LinkedIn URL) goes to `DO_NOT_CALL.md`. Then the Desk is committed, its git history squashed to one commit (`squashHistory`), the backup replaced, and the agent session dropped. One line confirms it.
- `src/partnership.ts`, `src/zip.ts`, `src/desk-deletion.ts`: Vincent writes "end Camille's partnership". Camille gets her Desk as a zip of its markdown files, the agents stop for her, and `partnerships.json` counts: reminders on day 15 and day 27 (never between 20:00 and 08:00), then on day 30 the backup repo is deleted through the GitHub CLI and the Desk folder is removed (only a folder directly under `desks/`), and Vincent is told. A failure is reported once and retried every minute. Everything destructive goes through the `DeskDeleter` interface; tests use fakes and temp folders only.
- `src/backup.ts`: pushes each Desk to its `origin`, a private GitHub repo.

## Run

```
npm install
EXA_API_KEY=... TELEGRAM_BOT_TOKEN=... ADMIN_TELEGRAM_ID=... DPA_URL=... [PHONE_PRICE_EUR=0.5] AUTO_RECRUIT_DATA=/srv/auto-recruit npm start
```

The Agent SDK needs Anthropic credentials for the service user (`ANTHROPIC_API_KEY`).

## Deploy on the Oracle VM

1. Create the `autorecruit` user, clone this repo to `/opt/auto_recruit`, run `npm install` in `bot/`.
2. Copy `~/recruit-desk` to `/srv/auto-recruit/desks/1`, owned by `autorecruit` and mode 700, add its private GitHub repo as `origin`, and list it in `/srv/auto-recruit/recruiters.json` with Vincent's Telegram user id.
3. Put `EXA_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `DPA_URL` (the link to the DPA, no default) and `ANTHROPIC_API_KEY` in `/etc/auto-recruit/env` (mode 600).
4. Copy `deploy/*` to `/etc/systemd/system/`, then `systemctl enable --now auto-recruit-bot.service auto-recruit-backup.timer`. The bot restarts on failure and on reboot.

The 30-day deletion calls `gh repo delete` as the service user: `gh` must be logged in there with the `delete_repo` scope.

## Test

`npm run typecheck && npm test`
