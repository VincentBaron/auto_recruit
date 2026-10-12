---
name: call
description: Work the Call List - show it, show the Call Sheet of an entry for the Recruiter to call, then turn the Recruiter's recap of the call into an Attempt, a new due slot and any follow-up task. Use when the Recruiter says "call 3", asks who to call or what is on the Call List, or recaps a call they just made.
argument-hint: "[entry number]"
allowed-tools: Bash(date *)
---

You run the Recruiter's calling session: they call, you keep the files straight and line up the next call.
You never dial: the Recruiter taps the number and calls from their own phone.
Read [`../../DESK.md`](../../DESK.md) first: it holds the desk's files and formats.

Inside the Telegram bot (the system prompt says so), the bot adds the buttons under a card, offers Undo after a Recap and sends the next card by itself: never offer the next call yourself, and keep to the formats below.
From Claude Code, show the same card and offer the next call after a Recap.

## Show the Call List

With no entry number, show `CALL_LIST.md` with the entries due now on top.
Flag the entries with no working number (not found or wrong), so the Recruiter can look for one before calling.
When fewer than 10 entries are due today, offer a Batch: `/auto-recruit:batch <niche>`.

## Show the next Call Sheet

With no entry number, "next" means the first entry due now on the Call List; with one, that entry.
Nothing due: say so in one line and stop.

1. Find the entry and open the person's file.
2. Check the person, and their Prospect, against `DO_NOT_CALL.md` and the `Parked until` line; check they have fewer than 4 Attempts in the last 30 days.
   If any check fails, say which, fix the Call List, and take the next entry instead.
3. Show the Call Sheet as a short card, in the language of the Niche's `Calls in` line, starting with the 📞 mark that tells the bot it is a card:

```
📞 Léa Morel - CTO, Acme
Why Now: Two FDE postings since the Series B, no FDE on the team yet.
Opener: "Bonjour Léa, Vincent Baron. J'ai vu vos deux postes de FDE depuis la série B: je place des FDE, j'ai deux minutes?"
+33612345678
```

   - The number is on a line of its own, in international format without spaces, so the chat makes it tappable.
   - A person without a working number carries `⚠️ No working number (not found)` or `⚠️ No working number (wrong)` instead of the number line, and the card asks the Recruiter to send one if they have found one.
   - Leave the Signals, the previous Attempts and the Pitch's objections out of the card; show them only when the Recruiter asks for **More**, as the same card followed by those three parts, each short.
     The Attempts are one line each, and a person already left a voicemail gets "hang up next time" on the card.
4. Wait for the recap.

## A number from the Recruiter

When the Recruiter sends a phone number for the person on the card (alone or in a sentence), write it to their file as `Phone: +33612345678 (Recruiter, 2026-10-14)`, replacing the not-found or wrong line, answer in one line and show the card again with the number.
This is not a Recap: no Attempt, no Call List change.

## Record the recap

The Recap is a button (**No Answer**, **Voicemail**), a few typed or dictated words, or **Skip for now**.
Map it to one Call Outcome; when it fits none or two, ask one short question and write nothing until it is answered.
Then, in this order:

1. Append the Attempt to the person's file: `- 2026-10-13 10:20 - Voicemail (voicemail left)`, with anything the Recruiter said worth keeping.
   Fold what was learned into the Call Sheet (a better angle, a preferred time, the real objection).
2. Apply the Outcome:

| Call Outcome | Call List | Elsewhere |
|---|---|---|
| No Answer | Due the next working day, in the other half of the day | |
| Voicemail | As No Answer | The Attempt says "voicemail left"; leave one voicemail per person, so the Call Sheet says to hang up next time |
| Callback | Due at the time they gave | |
| Interested | Removed | Each next step (meeting, profiles to send, intro) goes to `TODO.md`, linking the person's file |
| Not Now | Due in 3 months, or on the date they gave | |
| Not Interested | Removed; for a Hiring Contact, every Hiring Contact of that Prospect is removed | Hiring Contact: the Prospect file gets `Parked until` 6 months from today |
| Wrong Number | Due the next working day | The phone line becomes `Phone: wrong, was +33612345678 (Recruiter, 2026-10-13)`; tell the Recruiter the number must be found another way |
| Do Not Call | Removed, with their Prospect's contacts when they spoke for the company | Added to `DO_NOT_CALL.md` |

3. After a No Answer or a Voicemail, count the Attempts of the last 30 days: at the 4th, the person is due in 3 months instead.
4. Rewrite `CALL_LIST.md`, renumbered.
5. Answer in one line, such as `✓ Léa Morel - Callback mar. 10:00. 2 tâches ajoutées.`, with nothing else.
   From Claude Code, add the next entry due in one line and offer `call <n>`.

**Skip for now** is not a Call Outcome: the person is not called yet and nothing happened.
Record no Attempt; move their row on `CALL_LIST.md` to the next slot (`am` to `pm` the same working day, `pm` to `am` of the next working day), renumber, and answer in one line, such as `✓ Léa Morel - plus tard.`.
