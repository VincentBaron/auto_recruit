# Auto Recruit bot

A Telegram chat on top of the `auto-recruit` plugin (ADRs 0026 to 0028). One message is one agent turn, run on the Claude Agent SDK (Opus 5.5) inside the sender's Desk folder.

- `src/engine.ts`: the conversation engine, with no Telegram types. One turn at a time per Desk, resumed session per Recruiter, a git commit after each turn.
- `src/desk-guard.ts`: what a turn may do: files of its own Desk only (plus reading the plugin, whose skills read its `DESK.md`), `date` as the only shell, the Skill tool and Exa. It runs as a PreToolUse hook, so it also sees the calls a skill's `allowed-tools` pre-approves.
- `src/telegram.ts`: the Telegram adapter (long polling, typing, messages split under 4096 characters). WhatsApp will be a second adapter.
- `src/registry.ts`: `recruiters.json` in the data folder, a list of `{ "channel": "telegram", "userId": "123", "desk": "/srv/auto-recruit/desks/1" }`. Unknown users are ignored.
- `src/backup.ts`: pushes each Desk to its `origin`, a private GitHub repo.

## Run

```
npm install
EXA_API_KEY=... TELEGRAM_BOT_TOKEN=... AUTO_RECRUIT_DATA=/srv/auto-recruit npm start
```

The Agent SDK needs Anthropic credentials for the service user (`ANTHROPIC_API_KEY`).

The Agent SDK is pinned to an exact version because it bundles its own Claude Code: `0.3.285` ships Claude Code 2.1.285, the newest version our organization allows. A newer SDK refuses to start, so bump it only when the organization raises its cap.

## Deploy on the Oracle VM

1. Create the `autorecruit` user, clone this repo to `/opt/auto_recruit`, run `npm install` in `bot/`.
2. Copy `~/recruit-desk` to `/srv/auto-recruit/desks/1`, owned by `autorecruit` and mode 700, add its private GitHub repo as `origin`, and list it in `/srv/auto-recruit/recruiters.json` with Vincent's Telegram user id.
3. Put `EXA_API_KEY`, `TELEGRAM_BOT_TOKEN` and `ANTHROPIC_API_KEY` in `/etc/auto-recruit/env` (mode 600).
4. Copy `deploy/*` to `/etc/systemd/system/`, then `systemctl enable --now auto-recruit-bot.service auto-recruit-backup.timer`. The bot restarts on failure and on reboot.

## Test

`npm run typecheck && npm test`
