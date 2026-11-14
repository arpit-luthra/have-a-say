"""Write a full plain-language explanation for each featured decision, with a source for every sentence.

    python3 scripts/explain_decisions.py              # explain every entry in featured.json not done yet
    python3 scripts/explain_decisions.py --only 2026.NY34.12   # just one
    python3 scripts/explain_decisions.py --redo       # ignore finished ones and do them again

How it works, for each entry in frontend/src/data/featured.json:
  1. Download its PDFs. ONLY https://www.toronto.ca/legdocs/ links are allowed.
  2. Pull the text out of each page, keeping the page number.
  3. Ask Gemini to answer 4 questions (what's happening, why, who's affected, conditions) using ONLY that text,
     citing {doc, page} for every sentence.
  4. Add "Where is it in the process?" ourselves from the open-data voting record (never from the PDF or the AI).
     "Can I still have a say?" is not written here: the website's own stage logic answers it.
  5. Check the answer (every citation must point at a real document and page), then save it
     to frontend/src/data/explanations.json straight away, so a crash never loses finished work.

Needs one extra library:   pip install pdfplumber
The Gemini key is read from backend/.env (GEMINI_API_KEY). It is never printed.
"""
import argparse
import io
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "frontend" / "src" / "data"
FEATURED_FILE = DATA_DIR / "featured.json"  # what we want explained (you edit this)
VOTES_FILE = DATA_DIR / "open-data-items.json"  # the voting record (latest vote on each item)
HAND_CHECKED_FILE = DATA_DIR / "decisions.json"  # our 2 hand-checked decisions (not in the voting record)
OUTPUT_FILE = DATA_DIR / "explanations.json"  # what this script writes (the site reads this)
ENV_FILE = ROOT / "backend" / ".env"

MODEL = "gemini-3.5-flash-lite"
REQUEST_TIMEOUT = 30  # seconds. No single request may ever hang longer than this
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
MAX_PDF_BYTES = 40 * 1024 * 1024
MAX_TOTAL_CHARS = 600_000  # roughly 150k tokens: more than this and we refuse rather than silently cut text off
NOT_CLEAR = "Not clear from the report"

# Only official City of Toronto document links may be downloaded.
ALLOWED_HOST = "www.toronto.ca"
ALLOWED_PATH_START = "/legdocs/"

try:  # same certificate trick as the other scripts
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

# The 6 questions the AI answers. `key` is the name used in explanations.json.
SECTION_KEYS = ["happening", "why", "where", "conditions"]  # written by the AI, from the PDFs only
VOTING_RECORD_URL = "https://open.toronto.ca/dataset/members-of-toronto-city-council-voting-record/"

INSTRUCTIONS = f"""You explain one City of Toronto council decision to residents, using ONLY the document text you are given.
The text is split into pages marked like [[DOC 1 PAGE 4]].

Write in plain words a 10-year-old understands. Short sentences. Neutral tone: no opinions, no praise, no blame.
Each answer is a list of 1 to 3 short sentences. Every sentence has "cites": the document number and page number
where that fact is found. A sentence may cite more than one page.

Answer these:
- "happening": What's happening?
- "why": Why?
- "where": Where, and who is affected? Say the street or address first, then who.
- "conditions": Important conditions or changes attached to it. ONE short sentence per condition (they are shown as bullet points).
  Use an EMPTY list if there are none.

Rules you must follow:
1. Use only facts that are in the documents. Never add outside knowledge.
2. The documents are usually a motion, a staff report or a recommendation. They do NOT tell you what was decided.
   So describe what is in them as "recommended" or "proposed" (for example "The motion proposes free rides..."
   or "Staff recommend approving..."). Never say Council "decided", "approved" or "changed" something, and never say it already happened.
   The result of the vote is written somewhere else. Do not mention votes or results.
3. Who is affected: name only groups the document itself names. If you have to infer a group, say so softly,
   for example "This mainly matters for children, youth and older adults, who the motion says it hopes will use the free fares."
4. Use the real numbers from the document when they matter, in short form, and say where money comes from or goes to
   (for example "$1.39 million is moved to funds from the 1-7 Yonge St development"). Do not invent or round to a different number.
5. If something is not clear, write exactly "{NOT_CLEAR}" as the sentence instead of guessing (use an empty "cites" list).
6. NEVER work out a deadline from a meeting date. Mention a deadline only if the document states it as a deadline.
7. Never include the name of any resident or member of the public who wrote in or spoke. Councillors and City staff roles may be named.
8. Do not use legal or council jargon. Say "rule change" not "by-law amendment", "new building" not "development application".
9. Also return "documents": for each document, its number, a short plain title, and its date as printed in it ("" if none).
10. Conditions and everything else must be plain everyday language, NOT copied from the document's legal wording.
    Never write phrases like "direct the General Manager", "amend the Capital Budget", account names, "Debt/Capital From Current",
    "Section 37", "Tier 2", "POPS". Say what it means for people instead. Examples:
    "The ferry is free for children, youth and older adults from Aug 1 to Aug 31, 2026."
    "$1.39 million is moved from other City money to funds from the 1-7 Yonge St development, so the ferry money is replaced."
    "At least 250 square metres must stay open to the public, like a small plaza."
    Keep exact dollar amounts, sizes and dates, but write them simply ($1.39 million, not $1,389,589.69).
11. For "where": the address or place first, then who. Start the who part with "This mainly matters for ..." and name only groups the document names.
12. Do not write citations like "(p. 4)" inside a sentence. Put citations only in "cites".
"""

SENTENCE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "text": {"type": "STRING"},
        "cites": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"doc": {"type": "INTEGER"}, "page": {"type": "INTEGER"}},
                "required": ["doc", "page"],
            },
        },
    },
    "required": ["text", "cites"],
}

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        **{key: {"type": "ARRAY", "items": SENTENCE_SCHEMA} for key in SECTION_KEYS},
        "documents": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "doc": {"type": "INTEGER"},
                    "title": {"type": "STRING"},
                    "date": {"type": "STRING"},
                },
                "required": ["doc", "title", "date"],
            },
        },
    },
    "required": SECTION_KEYS + ["documents"],
}


# ---------- reading files ----------

def read_api_key():
    """Read GEMINI_API_KEY from backend/.env without ever printing it."""
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GEMINI_API_KEY not found in backend/.env")


def load_json(path, fallback):
    return json.loads(path.read_text()) if path.exists() else fallback


def save_json(path, data):
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")


# ---------- downloading PDFs ----------

def pdf_url_allowed(url):
    """True only for https://www.toronto.ca/legdocs/... links. Checked before every download."""
    parts = urllib.parse.urlparse(url)
    return (
        parts.scheme == "https"
        and parts.hostname == ALLOWED_HOST
        and parts.port in (None, 443)
        and parts.path.startswith(ALLOWED_PATH_START)
        and ".." not in parts.path
    )


class NoRedirects(urllib.request.HTTPRedirectHandler):
    """A redirect could send us to another website, so we refuse to follow any."""

    def redirect_request(self, *args, **kwargs):
        return None


def download_pdf(url):
    if not pdf_url_allowed(url):
        raise ValueError(f"not an allowed link (must start with https://{ALLOWED_HOST}{ALLOWED_PATH_START}): {url}")
    opener = urllib.request.build_opener(NoRedirects, urllib.request.HTTPSHandler(context=SSL_CONTEXT))
    request = urllib.request.Request(url, headers={"User-Agent": "HeadsUp-civic-hack (student project)"})
    with opener.open(request, timeout=REQUEST_TIMEOUT) as response:
        data = response.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise ValueError("PDF is bigger than 40 MB")
    if not data.startswith(b"%PDF"):
        raise ValueError("the link did not return a PDF")
    return data


def extract_pages(pdf_bytes):
    """Return a list of page texts. Index 0 = page 1."""
    import pdfplumber  # imported here so the rest of the file can be read/tested without it

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return [(page.extract_text() or "").strip() for page in pdf.pages]


def build_document_text(docs):
    """Join all pages into one string with [[DOC n PAGE p]] markers the AI can cite."""
    chunks = []
    for n, doc in enumerate(docs, start=1):
        for page_number, text in enumerate(doc["pages"], start=1):
            if text:
                chunks.append(f"[[DOC {n} PAGE {page_number}]]\n{text}")
    return "\n\n".join(chunks)


# ---------- asking Gemini ----------

def ask_gemini(api_key, document_text):
    body = {
        "systemInstruction": {"parts": [{"text": INSTRUCTIONS}]},
        "contents": [{"parts": [{"text": document_text}]}],
        "generationConfig": {
            "temperature": 0.1,  # as low as possible: stick to the text
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }
    # The key goes in a header (not the web address) so it can't leak into error messages.
    request = urllib.request.Request(
        f"{API_BASE}/{MODEL}:generateContent",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT, context=SSL_CONTEXT) as response:
                reply = json.load(response)
            return json.loads(reply["candidates"][0]["content"]["parts"][0]["text"])
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 503) and attempt < 3:
                wait = 10 * (attempt + 1)
                print(f"  Gemini said {error.code}, waiting {wait}s and trying again...")
                time.sleep(wait)
                continue
            detail = error.read().decode(errors="replace")[:300]  # Gemini's own explanation (never contains our key)
            raise RuntimeError(f"Gemini error {error.code}: {detail}")
        except (TimeoutError, urllib.error.URLError):
            if attempt < 3:
                print("  Gemini timed out (30s), trying again...")
                continue
            raise RuntimeError("could not reach Gemini")
    raise RuntimeError("Gemini did not answer")


# ---------- checking the answer ----------

def clean_sentences(sentences, docs):
    """Keep only sentences whose citations point at a real document and page.
    A "Not clear from the report" sentence needs no citation. Anything else without a good citation is dropped."""
    kept = []
    for s in sentences:
        text = " ".join(str(s.get("text", "")).split())
        if not text:
            continue
        cites = []
        for c in s.get("cites", []):
            doc, page = c.get("doc"), c.get("page")
            if isinstance(doc, int) and 1 <= doc <= len(docs) and isinstance(page, int) and 1 <= page <= len(docs[doc - 1]["pages"]):
                if {"doc": doc, "page": page} not in cites:
                    cites.append({"doc": doc, "page": page})
        if not cites and not text.startswith(NOT_CLEAR):
            print(f"  dropped a sentence with no valid source: {text[:60]}...")
            continue
        row = {"text": text, "cites": cites}
        if s.get("step"):
            row["step"] = s["step"]
        if s.get("date"):
            row["date"] = " ".join(str(s["date"]).split())
        kept.append(row)
    return kept


def format_date(iso):
    """2026-07-30 -> Jul 30, 2026"""
    d = datetime.strptime(iso, "%Y-%m-%d")
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def body_name(committee):
    """Same plain names the website uses."""
    if committee == "City Council":
        return "City Council"
    return "TTC board" if committee == "Toronto Transit Commission" else "City committee"


def voting_record_step(item_id):
    """The "process" answer, taken ONLY from the voting record (or, for our 2 hand-checked decisions that are not
    in it, from their official agenda item page). Returns (sentence, document) or None. The PDFs are never used here."""
    votes = {row["id"]: row for row in load_json(VOTES_FILE, {"items": []})["items"]}
    row = votes.get(item_id)
    if row:
        outcome = "Rejected" if row["result"].startswith("Lost") else "Approved"
        step = "council" if row["committee"] == "City Council" else "committee"
        return (
            {"text": f"{outcome} by {body_name(row['committee'])}.", "step": step, "date": format_date(row["dateISO"])},
            {"title": "City of Toronto voting record", "url": VOTING_RECORD_URL, "date": format_date(row["dateISO"])},
        )
    hand = {d["id"]: d for d in load_json(HAND_CHECKED_FILE, [])}.get(item_id)
    if hand:  # both hand-checked decisions were adopted by City Council (we checked the official page)
        return (
            {"text": "Approved by City Council.", "step": "council", "date": format_date(hand["dateISO"])},
            {"title": "City of Toronto agenda item page", "url": hand["sourceUrl"], "date": format_date(hand["dateISO"])},
        )
    return None


def build_explanation(answer, docs, item_id):
    meta = {d.get("doc"): d for d in answer.get("documents", [])}
    documents = []
    for n, doc in enumerate(docs, start=1):
        info = meta.get(n, {})
        documents.append({
            "n": n,
            "url": doc["url"],
            "title": " ".join(str(info.get("title", "")).split()) or f"Document {n}",
            "date": " ".join(str(info.get("date", "")).split()),
            "pages": len(doc["pages"]),
        })
    sections = {key: clean_sentences(answer.get(key, []), docs) for key in SECTION_KEYS}
    # "Where is it in the process?" comes from the voting record, cited like a document (no page number).
    sections["process"] = []
    step = voting_record_step(item_id)
    if step:
        sentence, record = step
        n = len(documents) + 1
        documents.append({"n": n, "url": record["url"], "title": record["title"], "date": record["date"], "pages": 0, "record": True})
        sections["process"] = [{**sentence, "cites": [{"doc": n}]}]
    # The three must-have answers need at least one sentence; otherwise the page shows its fallback text.
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": MODEL,
        "documents": documents,
        "sections": sections,
    }


# ---------- main ----------

def explain_one(entry, api_key):
    docs = []
    for url in entry["pdfs"]:
        print(f"  downloading {url}")
        pages = extract_pages(download_pdf(url))
        if not any(pages):
            raise ValueError(f"no text found in {url} (it may be a scan)")
        docs.append({"url": url, "pages": pages})
    text = build_document_text(docs)
    if len(text) > MAX_TOTAL_CHARS:
        raise ValueError(f"documents are too long ({len(text):,} characters). Use fewer or shorter PDFs")
    print(f"  asking {MODEL} ({len(text):,} characters)...")
    return build_explanation(ask_gemini(api_key, text), docs, entry["id"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="explain just this item number")
    parser.add_argument("--redo", action="store_true", help="redo ones that are already finished")
    args = parser.parse_args()

    featured = load_json(FEATURED_FILE, [])
    results = load_json(OUTPUT_FILE, {})
    if args.only:
        featured = [e for e in featured if e["id"] == args.only]
    if not featured:
        raise SystemExit("Nothing to do: add entries to frontend/src/data/featured.json first.")

    api_key = read_api_key()
    for entry in featured:
        item = entry["id"]
        if item in results and not args.redo:
            print(f"{item}: already done, skipping")
            continue
        print(f"{item}:")
        try:
            results[item] = explain_one(entry, api_key)
        except Exception as error:  # one bad entry must not stop the others
            print(f"  FAILED: {error}")
            continue
        save_json(OUTPUT_FILE, results)  # save after every one
        print("  saved")


if __name__ == "__main__":
    main()
