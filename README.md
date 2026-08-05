# Z3 Scout

An iPhone-friendly, installable web app that ranks BMW Z3 roadster adverts by:

- **Deal score (55%)** — asking price against an engine/year/mileage-adjusted guide.
- **Advertised condition (45%)** — service history, MOT, roof, corrosion, damage and fault evidence found in the advert text.
- **Evidence confidence** — how many facts the seller actually supplied. Sparse adverts are visibly marked as uncertain.

The site has no build step and no hosting bill. GitHub Pages serves it, while a scheduled GitHub Action can refresh its listing data each morning.

## Start here

Read [SETUP.md](SETUP.md). It walks through uploading the extracted folder, turning on GitHub Pages, adding the optional search key, and saving the app to an iPhone home screen.

Until live discovery is configured, the dashboard intentionally says **Demonstration data**. The bundled examples are fictional and are there to show the scoring interface; they are not adverts.

## What is included

- Responsive dashboard designed for Safari on iPhone
- PWA manifest, offline cache and home-screen icons
- Deal, condition and confidence scores with plain-English reasons
- Price, engine, confidence and sort filters
- Device-local saved list
- “Add advert” form for scoring any find from any marketplace on the phone
- Daily discovery from Google-indexed previews across configured marketplaces
- Manual JSON input for adverts that cannot be discovered automatically
- Automated tests for the scoring rules
- No JavaScript packages, server, database or paid hosting requirement

## Important marketplace limitation

This project **does not scrape marketplace pages**. Auto Trader restricts copying/extracting its site content, while Meta says automated collection requires express written permission. Facebook Marketplace is also largely behind login and is inconsistently indexed. The included collector therefore uses only third-party search-index previews and original links, and lets you add adverts manually.

That makes the app safe and simple to host, but not exhaustive. Auto Trader and Facebook results may be incomplete. Do not add a logged-in browser cookie, password or marketplace token to this repository.

- [Auto Trader terms of use](https://www.autotrader.co.uk/terms-and-conditions/terms-of-use)
- [Meta automated data collection terms](https://www.facebook.com/legal/automated_data_collection_terms)

## Scoring model

The model is deliberately inspectable in `scripts/fetch_listings.py` and mirrored in `app.js` for adverts added on the phone.

1. A starting price guide is selected for the engine (1.8–3.2/M).
2. The guide is adjusted modestly for year and mileage.
3. Asking price vs. that guide produces the deal score.
4. Advert text begins at a cautious condition score of 3.4/10. Evidence such as full history or a replacement roof adds points; no history, category status, damage, rust, leaks and warning lights subtract points.
5. Overall score is `deal × 0.55 + condition × 0.45`.

The guide values are broad starting assumptions, not live valuations. Adjust `BASELINES` in both scorer files after comparing sold prices in your target region. The score cannot see hidden corrosion, verify a seller’s claims, or replace an HPI check and physical inspection.

## File map

```text
index.html                         App shell
styles.css                        Responsive visual design
app.js                            UI, filters, local adverts and phone-side scoring
data/listings.json                Published data read by the app
data/manual-listings.json         Optional hand-entered public listings
scripts/fetch_listings.py         Daily discovery, extraction and scoring
sources.json                      Marketplace search queries
.github/workflows/refresh-listings.yml
                                   Daily scheduled refresh
tests/test_scoring.py             Scoring regression tests
```

## Local preview and tests

Python 3 is the only local requirement:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. To rebuild the demonstration data and run tests:

```bash
python scripts/fetch_listings.py --demo
python -m unittest discover -s tests -v
```

## Privacy and security

- Saved cars and phone-added adverts stay in that browser’s local storage.
- The public listing JSON contains advert text and links, but no login details.
- `SERPER_API_KEY` belongs in GitHub Actions secrets, never in a file.
- External links open the original advert; Z3 Scout does not proxy or reproduce listing photos.

## Licence

MIT. BMW, Auto Trader, Facebook and other marketplace names belong to their respective owners. This project is independent and unaffiliated.
