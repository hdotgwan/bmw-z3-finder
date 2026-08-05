#!/usr/bin/env python3
"""Discover BMW Z3 adverts from search-index previews and score them.

Uses only Python's standard library. It never fetches or scrapes a marketplace
page. The optional Serper API provides already-indexed result titles, snippets
and links; manual listings are merged from data/manual-listings.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASELINES = {"1.8": 3800, "1.9": 4400, "2.0": 5200, "2.2": 6200, "2.8": 7600, "3.0": 9000, "3.2": 19000, "unknown": 5800}


def clamp(value: float, low: float = 1.0, high: float = 10.0) -> float:
    return min(high, max(low, value))


def first_match(patterns: list[str], text: str, cast: Any = str) -> Any | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            try:
                return cast(match.group(1).replace(",", ""))
            except (ValueError, TypeError):
                pass
    return None


def extract_fields(result: dict[str, Any], source: str) -> dict[str, Any] | None:
    title = str(result.get("title", "")).strip()
    snippet = str(result.get("snippet", "")).strip()
    combined = f"{title} {snippet}"
    if not re.search(r"\bbmw\s+z3\b|\bz3\s+roadster\b", combined, re.I):
        return None
    if re.search(r"\bz4\b|\bcoup[eé]\b|breaking|parts only|car cover|model car", combined, re.I):
        return None
    price = first_match([r"£\s*([0-9]{1,3}(?:,[0-9]{3})+)", r"GBP\s*([0-9]{1,3}(?:,[0-9]{3})+)"], combined, int)
    mileage = first_match([r"([0-9]{1,3}(?:,[0-9]{3})+)\s*(?:miles|mile)", r"\b([0-9]{2,3})k\s*(?:miles|mile)"], combined, int)
    if mileage and mileage < 1000 and re.search(rf"\b{mileage}k\b", combined, re.I):
        mileage *= 1000
    year = first_match([r"\b(199[5-9]|200[0-2])\b"], combined, int)
    engine = first_match([r"\b(1\.8|1\.9|2\.0|2\.2|2\.8|3\.0|3\.2)\s*(?:i|l|litre|liter)?\b"], combined) or "unknown"
    if re.search(r"\bM\s*Roadster\b|\bZ3M\b", combined, re.I):
        engine = "3.2"
    url = str(result.get("link", "")).strip()
    if not url.startswith(("http://", "https://")):
        return None
    identity = hashlib.sha1(url.split("?")[0].encode("utf-8")).hexdigest()[:12]
    return {
        "id": f"web-{identity}", "title": title, "description": snippet,
        "url": url, "source": source, "price": price or 0,
        "mileage": mileage or 0, "year": year or 0, "engine": engine,
        "location": "", "foundAt": datetime.now(timezone.utc).isoformat(),
        "isDemo": False,
    }


def score_listing(raw: dict[str, Any]) -> dict[str, Any]:
    listing = dict(raw)
    engine = str(listing.get("engine") or "unknown")
    price = int(listing.get("price") or 0)
    mileage = int(listing.get("mileage") or 0)
    year = int(listing.get("year") or 0)
    text = f"{listing.get('title', '')} {listing.get('description', '')}".lower()
    base = BASELINES.get(engine, BASELINES["unknown"])
    year_factor = 1 + ((year - 1999) * .025) if year else 1
    mileage_factor = clamp(1 + ((70000 - mileage) / 10000) * .025, .78, 1.25) if mileage else 1
    expected = round((base * year_factor * mileage_factor) / 50) * 50
    ratio = price / expected if price and expected else 1.15
    deal = round(clamp(7.2 - ((ratio - 1) * 10)), 1)
    condition = 3.4
    reasons: list[dict[str, str]] = []
    positive = [
        (r"full service history|full history|\bfsh\b", 2.0, "Full service history claimed"),
        (r"service history|service record|service book", 1.0, "Some service history mentioned"),
        (r"recently serviced|recent service|just serviced", .6, "Recent service claimed"),
        (r"new (soft )?top|new (hood|roof)|roof replaced", .7, "Replacement roof mentioned"),
        (r"garage(d| kept)", .4, "Garaged storage claimed"),
        (r"(10|11|12) months? mot|mot (until|to) (20\d\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", .5, "Useful MOT remaining"),
        (r"rust[ -]?free|no rust|corrosion[ -]?free", .5, "Advert explicitly addresses corrosion"),
        (r"excellent condition|immaculate|cherished", .35, "Positive condition claim"),
    ]
    negative = [
        (r"no service history|history (lost|missing)|no history", -2.4, "Little or no service history"),
        (r"cat(egory)?\s*[nsdc]|write[ -]?off|insurance loss", -3.2, "Insurance category / write-off wording"),
        (r"rust|corrosion|welding", -2.0, "Rust, corrosion or welding mentioned"),
        (r"damage|damaged|accident", -2.6, "Damage or accident mentioned"),
        (r"project|spares or repair|non[ -]?runner|won't start|does not start", -3.3, "Project or non-runner wording"),
        (r"roof leak|leaking roof|hood leak|torn roof", -1.7, "Roof problem mentioned"),
        (r"warning light|engine light|abs light|airbag light", -1.3, "Warning light mentioned"),
    ]
    matched: set[str] = set()
    no_service_evidence = bool(re.search(r"no service history|history (lost|missing)|no history", text, re.I))
    for pattern, value, label in positive + negative:
        if label in {"Full service history claimed", "Some service history mentioned"} and no_service_evidence:
            continue
        if label == "Some service history mentioned" and "Full service history claimed" in matched:
            continue
        if re.search(pattern, text, re.I) and label not in matched:
            condition += value
            matched.add(label)
            reasons.append({"text": label, "type": "positive" if value > 0 else "negative"})
    if not re.search(r"service|history|invoice|record", text, re.I):
        reasons.append({"text": "Service evidence is not stated", "type": "neutral"})
    if not re.search(r"rust|corrosion|sill|jacking point", text, re.I):
        reasons.append({"text": "Corrosion condition is not stated", "type": "neutral"})
    if mileage > 120000:
        condition -= .5
        reasons.append({"text": "Higher mileage warrants closer inspection", "type": "neutral"})
    condition = round(clamp(condition), 1)
    overall = round(clamp((deal * .55) + (condition * .45)), 1)
    confidence = min(100, 15 + (20 if price else 0) + (20 if mileage else 0) + (15 if year else 0) + (15 if engine != "unknown" else 0) + (15 if any(r["type"] != "neutral" for r in reasons) else 0))
    difference = round(((expected - price) / expected) * 100) if price else 0
    if price:
        reasons.insert(0, {"text": f"{abs(difference)}% {'below' if difference >= 0 else 'above'} the modelled benchmark", "type": "positive" if difference >= 0 else "negative"})
    listing.update({"engine": engine, "price": price, "mileage": mileage, "year": year, "expectedPrice": expected, "priceDifference": difference, "dealScore": deal, "conditionScore": condition, "overallScore": overall, "confidence": confidence, "reasons": reasons})
    return listing


def serper_search(api_key: str, query: str, count: int) -> list[dict[str, Any]]:
    body = json.dumps({"q": query, "gl": "gb", "hl": "en", "num": count}).encode("utf-8")
    request = Request("https://google.serper.dev/search", data=body, method="POST", headers={"X-API-KEY": api_key, "Content-Type": "application/json", "User-Agent": "Z3-Scout/1.0"})
    with urlopen(request, timeout=25) as response:
        payload = json.load(response)
    return payload.get("organic", [])


def load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def build(use_demo: bool = False) -> dict[str, Any]:
    config = load_json(ROOT / "sources.json", {})
    manual = load_json(ROOT / "data" / "manual-listings.json", [])
    api_key = os.getenv("SERPER_API_KEY", "").strip()
    warnings: list[str] = []
    listings: list[dict[str, Any]] = []
    mode = "live"
    if use_demo or not api_key:
        mode = "demo"
        listings = load_json(ROOT / "data" / "demo.raw.json", [])
        if not use_demo:
            warnings.append("SERPER_API_KEY is not configured; showing demonstration data.")
    else:
        for source in config.get("sources", []):
            if not source.get("enabled", True):
                continue
            try:
                results = serper_search(api_key, source["query"], int(config.get("resultsPerSource", 10)))
                parsed = [extract_fields(result, source["name"]) for result in results]
                source_listings = [item for item in parsed if item]
                listings.extend(source_listings)
                if not source_listings:
                    warnings.append(f"No usable {source['name']} previews were returned today.")
            except (HTTPError, URLError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
                warnings.append(f"{source.get('name', 'A source')} could not be checked: {type(exc).__name__}.")
    listings.extend(manual)
    unique: dict[str, dict[str, Any]] = {}
    for item in listings:
        if item.get("id"):
            unique[str(item["id"])] = score_listing(item)
    scored = sorted(unique.values(), key=lambda item: item["overallScore"], reverse=True)
    return {"generatedAt": datetime.now(timezone.utc).isoformat(), "mode": mode, "warnings": warnings, "method": "search-index-previews-and-manual-input", "listings": scored}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="Generate the bundled demonstration dataset")
    parser.add_argument("--output", default=str(ROOT / "data" / "listings.json"))
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = build(use_demo=args.demo)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(payload['listings'])} {payload['mode']} listings to {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
