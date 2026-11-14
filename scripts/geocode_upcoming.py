"""Find the map spot for each upcoming item (frontend/src/data/upcoming-items.json) and save it to
manual-locations.json, the file for pins we place ourselves (geocode_addresses.py never touches it).

    python3 scripts/geocode_upcoming.py

It reuses the lookup from geocode_addresses.py: Nominatim, only exact building-number matches inside Toronto.
Addresses that already have a pin are skipped, so running it twice is harmless.
"""
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from geocode_addresses import SECONDS_BETWEEN_REQUESTS, lookup, toronto_box  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"
UPCOMING = DATA / "upcoming-items.json"
PINS = DATA / "manual-locations.json"


def main():
    items = json.loads(UPCOMING.read_text())["items"]
    pins = json.loads(PINS.read_text())
    box = toronto_box()
    for item in items:
        if item["id"] in pins:
            print(f"{item['id']}: already has a pin")
            continue
        address = item["address"].replace(", Toronto", "")  # "66 Gerrard Street East"
        found = lookup(address, box)
        time.sleep(SECONDS_BETWEEN_REQUESTS)
        if not found:
            print(f"{item['id']}: NOT FOUND ({address}), no pin")
            continue
        pins[item["id"]] = {"lat": found["lat"], "lng": found["lng"], "address": address}
        print(f"{item['id']}: {address} -> {found['lat']}, {found['lng']}")
    PINS.write_text(json.dumps(pins, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
