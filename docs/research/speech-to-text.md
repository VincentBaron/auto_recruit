# Speech-to-text for French Recaps

Researched 2026-10-11 for transcribing Recaps: 10-60 second Telegram voice notes in casual French, mixed with English job titles, company names and people's names.

## Volume and cost

5 Recruiters × 200 notes × 30 s is about 500 minutes a month, so every provider costs between $1.50 and $8 a month.
Price does not decide; French accuracy on names, context biasing and EU data handling do.

## Comparison

| Provider / model | Batch $/min | French evidence | Names and vocabulary | OGG/Opus | EU / GDPR |
|---|---|---|---|---|---|
| Mistral Voxtral Mini Transcribe 2 | 0.003 | FLEURS-FR 4.32% (vendor); AA-WER 3.6% | `context_bias`, up to 100 terms, "experimental" outside English | API not confirmed | French company, EU-hosted by default (secondary sources); ZDR seemingly enterprise only |
| ElevenLabs Scribe v2 | 0.0037 (+0.0008 keyterms) | AA-WER 2.2%, best independent result | Keyterms, up to 1,000 | Yes | EU residency and zero retention on Enterprise only |
| AssemblyAI Universal-3.5 Pro | 0.0035 (+0.0008 keyterms) | AA-WER 3.1% (U-3 Pro); async in preview | Keyterms or prompt | Not verified | Self-serve EU endpoint at the same price |
| OpenAI gpt-transcribe | 0.0045 | AA-WER 3.3% | `prompt` and `keywords` | Not in the format list | EU residency on new projects with approval |
| Gladia Solaria-3 | 0.010 | AA-WER 3.2% | Custom vocabulary and spelling | Yes | French company, EU infrastructure, audio kept 3 weeks on paid plans |
| Deepgram Nova-3 | 0.0043 (+0.0013 keyterms) | AA-WER 5.2%, weakest | Keyterms; French support unconfirmed | Yes | EU endpoint |
| Google Chirp 3 | 0.016 | AA-WER 4.3% | Not verified | Yes | EU regions |
| Speechmatics Enhanced | 0.0125 | AA-WER 4.0% | Custom dictionary | Not verified | EU processing available |

AA-WER is Artificial Analysis's word error rate over mostly English audio.
No independent French benchmark of these APIs exists, so every French figure is vendor-reported.
No provider publishes latency for a 30 s file; about 1-3 s is estimated for all.

## Decision

Mistral Voxtral Mini Transcribe 2: the cheapest, strong French, an EU company hosting in the EU, and a context-bias list for the names on the Call Sheet.
Plan an ffmpeg step from OGG to MP3 or WAV until OGG support in the API is confirmed.
Runner-up is AssemblyAI on its EU endpoint; ElevenLabs Scribe v2 is the most accurate if EU residency is negotiated.
Before partners arrive, compare Voxtral with the runner-up on 20 real Recaps with a context list such as "Léa Morel, Acme, Forward Deployed Engineer", since vendor WER does not predict how names come out.

## Comparison on real Recaps

Not done yet: it needs 20 of Vincent's real Recaps, which no agent may read.
Protocol, to run before partners arrive:

1. Pick 20 Recaps of Vincent's own, in casual French with English job titles and a person's name, 10 to 60 seconds each; write each one's true transcript by hand.
2. For each, transcribe with Voxtral (`voxtral-mini-latest`, the bot's `VoxtralTranscriber`) and with AssemblyAI on its EU endpoint, giving both the same context list, such as "Léa Morel, Acme, Forward Deployed Engineer".
3. Count, per provider, the wrong words, and separately the names, companies and job titles written wrong.
4. Record the table and the choice here. Keep Voxtral unless AssemblyAI gets clearly fewer names and titles wrong; the `Transcriber` interface makes the swap one class.

Result: pending.

## Not verified

- Mistral: OGG/Opus on the API (the bot converts to MP3 with ffmpeg until confirmed; `VOICE_CONVERT=none` skips it), how `context_bias` is sent in a multipart request (the bot repeats the field once per term), retention period and zero-retention terms.
- AssemblyAI, Speechmatics, Google: OGG support.
- Deepgram: keyterms for French.

## Sources

- https://mistral.ai/news/voxtral-transcribe-2
- https://docs.mistral.ai/capabilities/audio_transcription
- https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602
- https://artificialanalysis.ai/speech-to-text/batch
- https://elevenlabs.io/pricing/api
- https://elevenlabs.io/docs/overview/administration/data-residency
- https://www.assemblyai.com/pricing
- https://developers.openai.com/api/docs/pricing
- https://www.gladia.io/pricing
- https://docs.gladia.io/chapters/limits-and-specifications/data-retention.md
- https://deepgram.com/pricing
- https://cloud.google.com/speech-to-text/pricing
- https://www.speechmatics.com/pricing
