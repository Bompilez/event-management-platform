# Event Management Platform

[English version](README.en.md)

Et enkelt event‑system med headless backend, innsending‑skjema og eget adminpanel.

Løsningen er laget fordi tradisjonelle CMS‑verktøy (f.eks. Squarespace) ofte gir for lite kontroll på strukturert event‑data og logikk.

Dette fungerer som et eksternt event‑CMS som kan brukes av hvilket som helst frontend.

---

## Bruksområde

Når nettsiden mangler fleksibel datamodell, filtrering og tilpasset logikk for arrangementer, tilbyr dette prosjektet:

- Full kontroll over arrangement‑data
- API for frontend‑visning
- Adminpanel uavhengig av CMS
- Trygg visning av dynamisk innhold

Frontend kan hente data via API og vise det dynamisk (f.eks. i Squarespace‑kodeblokker).

---

## Stack

- Firebase Cloud Functions (Node.js)
- Firestore
- Firebase Storage
- Firebase Hosting
- Vanilla JavaScript
- HTML / CSS

---

## Funksjonalitet

### Innsending (skjema)

- Innsending av arrangement via eget skjema
- Validering av felt, bilde og logo
- Bildeopplasting (4:3‑beskjæring) og logo (PNG)
- reCAPTCHA v3
- Takk/kvittering etter innsending

### Arrangement

- Tittel, slug, oppsummering og innhold (brødtekst)
- Program (tidspunkter)
- Dato og klokkeslett
- Sted, rom og etasje
- Arrangørnavn og lenke
- Bilde + logo
- Pris og kapasitet
- Påmeldingsfrist og CTA‑lenke
- Kalender‑eksport (ICS)
- Deling
- Status: Utkast / Publisert / Ferdig
- Automatisk arkivering dagen etter endt dato

### API

- Hent publiserte arrangementer
- Hent enkeltarrangement via slug
- CORS‑beskyttet
- Cache‑headers for raskere lasting

### Admin

- Innlogging (Firebase Auth)
- Oversikt med søk og filter
- Opprett, rediger, slett
- Program‑editor
- Bilde/logo‑bytte med opprydding i Storage
- Delingsknapper i admin
- E‑postmottakere kan administreres i admin

### Varslinger

- E‑postvarsling ved nye innsendinger via Firebase Extensions (Trigger Email)
- HTML‑epost med tydelig sammendrag og admin‑knapp

---

## Status

Systemet er i aktiv bruk og dekker hovedbehovene.  
Videre forbedringer skjer løpende.
