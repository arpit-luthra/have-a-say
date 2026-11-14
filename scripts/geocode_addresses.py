"""Find map locations for decisions whose title starts with a Toronto street address.

    python3 scripts/geocode_addresses.py

How it works:
  1. Pull the street address out of each official title ("245 Eglinton Avenue East - ...").
  2. Look each distinct address up ONCE with Nominatim (OpenStreetMap's free geocoder),
     limited to Toronto, at most 1 request per second (their usage policy).
  3. Remember every answer (including "not found") in scripts/address-cache.json,
     so re-running never asks about the same address twice.
  4. Only accept an answer when it is confident: the result must be a real building with
     the SAME house number, on a road with the same name, inside Toronto.
     Anything else = no pin. We never guess.
  5. Write frontend/src/data/item-locations.json  ({ item id: lat, lng, address }).
"""
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS_FILE = ROOT / "frontend" / "src" / "data" / "open-data-items.json"
WARDS_FILE = ROOT / "frontend" / "public" / "data" / "toronto-wards.geojson"
CACHE_FILE = ROOT / "scripts" / "address-cache.json"
OUT_FILE = ROOT / "frontend" / "src" / "data" / "item-locations.json"

SEARCH_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim asks for a User-Agent that says who is calling (no email needed here).
USER_AGENT = "heads-up-civic-hack/1.0 (student hackathon project; github.com/arpit-luthra/heads-up)"
SECONDS_BETWEEN_REQUESTS = 1.1  # policy: max 1 per second

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

SUFFIXES = (
    "Avenue|Ave|Street|St|Road|Rd|Crescent|Cres|Boulevard|Blvd|Drive|Dr|Lane|Court|Ct|Way|Parkway|Pkwy|"
    "Place|Pl|Trail|Circle|Terrace|Gate|Square|Heights|Gardens|Grove|Path|Mews|Walk|Line|Row|Hill|Park|Manor|Lawn"
)
NUM = r"\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?"
# A title that STARTS with one or more house numbers, then a street name ending in a street word.
ADDRESS = re.compile(
    rf"^((?:{NUM}(?:\s*,\s*|\s+and\s+|\s+to\s+|\s*&\s*))*{NUM})\s+"
    rf"([A-Za-z'.]+(?:\s+[A-Za-z'.]+){{0,3}}?\s+(?:{SUFFIXES})\b(?:\s+(?:East|West|North|South|E|W|N|S)\b)?)",
    re.I,
)


def candidate_addresses(title):
    """Addresses to try for this title, best first. 'a-b' / 'a to b' ranges try the first
    number, then the last one (the first might not exist as a building)."""
    match = ADDRESS.match(title)
    if not match:
        return []
    numbers = re.findall(r"\d+[A-Za-z]?", match[1])
    street = " ".join(match[2].split())
    first_group_end = numbers[1] if re.match(rf"^{NUM}", match[1]) and re.match(r"^\d+[A-Za-z]?\s*(?:[-–]|\s+to\s+)\s*\d", match[1]) else None
    tries = [numbers[0]] + ([first_group_end] if first_group_end else [])
    return [f"{n} {street}" for n in dict.fromkeys(tries)]


def toronto_box():
    """South, west, north, east edges of the ward map, used to keep searches inside Toronto."""
    wards = json.loads(WARDS_FILE.read_text())
    points = []
    for f in wards["features"]:
        polys = [f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"]
        points += [p for poly in polys for p in poly[0]]
    lngs, lats = [p[0] for p in points], [p[1] for p in points]
    return min(lats), min(lngs), max(lats), max(lngs)


def lookup(address, box):
    """Ask Nominatim. Returns {lat, lng, display} for a confident match, else None."""
    south, west, north, east = box
    params = {
        "q": f"{address}, Toronto, Ontario",
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": 5,
        "countrycodes": "ca",
        "viewbox": f"{west},{north},{east},{south}",
        "bounded": 1,  # only results inside Toronto's box
    }
    request = urllib.request.Request(f"{SEARCH_URL}?{urllib.parse.urlencode(params)}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60, context=SSL_CONTEXT) as response:
        results = json.load(response)

    number, street = address.split(" ", 1)
    street_word = re.sub(r"[^a-z]", "", street.split()[0].lower())  # e.g. "eglinton"
    for r in results:
        a = r.get("address", {})
        road = re.sub(r"[^a-z]", "", a.get("road", "").lower())
        lat, lng = float(r["lat"]), float(r["lon"])
        if (
            a.get("house_number", "").lower() == number.lower()  # exact building number
            and street_word in road  # same street
            and south <= lat <= north and west <= lng <= east
        ):
            return {"lat": round(lat, 6), "lng": round(lng, 6), "display": r["display_name"]}
    return None


def main():
    items = json.loads(ITEMS_FILE.read_text())["items"]
    cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
    box = toronto_box()

    wanted = {i["id"]: candidate_addresses(i["title"]) for i in items}
    to_ask = sorted({a for tries in wanted.values() for a in tries if a not in cache})
    print(f"{sum(1 for t in wanted.values() if t)} titles have an address; {len(to_ask)} addresses still to look up.")

    for n, address in enumerate(to_ask, 1):
        try:
            cache[address] = lookup(address, box)
        except Exception as error:  # network hiccup: don't cache, try again next run
            print(f"  could not look up {address!r}: {type(error).__name__}")
        else:
            if n % 20 == 0:
                CACHE_FILE.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
                print(f"  {n}/{len(to_ask)} looked up")
        time.sleep(SECONDS_BETWEEN_REQUESTS)
    CACHE_FILE.write_text(json.dumps(cache, indent=1, ensure_ascii=False))

    # Each item gets the first of its addresses that was found confidently.
    locations = {}
    for item_id, tries in wanted.items():
        for address in tries:
            hit = cache.get(address)
            if hit:
                locations[item_id] = {"lat": hit["lat"], "lng": hit["lng"], "address": address}
                break
    OUT_FILE.write_text(json.dumps(locations, indent=1, ensure_ascii=False) + "\n")
    print(f"Done: {len(locations)} of {len(items)} decisions have a pin location.")


if __name__ == "__main__":
    main()
