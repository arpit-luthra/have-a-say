"""
Download Toronto's 25 ward boundaries and save a small, clean copy for the map.

Why this script exists:
- The official file from Toronto Open Data is ~1.1 MB with ~20 columns we don't use.
- The map only needs each ward's number, name and shape.
- Keeping this as a script (instead of hand-editing the file) means anyone can
  re-run it and get the exact same result from the official source.

Run from the repo root:   python3 scripts/prepare_wards.py
Or with an already-downloaded file:   python3 scripts/prepare_wards.py path/to/city-wards-data-4326.geojson
Source: City of Toronto Open Data, "City Wards" dataset (Open Government Licence – Toronto)
https://open.toronto.ca/dataset/city-wards/
"""

import json
import sys
import urllib.request
from pathlib import Path

# "4326" = plain latitude/longitude coordinates, which is what web maps use.
SOURCE_URL = (
    "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/"
    "5e7a8234-f805-43ac-820f-03d7c360b588/resource/"
    "737b29e0-8329-4260-b6af-21555ab24f28/download/city-wards-data-4326.geojson"
)

# The React app serves everything in frontend/public/ as-is, so the browser can fetch it.
OUTPUT_PATH = Path(__file__).parent.parent / "frontend" / "public" / "data" / "toronto-wards.geojson"

# 5 decimal places of latitude/longitude is about 1 metre: plenty for ward outlines.
DECIMALS = 5


def round_coordinates(coords):
    """Round every number in a (deeply nested) list of coordinates.

    Polygons are lists of rings, rings are lists of points, points are [lng, lat],
    so we call ourselves on each inner list until we reach plain numbers.
    """
    if isinstance(coords, (int, float)):
        return round(coords, DECIMALS)
    return [round_coordinates(c) for c in coords]


def clean_feature(feature):
    """Keep only what the map needs: ward number, name and shape."""
    props = feature["properties"]
    ward_number = int(props["AREA_SHORT_CODE"])  # "07" -> 7
    return {
        "type": "Feature",
        # A numeric id lets MapLibre remember "this ward is hovered" (feature state).
        "id": ward_number,
        "properties": {
            "ward_number": ward_number,
            "ward_name": props["AREA_NAME"],
        },
        "geometry": {
            "type": feature["geometry"]["type"],
            "coordinates": round_coordinates(feature["geometry"]["coordinates"]),
        },
    }


def load_raw_wards():
    """Read the official file: from a local path if one was given, else download it.

    The local-path option exists because some Python installs on macOS can't
    verify HTTPS certificates until "Install Certificates.command" is run.
    """
    if len(sys.argv) > 1:
        print(f"Reading local file {sys.argv[1]}")
        with open(sys.argv[1]) as f:
            return json.load(f)
    print(f"Downloading {SOURCE_URL}")
    with urllib.request.urlopen(SOURCE_URL) as response:
        return json.load(response)


def main():
    raw = load_raw_wards()

    features = [clean_feature(f) for f in raw["features"]]
    features.sort(key=lambda f: f["id"])

    # Safety check: if the city ever changes the file, fail loudly instead of
    # silently showing the wrong wards.
    if len(features) != 25:
        raise SystemExit(f"Expected 25 wards, got {len(features)}. Check the source file.")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        # separators=(",", ":") removes spaces to keep the file small.
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Saved {len(features)} wards to {OUTPUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
