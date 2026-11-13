"""Turn official council titles into short plain-language titles, using Gemini.

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
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
BATCH_SIZE = 20
SECONDS_BETWEEN_REQUESTS = 7  # free tier allows roughly 10 requests a minute
MAX_WORDS = 12  # we ask for ~10; anything much longer gets flagged

try:  # same certificate trick as import_open_data.py
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

# These rules are the heart of the script: they keep the AI from adding facts.
INSTRUCTIONS = """You rewrite official Toronto City Council agenda item titles as short, plain-language headlines.

Rules:
- Max about 10 words. Everyday words, like a news headline a 12-year-old understands.
- Use ONLY what is in the official title and the vote result. NEVER add words or facts that are not in the official title. Example: do not say "plan" unless the title says "plan".
- If the meaning is not clear from the title alone, do not guess: return a cleaned-up version of the official title instead (fix capitals, drop process words and "by Councillor X, seconded by Y"), and set simplified to false. Otherwise set simplified to true.
- Neutral tone. No opinions, no praise, no warnings.
- The vote result: "Carried" means approved/passed, "Lost" means rejected. Only say approved or rejected when the title itself is about deciding something (for example "... - Approval", or a motion). A plain report or update is not a decision, so do not claim one.
- Translate common jargon into these plain words:
  "Order Paper" -> "Council's meeting agenda"
  "Member Motion" -> "Councillor's proposal"
  "By-law" -> "City rule"
  "Official Plan Amendment" / "Zoning By-law Amendment" (applications) -> "building/land-use change"
  "Decision Report - Approval" -> "approved"
- Drop other process jargon such as "Decision Report" and "Application". Keep street addresses.
- Examples:
  "245 Eglinton Avenue East - Official Plan Amendment and Zoning By-law Amendment Application - Decision Report - Approval" + Carried -> "Building/land-use change approved at 245 Eglinton Ave E"
  "Proclaiming July as Caribbean Heritage Month - by Councillor..." -> "July named Caribbean Heritage Month"
  "Review of the Order Paper" -> "Review of Council's meeting agenda"

You get a JSON list of {id, title, result}. Return a JSON list of {id, plain_title, simplified}, one per input, same ids."""


def read_api_key():
    """Read GEMINI_API_KEY from backend/.env without ever printing it."""
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GEMINI_API_KEY not found in backend/.env")


def ask_gemini(api_key, batch):
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
                        "plain_title": {"type": "STRING"},
                        "simplified": {"type": "BOOLEAN"},
                    },
                    "required": ["id", "plain_title", "simplified"],
                },
            },
        },
    }
    # The key goes in a header (not the web address) so it can't leak into error messages.
    request = urllib.request.Request(
        API_URL,
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


def looks_ok(plain_title):
    """Cheap safety checks. Anything that fails is NOT saved (the site keeps the official title)."""
    words = len(plain_title.split())
    return 1 <= words <= MAX_WORDS and not re.search(r"\bseconded\b|\bby councillor\b", plain_title, re.I)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--redo", action="store_true", help="ignore the cache and ask again")
    parser.add_argument("--limit", type=int, help="only look at the first N items (for testing)")
    args = parser.parse_args()

    items = json.loads(ITEMS_FILE.read_text())["items"]
    if args.limit:
        items = items[: args.limit]

    cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
    # Redo an item if its official title changed since we last simplified it.
    todo = [i for i in items if args.redo or cache.get(i["id"], {}).get("official") != i["title"]]
    print(f"{len(items)} items, {len(items) - len(todo)} already done, {len(todo)} to do.")

    api_key = read_api_key()
    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start : start + BATCH_SIZE]
        asked = [{"id": i["id"], "title": i["title"], "result": i["result"]} for i in batch]
        answers = ask_gemini(api_key, asked)

        for item in batch:
            answer = answers.get(item["id"], {})
            plain = answer.get("plain_title", "").strip()
            if looks_ok(plain):
                # simplified=False means "meaning unclear, we only tidied the official title"
                cache[item["id"]] = {"official": item["title"], "plain": plain, "simplified": bool(answer.get("simplified"))}
            else:
                print(f"  skipped {item['id']}: bad or missing answer ({plain!r})")

        CACHE_FILE.write_text(json.dumps(cache, indent=1, ensure_ascii=False) + "\n")
        print(f"  saved batch {start // BATCH_SIZE + 1} ({len(cache)} titles in cache)")
        if start + BATCH_SIZE < len(todo):
            time.sleep(SECONDS_BETWEEN_REQUESTS)

    done = [cache[i["id"]] for i in items if i["id"] in cache]
    simplified = sum(1 for c in done if c["simplified"])
    print(f"Done. {simplified} simplified, {len(done) - simplified} kept as cleaned official title, {len(items) - len(done)} missing.")


if __name__ == "__main__":
    main()
