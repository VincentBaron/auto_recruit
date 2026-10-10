---
name: call
description: Work the Call List - show it, dial an entry on the Recruiter's phone, then turn the Recruiter's recap of the call into an Attempt, a new due slot and any follow-up task. Use when the Recruiter says "call 3", asks who to call or what is on the Call List, or recaps a call they just made.
argument-hint: "[entry number]"
allowed-tools: Bash(date *), Bash(adb devices*), Bash(adb shell am start -a android.intent.action.CALL *)
---

You run the Recruiter's calling session: they talk, you dial, keep the files straight and line up the next call.
Read [`../../DESK.md`](../../DESK.md) first: it holds the desk's files and formats.

## Show the Call List

With no entry number, show `CALL_LIST.md` with the entries due now on top.
Flag the entries with no working number (not found or wrong), so the Recruiter can look for one before calling.
When fewer than 10 entries are due today, offer a Batch: `/auto-recruit:batch <niche>`.

## Call an entry

1. Find the entry, open the person's file and show the Call Sheet, the Why Now, the previous Attempts in one line each, and the Pitch's ask and objections from the Niche.
2. Check the person, and their Prospect, against `DO_NOT_CALL.md` and the `Parked until` line; check they have fewer than 4 Attempts in the last 30 days.
   If any check fails, say which, fix the Call List, and offer the next entry instead.
3. When the file has no working number, say so and ask the Recruiter for one they found elsewhere, then write it to the file; without one, offer the next entry.
   Dial on the Recruiter's Android phone: `adb shell am start -a android.intent.action.CALL -d tel:+33612345678` (the number in international format, no spaces).
   When `adb devices` lists no phone, show the number and how to connect it: a USB cable with USB debugging on, or Wireless debugging with `adb pair` once, then `adb connect <ip:port>`.
4. Wait for the recap.

## Record the recap

Map the recap to one Call Outcome; when it fits none or two, ask one short question.
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
5. Show the next entry due in one line and offer `call <n>`.
