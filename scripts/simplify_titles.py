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
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
BATCH_SIZE = 20
SECONDS_BETWEEN_REQUESTS = 7  # free tier allows roughly 10 requests a minute
MAX_WORDS = 8  # simplified titles must be this short
MAX_WORDS_KEPT = 25  # a cleaned-up official title (simplified = false) can be longer
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

# These rules are the heart of the script: they keep the AI from adding facts.
INSTRUCTIONS = """You rewrite official Toronto City Council agenda item titles as very short, plain headlines.

Rules:
- MAX 8 WORDS. Grade 5 reading level. Everyday words only.
- Start with what is happening, like a news headline. Examples of the style:
  "New building approved on Eglinton Ave"
  "11 Yonge St buildings protected as heritage"
  "Basement flooding fix: engineers hired"
  "New members join Police Board"
  "July named Caribbean Heritage Month"
- Use NO legal, planning or council words. Never write: designate, designation, Part IV, Heritage Register, by-law, bylaw, amendment, procurement, award, Ariba, zoning, Official Plan, application, authorization, report, recommendation, motion, councillor. Say it in everyday words instead (for example "protected as heritage", "hired", "new rule").
- Use ONLY what is in the official title and the vote result. NEVER add words or facts that are not in the official title (do not add a reason, a place, a number or a purpose).
- The vote result: "Carried" = approved/passed, "Lost" = rejected. Only say approved or rejected when the title is about deciding something (for example "... - Approval", or a proposal). A plain update or report is not a decision, so do not claim one.
- Keep street addresses (shorten "Avenue" to "Ave", "Street" to "St", "East" to "E" etc.).
- Neutral tone. No opinions, no praise, no warnings.
- If the meaning is not clear from the title alone, do not guess: return a cleaned-up version of the official title (fix capitals, drop "by Councillor X, seconded by Y") and set simplified to false. Otherwise set simplified to true.

You get a JSON list of {id, title, result}. Return a JSON list of {id, plain_title, simplified}, one per input, same ids."""


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


def looks_ok(plain_title, simplified):
    """Cheap safety checks. Anything that fails is NOT saved as-is (it gets asked again, and if it
    still fails, the site keeps the official title). Kept-official titles may be longer and may
    contain official words, but never "by Councillor ..." leftovers."""
    words = len(plain_title.split())
    if simplified:
        return 1 <= words <= MAX_WORDS and not BANNED.search(plain_title)
    return 1 <= words <= MAX_WORDS_KEPT and not re.search(r"\bseconded\b|\bby councillor\b", plain_title, re.I)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=MODEL, help="Gemini model name (switch if one is overloaded)")
    parser.add_argument("--redo", action="store_true", help="ignore the cache and ask again")
    parser.add_argument("--limit", type=int, help="only look at the first N items (for testing)")
    args = parser.parse_args()

    items = json.loads(ITEMS_FILE.read_text())["items"]
    if args.limit:
        items = items[: args.limit]

    cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
    # Redo an item if its official title changed since we last simplified it.
    todo = [i for i in items if args.redo or cache.get(i["id"], {}).get("official") != i["title"]]
    for item in todo:
        cache.pop(item["id"], None)  # --redo: old results are overwritten, never left behind
    print(f"{len(items)} items, {len(items) - len(todo)} already done, {len(todo)} to do.")

    api_key = read_api_key()
    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start : start + BATCH_SIZE]
        # Ask up to 3 times: whatever fails the checks is asked again.
        remaining = batch
        for attempt in range(3):
            asked = [{"id": i["id"], "title": i["title"], "result": i["result"]} for i in remaining]
            answers = ask_gemini(api_key, asked, args.model)
            failed = []
            for item in remaining:
                answer = answers.get(item["id"], {})
                plain = answer.get("plain_title", "").strip()
                simplified = bool(answer.get("simplified"))
                if looks_ok(plain, simplified):
                    # simplified=False means "meaning unclear, we only tidied the official title"
                    cache[item["id"]] = {"official": item["title"], "plain": plain, "simplified": simplified}
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

    done = [cache[i["id"]] for i in items if i["id"] in cache]
    simplified = sum(1 for c in done if c["simplified"])
    print(f"Done. {simplified} simplified, {len(done) - simplified} kept as cleaned official title, {len(items) - len(done)} missing.")


if __name__ == "__main__":
    main()
