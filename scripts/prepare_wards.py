"""
Prepare the map data from official City of Toronto Open Data.

Makes three small files in frontend/public/data/:
  toronto-wards.geojson        the 25 wards, each with a colour group and a few
                               neighbourhood names people recognise
  toronto-ward-labels.geojson  one point per ward, where its number badge sits
  toronto-mask.geojson         a big rectangle with a Toronto-shaped hole, used
                               to fade out everything outside the city

Why a script: anyone can re-run it and get exactly the same files from the
official sources, so nothing on the map is typed in by hand.

Run from the repo root:
  python3 scripts/prepare_wards.py
Or, if Python can't download (some macOS installs need "Install Certificates.command"),
download the two files below into a folder and pass that folder:
  python3 scripts/prepare_wards.py path/to/folder

Sources (Open Government Licence – Toronto):
  City Wards      https://open.toronto.ca/dataset/city-wards/
  Neighbourhoods  https://open.toronto.ca/dataset/neighbourhoods/
"""

import json
import math
import sys
import urllib.request
from pathlib import Path

# "4326" = plain latitude/longitude, which is what web maps use.
SOURCES = {
    "city-wards-data-4326.geojson": (
        "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/"
        "5e7a8234-f805-43ac-820f-03d7c360b588/resource/"
        "737b29e0-8329-4260-b6af-21555ab24f28/download/city-wards-data-4326.geojson"
    ),
    "neighbourhoods-4326.geojson": (
        "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/"
        "fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/"
        "0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson"
    ),
}

OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"

DECIMALS = 5  # 5 decimal places of latitude/longitude is about 1 metre
NUMBER_OF_COLOURS = 6  # colour groups; the actual colours are chosen in the frontend
NEIGHBOURHOODS_PER_WARD = 3


# ---------------------------------------------------------------- loading


def load_source(filename, local_folder):
    """Read one official file, from a local folder if given, else download it."""
    if local_folder:
        with open(Path(local_folder) / filename) as f:
            return json.load(f)
    print(f"Downloading {filename}")
    with urllib.request.urlopen(SOURCES[filename]) as response:
        return json.load(response)


def round_coordinates(coords):
    """Round every number in a nested list of coordinates."""
    if isinstance(coords, (int, float)):
        return round(coords, DECIMALS)
    return [round_coordinates(c) for c in coords]


def polygons_of(geometry):
    """Return a list of polygons (each a list of rings), for Polygon or MultiPolygon."""
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    return geometry["coordinates"]


# ---------------------------------------------------------------- geometry helpers


def ring_area(ring):
    """Area of a ring using the shoelace formula (in squared degrees: fine for comparing)."""
    total = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def point_in_ring(x, y, ring):
    """Ray casting: draw a line to the right of the point and count how many edges it
    crosses. An odd number of crossings means the point is inside."""
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def point_in_polygon(x, y, polygon):
    """Inside the outer ring and not inside any hole."""
    outer, *holes = polygon
    return point_in_ring(x, y, outer) and not any(point_in_ring(x, y, h) for h in holes)


def distance_to_edges(x, y, polygon):
    """Shortest distance from a point to the polygon's edges.
    Longitude degrees are narrower than latitude degrees in Toronto, so we
    shrink x by cos(latitude) to measure in roughly equal units."""
    shrink = math.cos(math.radians(y))
    best = float("inf")
    for ring in polygon:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            ax, ay, bx, by, px, py = x1 * shrink, y1, x2 * shrink, y2, x * shrink, y
            dx, dy = bx - ax, by - ay
            length_sq = dx * dx + dy * dy or 1e-18
            t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length_sq))
            best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def deepest_point(polygon, steps=40):
    """A point well inside the polygon, for placing a label.

    The plain centre of an odd shape can fall outside it, so instead we try
    a grid of points and keep the inside one that is furthest from any edge.
    """
    xs = [p[0] for p in polygon[0]]
    ys = [p[1] for p in polygon[0]]
    best_point, best_distance = None, -1
    for i in range(steps + 1):
        for j in range(steps + 1):
            x = min(xs) + (max(xs) - min(xs)) * i / steps
            y = min(ys) + (max(ys) - min(ys)) * j / steps
            if point_in_polygon(x, y, polygon):
                d = distance_to_edges(x, y, polygon)
                if d > best_distance:
                    best_point, best_distance = (x, y), d
    return best_point


def largest_polygon(geometry):
    """The biggest piece of a (Multi)Polygon, e.g. the mainland rather than an island."""
    return max(polygons_of(geometry), key=lambda poly: ring_area(poly[0]))


# ---------------------------------------------------------------- city outline


def segments_of_ring(ring):
    """Each edge of a ring as a pair of points (tuples, so they can go in sets).
    Skips zero-length edges: the source data sometimes repeats a point twice."""
    points = [tuple(p) for p in ring]
    return [(a, b) for a, b in zip(points, points[1:]) if a != b]


def undirected(segment):
    """The same edge, whichever direction it was drawn in."""
    return frozenset(segment)


def city_outline(wards):
    """Toronto's outer border, made from the wards themselves.

    Where two wards touch, they share the exact same edge. So if we count
    every edge, the shared (inner) edges appear twice and the city's outer
    edges appear once. Keep the once-only edges and join them into rings.
    """
    counts = {}
    for ward in wards:
        for polygon in polygons_of(ward["geometry"]):
            for ring in polygon:
                for segment in segments_of_ring(ring):
                    key = undirected(segment)
                    counts[key] = counts.get(key, 0) + 1

    outer_edges = [tuple(key) for key, count in counts.items() if count == 1]

    # Join the edges into closed rings: from each point, walk to a connected point.
    neighbours = {}
    for a, b in outer_edges:
        neighbours.setdefault(a, []).append(b)
        neighbours.setdefault(b, []).append(a)

    used = set()
    rings = []
    for a, b in outer_edges:
        if undirected((a, b)) in used:
            continue
        used.add(undirected((a, b)))
        ring = [a, b]
        while ring[-1] != ring[0]:
            next_point = next(
                (p for p in neighbours[ring[-1]] if undirected((ring[-1], p)) not in used), None
            )
            if next_point is None:
                break  # an edge that doesn't close; shouldn't happen with clean data
            used.add(undirected((ring[-1], next_point)))
            ring.append(next_point)
        if ring[-1] == ring[0] and len(ring) >= 4:
            rings.append([list(p) for p in ring])

    # In a few places two neighbouring wards' borders differ by a hair, which
    # leaves tiny slivers that aren't real city edges. Keep only real-sized rings.
    biggest = max(ring_area(r) for r in rings)
    return [r for r in rings if ring_area(r) > biggest * 0.001]


def mask_feature(outline_rings):
    """A rectangle around the whole region, with Toronto cut out as holes.
    Shading this rectangle fades everything that is NOT Toronto."""
    big_box = [[-81.5, 42.5], [-77.0, 42.5], [-77.0, 45.0], [-81.5, 45.0], [-81.5, 42.5]]
    return {
        "type": "Feature",
        "properties": {},
        "geometry": {"type": "Polygon", "coordinates": [big_box, *outline_rings]},
    }


# ---------------------------------------------------------------- ward colours


def find_neighbouring_wards(wards):
    """Two wards are neighbours if they share at least one border edge."""
    edge_owners = {}
    for ward in wards:
        for polygon in polygons_of(ward["geometry"]):
            for ring in polygon:
                for segment in segments_of_ring(ring):
                    edge_owners.setdefault(undirected(segment), set()).add(ward["id"])

    neighbours = {ward["id"]: set() for ward in wards}
    for owners in edge_owners.values():
        for a in owners:
            neighbours[a] |= owners - {a}
    return neighbours


def assign_colour_groups(wards, neighbours):
    """Give each ward a colour group so that neighbouring wards always differ.

    "Greedy colouring": go through the wards (busiest first) and give each the
    first colour none of its already-coloured neighbours uses. Then spread the
    choice by also preferring the least-used colour, so the map looks balanced.
    """
    colour_of = {}
    usage = [0] * NUMBER_OF_COLOURS
    for ward_id in sorted(neighbours, key=lambda w: (-len(neighbours[w]), w)):
        taken = {colour_of[n] for n in neighbours[ward_id] if n in colour_of}
        free = [c for c in range(NUMBER_OF_COLOURS) if c not in taken]
        if not free:
            raise SystemExit(f"Not enough colours for ward {ward_id}")
        choice = min(free, key=lambda c: (usage[c], c))
        colour_of[ward_id] = choice
        usage[choice] += 1
    return colour_of


# ---------------------------------------------------------------- neighbourhoods


def neighbourhoods_by_ward(wards, neighbourhoods):
    """For each ward, the official neighbourhoods that sit inside it, biggest first.

    A neighbourhood belongs to the ward that contains its deepest inside point.
    (Neighbourhood and ward borders don't line up perfectly, so this picks the
    ward that holds most of it.)
    """
    found = {ward["id"]: [] for ward in wards}
    for hood in neighbourhoods:
        main_part = largest_polygon(hood["geometry"])
        x, y = deepest_point(main_part, steps=15)
        for ward in wards:
            if any(point_in_polygon(x, y, poly) for poly in polygons_of(ward["geometry"])):
                name = hood["properties"]["AREA_NAME"]
                found[ward["id"]].append((ring_area(main_part[0]), name))
                break
    return {
        ward_id: [name for _, name in sorted(hoods, reverse=True)][:NEIGHBOURHOODS_PER_WARD]
        for ward_id, hoods in found.items()
    }


# ---------------------------------------------------------------- main


def clean_ward(feature):
    """Keep only what the map needs: ward number, name and shape."""
    props = feature["properties"]
    ward_number = int(props["AREA_SHORT_CODE"])  # "07" -> 7
    return {
        "type": "Feature",
        # A numeric id lets MapLibre remember "this ward is hovered" (feature state).
        "id": ward_number,
        "properties": {"ward_number": ward_number, "ward_name": props["AREA_NAME"]},
        "geometry": {
            "type": feature["geometry"]["type"],
            "coordinates": round_coordinates(feature["geometry"]["coordinates"]),
        },
    }


def save(filename, features):
    path = OUTPUT_DIR / filename
    with open(path, "w") as f:
        # separators=(",", ":") removes spaces to keep the file small.
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
    print(f"Saved {path.name} ({path.stat().st_size / 1024:.0f} KB)")


def main():
    local_folder = sys.argv[1] if len(sys.argv) > 1 else None
    raw_wards = load_source("city-wards-data-4326.geojson", local_folder)
    raw_hoods = load_source("neighbourhoods-4326.geojson", local_folder)

    wards = sorted((clean_ward(f) for f in raw_wards["features"]), key=lambda w: w["id"])
    # Safety check: fail loudly instead of silently showing the wrong wards.
    if len(wards) != 25:
        raise SystemExit(f"Expected 25 wards, got {len(wards)}. Check the source file.")

    neighbours = find_neighbouring_wards(wards)
    colours = assign_colour_groups(wards, neighbours)
    hoods = neighbourhoods_by_ward(wards, raw_hoods["features"])

    labels = []
    for ward in wards:
        ward["properties"]["color_group"] = colours[ward["id"]]
        # One plain string, because MapLibre turns lists inside properties into text anyway.
        ward["properties"]["neighbourhoods"] = ", ".join(hoods[ward["id"]])
        x, y = deepest_point(largest_polygon(ward["geometry"]))
        labels.append({
            "type": "Feature",
            "properties": {"ward_number": ward["id"]},
            "geometry": {"type": "Point", "coordinates": [round(x, DECIMALS), round(y, DECIMALS)]},
        })

    outline = city_outline(wards)
    print(f"City outline: {len(outline)} ring(s), sizes {sorted((len(r) for r in outline), reverse=True)[:6]}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    save("toronto-wards.geojson", wards)
    save("toronto-ward-labels.geojson", labels)
    save("toronto-mask.geojson", [mask_feature(outline)])

    for ward in wards:
        p = ward["properties"]
        print(f"  {p['ward_number']:>2} {p['ward_name']:<28} colour {p['color_group']}  {p['neighbourhoods']}")


if __name__ == "__main__":
    main()
