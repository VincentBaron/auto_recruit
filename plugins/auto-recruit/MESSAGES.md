# Messages

How every message to the Recruiter is written.
The chat shows what you write as a small Markdown subset, so a message is easy to scan on a phone and its links and numbers can be tapped.
The bot writes its own cards (Batch review, Morning Rundown) in the same subset.

## Markup

- `**bold**` for a name or a section title, `*italic*` for a label such as *Why now*.
- `[text](https://...)` for a link.
- `> ` at the start of a line for something the Recruiter says aloud: the opener.
- A backslash shows a marker as typed (`\*`, `\[`, `\]`, `\>`), for a name or title that contains one.
- A blank line between blocks. No headings, no tables, no code blocks.

Anything else is shown as typed.

## Rules

- A person's name is always a link to their LinkedIn URL: `[Léa Morel](https://www.linkedin.com/in/leamorel)`.
  Never paste a bare URL after a name.
- A phone number sits alone on its line, in international format without spaces: `+33612345678`.
  The chat makes it tappable, so never wrap it in a link or backticks.
- The only emojis are 📞 at the start of a Call Sheet and ⚠️ before a warning.
- Labels and wording follow the language the Recruiter writes in.
- One idea per message. Keep it short; the details live in the person's file.

## Batch card

One person at a time, shown by the bot with its buttons (see the `batch` skill):

```
4/20
**[Léa Morel](https://www.linkedin.com/in/leamorel)**
CTO, Acme (Paris)
*Why now:* Two FDE postings since the Series B in August
```

The signal URLs stay in the Batch file.
There is no phone number yet, because numbers are found after approval.

## Call Sheet card

It starts with 📞, which tells the bot it is a card and gives it its buttons.
The number is the last line, so the chat can offer to call or copy it.

```
📞 **[Léa Morel](https://www.linkedin.com/in/leamorel)** - CTO, Acme
*Why now:* Two FDE postings since the Series B.
*Opener:*
> Bonjour Léa, Vincent Baron. J'ai vu vos deux postes de FDE.
+33612345678
```

Without a working number, the number line becomes `⚠️ No working number (not found)` or `⚠️ No working number (wrong)`.
**More** adds, below the card, the Signals, the previous Attempts and the Pitch's objections, each short.

## Call List

Hiring Contacts and Candidates under two bold titles, one entry per person, in Call List order, the due slot first and written the way the Recruiter would say it (`Today pm`, `Tomorrow 10:00`, `Thu 15 Oct am`):

```
**1. [Léa Morel](https://www.linkedin.com/in/leamorel)** - CTO, Acme
Tomorrow 10:00 - Callback she asked for
+33612345678
```

An entry without a working number says `⚠️ No working number` on that line.

## Recap confirmation

One or two lines: who, the Call Outcome, and when they come back.
The bot sends the next card by itself.

## Morning Rundown

Written by the bot:

```
**Good morning, here is your day**

**10 calls due today**

**Callbacks**
14:30 Léa Morel, CTO

**1 Batch waiting for review**

⚠️ Your Call List is running low: start a new Batch to fill it.
```

A section with nothing in it is left out.
