# France / EU compliance for recruiter prospecting and sourcing

Checked: 2026-10-09 (findings may drift; re-verify before relying on prices or plan gates).

This is product design input, not legal advice.

## Bottom line

B2B prospecting by email and candidate sourcing on legitimate interest are both workable in France, with clear required mentions and opt-out handling.
Whether cold emails to candidates count as "prospection commerciale" is unsettled, so the product should be designed for the stricter reading.
A recruiter who saves a sourced profile must send the Article 14 notice within one month and at the latest at first contact.
Personal email and mobile enrichment is the highest-risk area, as shown by the KASPR fine.
Annex III recruitment obligations under the AI Act now apply from 2 Dec 2027, after the Digital Omnibus.
The CNIL's 2026 priority inspections target recruitment firms.

## 1. B2B prospecting email

This is settled, but as CNIL doctrine rather than statute.

- Professionals can be emailed on legitimate interest, with opt-out instead of opt-in, if the message is "en rapport avec la profession de la personne démarchée".
- They must be informed when their address is collected, and must be able to object.
- With bought or third-party data, you must make sure the person was told their address could be used for prospecting.
- Generic addresses (contact@, info@) fall outside these rules.
- Every message must include the sender's identity, a simple and free way to refuse future messages, valid contact details for that refusal, and a subject line related to the service offered.
- The B2B opt-out regime is CNIL interpretation; the text of L34-5 itself only sets out consent for natural persons, plus the existing-customer exception.

## 2. Candidate sourcing (CNIL Guide recrutement 2023)

- Lawful basis: legitimate interest, after a balancing test, and candidates must be told what the interest is.
- Consent cannot be the basis for the recruitment process itself.
- For a talent pool ("vivier") or CV database, the CNIL recommends consent.
- Legitimate interest is acceptable for a talent pool if candidates are expressly informed and can object easily.
- Allowed sources: only professional networks and sites, and only data directly linked to the job (Code du travail L1221-6).
- Platform terms of use count when lawfulness is assessed.

### Article 14 notice

- Profiles that were only viewed qualify for the Art. 14(5)(b) exemption, but a public notice is still needed, for example on the recruiter's own LinkedIn profile.
- A headhunter who saves profiles into a pool gets no exemption and must inform everyone saved within a reasonable time, at most one month from the consultation.
- GDPR Art. 14(3)(b) also requires the notice at the latest at the first communication.
- Grey area: Code du travail L1221-9 says candidates must be informed beforehand ("préalablement"), and it is unclear how this applies to passive candidates who never applied.

### Personal email and mobile enrichment

- The CNIL does not address it directly.
- The closest guide is the KASPR fine (€240k, Dec 2024).
- Scraping contact details that LinkedIn users had restricted was unlawful, because it went beyond their reasonable expectations.
- A 5-year retention that renewed itself was excessive.
- A notice only in English was not adequate.
- Answers to access requests must give the exact source.
- Design assumption: treat personal channels as high-risk, and only collect them from sources where the person made them public for professional contact.

### Separate datasets

- The CNIL says reusing a recruitment file for commercial prospecting is incompatible with its original purpose.
- Candidate data and B2B prospect data must therefore be kept separate.

## 3. Cold email to candidates' personal addresses

This is a grey area.

- L34-5 defines direct prospecting as any message promoting, directly or indirectly, goods, services, or the image of a seller or service provider.
- Argument that it is out of scope: a one-off email about a job does not sell anything to the candidate.
- Likely in scope: newsletters, "talent community" emails and content promoting the agency.
- No CNIL position was found.
- The UK regulator (ICO), under a similar regime, treats direct messages to sourced candidates as direct marketing.
- SMS falls under L34-5 as well.
- Since 11 Aug 2026, phone canvassing of consumers requires opt-in (loi 2025-594).
- Recruiting calls are probably out of scope of that rule.
- Recommendation: rely on legitimate interest, put the Art. 14 notice and an opt-out in every message, and ask for consent before any recurring job alerts.

## 4. Retention and rights

These are settled CNIL benchmarks.

- Unsuccessful candidates: up to 3 months after the decision.
- Talent pool: at most 2 years from the last contact, renewable with fresh consent.
- Proof against discrimination claims: up to 5 years.
- Profiles sourced but never answered: no CNIL figure exists, and KASPR implies short, non-renewing periods.
- Prospects: 3 years from collection or from the last contact initiated by the prospect.
- Opening an email does not count as contact.
- Objections to prospecting must always be honoured.
- Keep the data needed to honour objections for at least 3 years, used only for that purpose.
- Rights requests must be answered within one month.

## 5. AI and automated scoring

- GDPR Art. 22: consent is rarely valid in recruitment, and France has no law authorising automated decisions.
- A decision made solely by a machine is only possible if "necessary" to conclude the contract, which requires an exceptionally high volume of applications.
- Candidates dropped by a ranking before any human looks at them have the Art. 22 right to human review.
- The CNIL expects a DPIA, information about the logic used, and avoidance of proxies for discriminatory or sensitive data (guide pp. 70-72).
- AI Act: recruitment and selection systems (Annex III 4(a)) are high-risk.
- Annex III systems that profile people are always high-risk (Art. 6(3)).
- The Digital Omnibus (Reg. 2026/1744, Official Journal 24 Jul 2026) moved Annex III obligations from 2 Aug 2026 to 2 Dec 2027.
- From that date, the product as provider owes Art. 16 duties: risk management, data governance, logging, human oversight, conformity assessment, registration.
- Agency customers, as deployers, owe Art. 26 duties.
- Already in force: Art. 5 prohibitions since Feb 2025, including emotion recognition at work.
- Already in force: a softened Art. 4 AI-literacy duty.
- Already in force: Art. 50 transparency since 2 Aug 2026.
- It is a grey area whether an autonomous agent emailing candidates triggers Art. 50(1), so disclose that AI is used.
- The CNIL's 2026 priority inspections target recruitment firms on automated decisions, candidate information and retention.

## 6. Product compliance checklist

1. Source logging on every record: source URL, date, method, legal basis, visibility status. Never collect restricted fields.
2. Source allowlist: professional networks and professional sites only.
3. Separate stores for candidates and B2B prospects.
4. Enrichment gate: personal email and mobile only with a documented lawful source. Vendors must prove where their data comes from.
5. Art. 14 notice: sent in French within one month of saving a profile, and in or linked from the first message. It covers identity, purpose, legitimate interest, source, retention, rights, the right to complain to the CNIL, and any automated processing.
6. Every message: sender identity, valid contact details, one-click opt-out, honest subject line.
7. Global suppression list: hashed, checked before every send across all customer accounts, kept at least 3 years.
8. Rights workflow: requests answered within one month, giving the exact data source.
9. Automatic retention purge: only real inbound actions reset the "last contact" date, and retention never renews automatically. Ask for consent on the first reply before adding someone to the talent pool.
10. Human in the loop: human review for any rejection or ranking cut-off, plus explanations, a DPIA, bias testing, and AI Act-ready logs.
11. AI disclosure in messages the agent writes.

## Unverified

- The L34-5 wording comes from a law-firm reproduction, because Légifrance blocked access.
- The AI Act dates come from the Council timeline (via search) and the content from a law-firm summary, because EUR-Lex was blocked.
- That French law bars charging job seekers fees (used in the argument that candidate emails are not prospecting).
- That recruiting calls are outside the 2026 consumer phone-canvassing opt-in rule.
- No CNIL position was found on cold emails to candidates' personal addresses.

## Sources

- https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique
- https://www.baumann-avocats.com/CPCE/article-l34-5-du-code-des-postes-et-des-communications-electroniques.php
- https://www.cnil.fr/sites/cnil/files/atoms/files/guide_-_recrutement.pdf (pp. 25-26, 46, 70-72, 76-78)
- https://cnil.fr/fr/aspiration-de-donnees-sanction-de-240-000-euros-lencontre-de-la-societe-kaspr
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/recruitment-and-selection/finding-candidates/
- https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/les-regles-du-demarchage-telephonique-simposant-aux-entreprises
- https://www.cnil.fr/fr/questions-reponses-sur-les-referentiels-relatifs-la-gestion-des-activites-commerciales-et-des
- https://www.cuatrecasas.com/en/spain/labor-and-employment/art/digital-omnibus-on-ai-how-does-it-impact-employment-relations
- https://www.cnil.fr/fr/controles-prioritaires-2026
