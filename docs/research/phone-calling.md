# Phone outreach in France: rules, numbers and telephony

Checked on 2026-10-10, for the move from email outreach to calls made by the Recruiter.
Phase 1 is personal use and does not apply these rules strictly; this file is kept for the agency phase.
"(C)" marks code text read on codes.droit.org, which republishes Légifrance open data, because Légifrance blocks bots: https://codes.droit.org/PDF/Code%20de%20la%20consommation.pdf (same path for the CPCE, the Code du travail and the Code pénal).

## Summary

- An AI voice agent calling people is an automated calling system: prior consent for private individuals, disclosure that it is an AI, and dedicated "verified" numbers.
- A human calling Hiring Contacts about their job is allowed on legitimate interest, with information and a free opt-out.
- Whether consumer opt-in rules apply to a recruiter calling a Candidate is not settled by any regulator.
- Dialling numbers in parallel or predictively counts as automated for ARCEP, even when a human talks; one call per explicit human command does not.
- Only Lusha (and partly BetterContact) return a source per phone number.

## 1. French cold-calling rules

- Opt-in for consumers: Loi 2025-594, art. 13 rewrote L223-1 of the Code de la consommation; calling a "consommateur" without prior consent is banned from 11 August 2026 (art. 13 III).
  Journal officiel facsimile: https://www.associatheque.fr/fr/fichiers/actualite/loi-2025-594-NOR-ECOX2432287L.pdf
- Bloctel ends with it: https://web.archive.org/web/20260814011321/https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/les-regles-du-demarchage-telephonique-simposant-aux-entreprises
- Consent rules (décret 2026-662, R223-1 to R223-4) (C): the request names the caller and the goods or services; consent lasts at most one year, never renews tacitly and can be withdrawn orally; proof is kept three years.
  Exceptions: an ongoing contract, the press, and a callback within five working days of the person's own request.
- Hours and frequency (D223-9, rewritten by décret 2026-662) (C): Monday to Friday except public holidays, 10:00-13:00 and 14:00-20:00 in the consumer's time zone, at most 4 attempts per 30 days.
- If the person objects during the call, hang up and never call again (L221-16) (C).
- At the start of a consumer call, state who you are, who you call for and that the call is commercial (L221-16); never use a masked number, and show a number assigned to the company the call is made for (L221-17) (C).

### Hiring Contacts (B2B)

- A "consommateur" is a natural person acting outside their trade (article liminaire) (C).
- CNIL: professionals may be called on legitimate interest when the call relates to their job, with information and a free opt-out: https://www.cnil.fr/fr/prospection-commerciale-par-telephone-hors-automate-dappel-quelles-sont-les-regles

### Candidates (uncertain)

- No CNIL or DGCCRF position was found.
- The DGCCRF defines démarchage as calling a consumer to conclude a contract for goods or services, and L5321-3 of the Code du travail forbids charging job seekers for placement (C), so a recruiter's call is probably not consumer prospecting.
- CNIL: non-commercial calls fall outside the 2025 law and can rely on legitimate interest with information and an opt-out (CNIL page above).

## 2. ARCEP numbering

- Decision 2022-1583, in force 1 January 2023: automated calling systems may not show 01-05, 09 or 06/07 numbers and must use verified numbers (0162, 0163, 0270, 0271, 0377, 0378, 0424, 0425, 0568, 0569, 0948, 0949): https://www.arcep.fr/uploads/tx_gsavis/22-1583.pdf
- The rule targets automation, not only prospecting (Conseil d'État, 2024): https://www.arcep.fr/actualites/actualites-et-communiques/detail/n/numerotation-plan-numerotation-130624.html
- Section 7.1.3 of the same decision: machine-assisted dialling "peut ne pas être considérée" automated when calls go out one at a time, "sans parallélisation possible et sur la commande explicite d'un humain pour chaque appel".
  Parallel or predictive dialling therefore counts as automated; a sequential dialler that moves to the next number on its own is uncertain.
- Caller ID authentication: CPCE L44 IV requires operators to authenticate caller IDs (C); decision 2025-2215 (from 1 January 2026) cuts unauthenticated French landline IDs arriving from abroad and limits each customer to the caller IDs it declared: https://www.arcep.fr/uploads/tx_gsavis/25-2215.pdf

## 3. Automated calls and AI voice agents

- CPCE L34-5 (C): direct prospecting through a "système automatisé de communications électroniques" using a natural person's details needs prior consent; an opt-out contact is mandatory and hiding the caller's identity is banned.
- ePrivacy Directive art. 13(1) covers "automated calling and communication systems without human intervention"; art. 13(5) limits it to natural persons: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02002L0058-20091219
- CNIL: individuals must consent first; professionals get information and an opt-out when the call relates to their job (doctrine, the statute says "personne physique"): https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique-sms-mms-et-automate-dappel
- No CNIL text on AI voice agents was found; an autonomous agent matches the "without human intervention" wording and ARCEP's automated-system rule.
- EU AI Act art. 50(1) and 50(5): people must be told they are talking to an AI, at the latest at the first interaction, from 2 August 2026 (art. 113): https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
  The Digital Omnibus (Regulation 2026/1744) only delays the separate art. 50(2) marking duty to 2 December 2026: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1744

## 4. Recording and transcribing calls

- Code pénal 226-1 (C): recording private words without consent is punishable by one year in prison and a 45 000 € fine; consent is presumed when recording is done openly and the person could object.
- CNIL (page marked obsolete by the CNIL itself): at the start of the call, state the purpose, who receives the recording, and the rights to object and access; keep recordings at most 6 months and written analyses at most 1 year; do not record every call systematically: https://www.cnil.fr/fr/lecoute-et-lenregistrement-des-appels-sur-le-lieu-de-travail
- CNIL guidance on transcription and analysis tools is announced for 2026 but not published: https://www.cnil.fr/fr/accompagnement-des-professionnels-le-programme-de-travail-de-la-cnil-pour-2026
- Candidates must be told beforehand about recruitment methods and data-collection devices (Code du travail L1221-8, L1221-9) (C).

## 5. Mobile numbers

| Provider | Source per number | Approx. cost per mobile |
|---|---|---|
| Lusha | `dataSource` field | $0.62 |
| BetterContact | `contact_phone_number_provider`, "Secret Provider" for vendors under NDA | $0.75 |
| FullEnrich | none found | 0.55 €, charged only when found |
| Cognism | none found; acts as controller, notifies people and screens French do-not-call lists | quoted by sales |
| Kaspr | none found | 45-79 € per user per month for 100-200 phone credits |
| Exa Agent | not documented (see `exa.md`) | $0.07 per phone found |

- Sources: https://docs.lusha.com/enrichment/enrich-contacts, https://doc.bettercontact.rocks/api-reference/endpoint/get, https://fullenrich.com/pricing, https://www.cognism.com/compliance
- Dropcontact returns company phones only.
- No independent benchmark of French mobile find rates exists; FullEnrich's "around 80%" is a vendor claim across all data types.
- CNIL fined Kaspr 240 000 € (SAN-2024-020) for collecting contacts LinkedIn users had restricted, a self-renewing 5-year retention, late English-only notices, and access answers without the source; the order was closed on 4 March 2026 after Kaspr deleted its database: https://cnil.fr/fr/aspiration-de-donnees-sanction-de-240-000-euros-lencontre-de-la-societe-kaspr, https://cnil.fr/en/closure-order-issued-against-kaspr

## 6. Telephony APIs

- Twilio: browser calls (Voice JS SDK) and a REST API, no built-in dialler, 1 call per second by default; the Ireland region "does not guarantee" data stays there; the only vendor found selling French verified numbers (needs a Kbis, a SIREN and a French address); about $0.04 per minute to French mobiles.
  https://www.twilio.com/docs/global-infrastructure/regional-product-and-feature-availability, https://www.twilio.com/en-us/guidelines/fr/regulatory
- Aircall: the API starts calls in the user's own app; an Outbound Campaigns API exists (at most 5 simultaneous AI-agent calls); recordings in Frankfurt, call metadata mostly in the US: https://aircall.io/regional-data-hosting/
- Ringover: French company with `/callback`, `/campaigns/call` and `/transcriptions` APIs: https://developer.ringover.com/web/openapi_public.yml
- Vonage: French 09 numbers only; each call needs "a separate human action": https://api.support.vonage.com/hc/en-us/articles/115011761808
- Telnyx: browser calls through WebRTC; data storage can be set to Germany (US by default); French numbers need a French address, no verified ranges found: https://developers.telnyx.com/docs/account-setup/data-locality

## Not verified

The vendor facts in sections 5 and 6 were not re-checked against a second source, apart from ARCEP section 7.1.3.
