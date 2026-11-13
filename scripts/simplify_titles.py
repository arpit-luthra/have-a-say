"""Turn official council titles into plain titles using FIXED TEMPLATES (one per topic).

    python3 scripts/simplify_titles.py --limit 40     # test on the first 40 items
    python3 scripts/simplify_titles.py                # do everything
    python3 scripts/simplify_titles.py --redo         # ignore the cache (use after changing the rules)

How it works:
  1. Read the items from open-data-items.json.
  2. Skip any item already in plain-titles.json (this file is our cache).
  3. Send the rest to Gemini in batches of 20, wait between batches (free-tier limit).
  4. Save every batch right away, so a crash never loses finished work.

The key is read from backend/.env (GEMINI_API_KEY). It is never printed.
"""
import argparse
import json
import re
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "frontend" / "src" / "data"
ITEMS_FILE = DATA_DIR / "open-data-items.json"
CACHE_FILE = DATA_DIR / "plain-titles.json"
ENV_FILE = ROOT / "backend" / ".env"

MODEL = "gemini-3.8-flash"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
BATCH_SIZE = 20
SECONDS_BETWEEN_REQUESTS = 7  # free tier allows roughly 10 requests a minute
MAX_WORDS = 14  # a finished title (template + place + words) must stay short
# Words a plain title must never contain (the same list the prompt forbids).
BANNED = re.compile(
    r"designat|part iv|heritage register|by-?law|amendment|procurement|award|ariba|zoning|official plan|"
    r"authorization|councillor|seconded|\\bmotion\\b",
    re.I,
)

try:  # same certificate trick as import_open_data.py
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

TOPICS = [
    "Housing", "Heritage", "Bike lanes", "Roads & traffic", "Transit", "Parking", "Parks & trees",
    "Taxes & budget", "Safety", "Community services", "Environment", "Business & licences", "Other",
]
# Words a plain title must never contain (legal / city words a 10-year-old would not know).
BANNED = re.compile(
    r"heritage|amendment|by-?law|designat|directions?|hearing|part iv|award|procurement|\bolt\b|tribunal|"
    r"zoning|official plan|application|authoriz|councillor|seconded|\bmotion\b|ariba|recommend|report|"
    r"conveyance|easement|lease|surplus|expropriat|reserve|capital|operating|appeal",
    re.I,
)
# Street types are shortened the way people write them.
ABBREVIATIONS = {
    "avenue": "Ave", "street": "St", "road": "Rd", "crescent": "Cres", "boulevard": "Blvd", "drive": "Dr",
    "east": "E", "west": "W", "north": "N", "south": "S", "court": "Crt", "place": "Pl", "terrace": "Terr",
    "square": "Sq", "gardens": "Gdns", "lane": "Ln", "parkway": "Pkwy", "circle": "Cir",
}

try:  # same certificate trick as import_open_data.py
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

# The AI only SORTS and EXTRACTS (topic, places, a few words). The sentence itself is built by
# our own templates below, so the wording is the same every time and easy to explain.
INSTRUCTIONS = """You read official Toronto City Council agenda item titles and pull out a few facts. You do NOT write sentences.

For each {id, title, result} return:
- topic: exactly one of: Housing, Heritage, Bike lanes, Roads & traffic, Transit, Parking, Parks & trees, Taxes & budget, Safety, Community services, Environment, Business & licences, Other.
  Housing = new homes or buildings, rezoning, development applications, housing plans. Heritage = protecting an old building (designation, heritage register). Transit = TTC, subway, streetcar, bus routes. Roads & traffic = traffic, speed, signals, sidewalks, road works, bridges. Taxes & budget = city money, budget, taxes, fees. If unsure, use Other.
- housing_kind (only when topic is Housing, else "none"): "building" if the title is a decision on a development application at ONE street address (e.g. "... Application - Decision Report - Approval/Refusal"); "area" if it is about planning or homes for a neighbourhood or area (not one address); "unclear" otherwise (for example a request for directions, an appeal, a status update).
- places: up to 3 places named in the title, in the order given. Streets and parks exactly as people say them, with the street type shortened (Avenue=Ave, Street=St, Road=Rd, Crescent=Cres, Boulevard=Blvd, Drive=Dr, East=E, West=W). For Housing "building" and Heritage, give the full address WITH its number, e.g. "245 Eglinton Ave E". For other topics give streets WITHOUT numbers, e.g. "Lennox St". For housing "area", give the area name. Only places that are written in the title. Empty list if none.
- what: a very short everyday-words phrase saying what it is about, taken ONLY from the title. Max 5 words (max 7 for topic Other). No city or legal words. Never write: heritage, amendment, by-law, designate, directions, hearing, Part IV, award, procurement, application, report, motion, councillor, lease, easement. No facts that are not in the title. Examples: "buying new buses", "police board members", "street food vendors", "basement flooding fixes".
  For topic Other, "what" must read like a short plain headline of what happened, e.g. "July named Caribbean Heritage Month" -> "July named Caribbean history month". Use "approved" only if result is Carried and the title is a decision; "rejected" if Lost and it is a decision. A plain update is not a decision.

Return a JSON list of {id, topic, housing_kind, places, what}, one per input, same ids."""


def street_style(place):
    """Shorten street types: 'Eglinton Avenue East' -> 'Eglinton Ave E'."""
    words = [ABBREVIATIONS.get(w.lower().strip(","), w.strip(",")) for w in place.split()]
    return " ".join(words)


def place_ok(place, official):
    """A place is only allowed if its name words really appear in the official title."""
    title = official.lower().replace("-", " ")
    for word in re.findall(r"[A-Za-z0-9']+", place):
        if word.lower() in ABBREVIATIONS.values() or word.lower() in ("st", "ave", "rd", "e", "w", "n", "s"):
            continue  # abbreviations are checked by the type words below
        if word.lower() not in title:
            return False
    return True


def join_places(places):
    """'A', 'A and B', or 'A, B and nearby streets' (max 2 places named)."""
    if len(places) == 1:
        return places[0]
    if len(places) == 2:
        return f"{places[0]} and {places[1]}"
    return f"{places[0]}, {places[1]} and nearby streets"


def build_title(row, official, result):
    """Fixed templates, one per topic. Returns (topic, title). Falls back to the 'Other' template."""
    topic = row.get("topic") if row.get("topic") in TOPICS else "Other"
    carried = result.lower().startswith("carried")
    places = [street_style(p.strip()) for p in row.get("places", []) if p.strip()]
    places = [p for p in places if place_ok(p, official)]
    what = row.get("what", "").strip().rstrip(".")
    place_text = join_places(places[:3]) if places else ""
    if len(places) > 2:  # keep the rule: max 2 places, then "and nearby streets"
        place_text = join_places(places)

    if topic == "Housing" and places:
        kind = row.get("housing_kind")
        if kind == "building" and re.search(r"\d", places[0]):
            return topic, f"New building {'approved' if carried else 'rejected'} at {places[0]}"
        if kind == "area":
            return topic, f"More homes planned for {place_text}"
    elif topic == "Heritage" and places and carried and re.search(r"\d", places[0]):
        return topic, f"Old building at {places[0]} can't be torn down"
    elif topic == "Bike lanes" and places:
        return topic, f"Bike lane changes on {place_text}"
    elif topic == "Roads & traffic" and places:
        return topic, f"Traffic changes on {place_text}"
    elif topic == "Transit" and places:
        return topic, f"TTC changes on {place_text}"
    elif topic == "Parking" and places:
        return topic, f"Parking changes on {place_text}"
    elif topic == "Parks & trees" and places:
        return topic, f"Park changes at {place_text}"
    elif topic in LABELS and what:
        return topic, f"{LABELS[topic]}: {what}"
    return "Other", what[:1].upper() + what[1:]


LABELS = {
    "Taxes & budget": "City money",
    "Safety": "Police and safety",
    "Community services": "Community services",
    "Environment": "Environment",
    "Business & licences": "Business rules",
}


def read_api_key():
    """Read GEMINI_API_KEY from backend/.env without ever printing it."""
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GEMINI_API_KEY not found in backend/.env")


def ask_gemini(api_key, batch, model):
    """Send one batch, return {id: answer row}. Retries politely if we are rate-limited."""
    body = {
        "systemInstruction": {"parts": [{"text": INSTRUCTIONS}]},
        "contents": [{"parts": [{"text": json.dumps(batch)}]}],
        "generationConfig": {
            "temperature": 0.2,  # low = stick to the facts, less creative
            "responseMimeType": "application/json",
            "thinkingConfig": {"thinkingBudget": 0},  # simple rewrite, no need to "think"
            "responseSchema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING"},
                        "topic": {"type": "STRING", "enum": TOPICS},
                        "housing_kind": {"type": "STRING", "enum": ["building", "area", "unclear", "none"]},
                        "places": {"type": "ARRAY", "items": {"type": "STRING"}},
                        "what": {"type": "STRING"},
                    },
                    "required": ["id", "topic", "housing_kind", "places", "what"],
                },
            },
        },
    }
    # The key goes in a header (not the web address) so it can't leak into error messages.
    request = urllib.request.Request(
        f"{API_BASE}/{model}:generateContent",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    for attempt in range(8):
        try:
            with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
                reply = json.load(response)
            text = reply["candidates"][0]["content"]["parts"][0]["text"]
            return {row["id"]: row for row in json.loads(text)}
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 503) and attempt < 7:
                wait = min(30 * (attempt + 1), 120)
                print(f"  Gemini said {error.code}, waiting {wait}s and trying again...")
                time.sleep(wait)
                continue
            raise SystemExit(f"Gemini error {error.code}: {error.read().decode()[:300]}")
        except (TimeoutError, urllib.error.URLError) as error:  # slow or dropped connection: try again
            if attempt < 7:
                print("  connection timed out, trying again...")
                continue
            raise SystemExit(f"Could not reach Gemini: {type(error).__name__}")
    return {}


def looks_ok(title):
    """Cheap safety checks. A title that fails is asked again; if it still fails, the site keeps
    the official title."""
    return 2 <= len(title.split()) <= MAX_WORDS and not BANNED.search(title)


def load_items():
    """All 1,112 decisions: the open-data ones plus our 2 hand-checked ones (both were adopted)."""
    items = json.loads(ITEMS_FILE.read_text())["items"]
    ids = {i["id"] for i in items}
    for d in json.loads((DATA_DIR / "decisions.json").read_text()):
        if d["id"] not in ids:
            items.append({"id": d["id"], "title": d["title"], "result": "Carried"})
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=MODEL, help="Gemini model name (switch if one is overloaded)")
    parser.add_argument("--redo", action="store_true", help="ignore the cache and ask again")
    parser.add_argument("--limit", type=int, help="only look at the first N items (for testing)")
    args = parser.parse_args()

    items = load_items()
    if args.limit:
        items = items[: args.limit]

    cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
    # Old-style entries have no "topic": they came from the old rules, so they are redone too.
    todo = [i for i in items if args.redo or cache.get(i["id"], {}).get("template") != i["title"]]
    for item in todo:
        cache.pop(item["id"], None)  # old results are overwritten, never left behind
    print(f"{len(items)} items, {len(items) - len(todo)} already done, {len(todo)} to do.")

    api_key = read_api_key()
    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start : start + BATCH_SIZE]
        remaining = batch
        for attempt in range(3):  # whatever fails the checks is asked again
            asked = [{"id": i["id"], "title": i["title"], "result": i["result"]} for i in remaining]
            answers = ask_gemini(api_key, asked, args.model)
            failed = []
            for item in remaining:
                row = answers.get(item["id"])
                topic, plain = build_title(row, item["title"], item["result"]) if row else ("Other", "")
                if looks_ok(plain):
                    cache[item["id"]] = {"official": item["title"], "template": item["title"], "topic": topic, "plain": plain}
                else:
                    failed.append(item)
            remaining = failed
            if not remaining:
                break
            time.sleep(SECONDS_BETWEEN_REQUESTS)
        for item in remaining:
            print(f"  gave up on {item['id']}: it keeps its official title")

        CACHE_FILE.write_text(json.dumps(cache, indent=1, ensure_ascii=False) + "\n")
        print(f"  saved batch {start // BATCH_SIZE + 1} ({len(cache)} titles in cache)")
        if start + BATCH_SIZE < len(todo):
            time.sleep(SECONDS_BETWEEN_REQUESTS)

    print(f"Done. {sum(1 for i in items if i['id'] in cache)} of {len(items)} have a plain title.")


if __name__ == "__main__":
    main()
