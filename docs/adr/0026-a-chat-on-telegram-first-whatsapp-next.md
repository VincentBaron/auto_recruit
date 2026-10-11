# Recruiters work from a chat, on Telegram first and WhatsApp next

Recruiters use Auto Recruit from a chat on their phone, so they can build Batches, call and give Recaps from anywhere, without opening a laptop or learning an app.
The first channel is a Telegram bot because it is free, needs no approval and has buttons, voice notes and message editing, so flows can be tried with the first Recruiters right away.
WhatsApp is the target, because French recruiters already live in it, but its Business Platform needs Meta verification, pre-approved templates for any message the bot sends first and a fee per conversation, which would slow down finding the right flows.
The conversation engine knows nothing about the channel, so WhatsApp is one more adapter rather than a rewrite.

## Consequences

- Calls go through the Recruiter's own phone: the Call Sheet carries a number they tap, and dialling through `adb` is dropped.
- A Recap is a voice note, a few words, or one tap for No Answer and Voicemail.
- The chat speaks first only for the morning list of calls due, a Callback falling due, and a Batch ready to review; a low Call List is mentioned in the morning message, never on its own.
- The chat answers in the language the Recruiter writes in.

## Considered Options

- SMS or iMessage, like Instinct: reaches everyone, but no buttons, poor formatting and a cost per message.
- A mobile web app opened from the landing page: full control of the screen, but it is one more app to open instead of the chat Recruiters already have open.
