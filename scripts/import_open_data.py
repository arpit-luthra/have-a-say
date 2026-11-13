"""Download Toronto Open Data and save small, clean JSON files for the app.

What it does:
  1. Member Voting Record  -> one entry per distinct agenda item  (open-data-items.json)
  2. Meeting Schedule      -> upcoming meetings only              (upcoming-meetings.json)
  3. Each councillor's vote on each item + councillors' wards and
     public office contact info                                      (public/data/votes.json)

Run it any time (even nightly): it overwrites the two files with fresh data.
    python3 scripts/import_open_data.py

Only public Toronto Open Data is used (CKAN API, no key needed).
We never touch secure.toronto.ca, because it blocks automated access.
"""
import json
import re
import ssl
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
VOTING_DATASET = "members-of-toronto-city-council-voting-record"
SCHEDULE_DATASET = "city-council-and-committees-meeting-schedule-reports"
CONTACT_DATASET = "elected-officials-contact-information"

# Official page for one agenda item. We only BUILD the link from the item number;
# we never request this page.
ITEM_URL = "https://secure.toronto.ca/council/agenda-item.do?item={}"
MEETINGS_URL = "https://www.toronto.ca/city-government/council/council-committee-meetings/"

# python.org's Python on macOS ships without trusted certificates, so we borrow
# the list from the "certifi" package (pip install certifi) when it is installed.
try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"
PUBLIC_DATA_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data"


def get_json(url):
    # A plain, honest User-Agent: we are a small student project reading open data.
    request = urllib.request.Request(url, headers={"User-Agent": "heads-up-civic-hack/1.0"})
    with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
        return json.load(response)


def newest_json_file_url(dataset_name):
    """Each dataset has one JSON file per council term. Pick the newest term
    (names look like '...-2022-2026.json', so the last one alphabetically is newest)."""
    package = get_json(f"{CKAN}/package_show?id={dataset_name}")["result"]
    files = [r for r in package["resources"] if r["format"] == "JSON"]
    files.sort(key=lambda r: r["name"])
    return files[-1]["url"]


def build_items(rows):
    """The voting record has one row per councillor per vote.
    We collapse it to one row per agenda item."""
    items = {}
    for row in rows:
        item_id = row["Agenda Item #"]
        when = row["Date/Time"]  # e.g. "2026-07-30 ..." or "2026-07-30"
        seen = items.get(item_id)
        # Keep the details of the LATEST vote on this item.
        if seen is None or when >= seen["_when"]:
            items[item_id] = {
                "_when": when,
                "id": item_id,
                "title": row["Agenda Item Title"].strip(),
                "committee": row["Committee"].strip(),
                "dateISO": when[:10],
                "result": row["Result"].strip(),
                "sourceUrl": ITEM_URL.format(item_id),
            }
    result = sorted(items.values(), key=lambda i: i["dateISO"], reverse=True)
    for item in result:
        del item["_when"]  # only needed for comparing
    return result


VOTE_CODES = {"Yes": "Y", "No": "N", "Absent": "A", "Absent(Interest Declared)": "I"}


def person_key(first, last):
    return f"{first.strip()} {last.strip()}"


def build_councillors(vote_rows):
    """Everyone who appears in the voting record, with their ward when the contact
    dataset can be matched by exact first + last name. No match = ward stays None
    (we never guess)."""
    contact_rows = get_json(newest_json_file_url(CONTACT_DATASET))
    contacts = {person_key(c["First name"], c["Last name"]): c for c in contact_rows}
    names = sorted({person_key(r["First Name"], r["Last Name"]) for r in vote_rows})
    people = []
    for name in names:
        c = contacts.get(name)
        ward = None
        if c and c["Primary role"] == "Councillor" and str(c["District ID"]).isdigit():
            ward = int(c["District ID"])
        clean = lambda v: None if v in (None, "", "None") else v
        people.append({
            "name": name,
            "role": c["Primary role"] if c else None,
            "ward": ward,
            "email": clean(c["Email"]) if c else None,
            "phone": clean(c["Phone"]) if c else None,
            "website": clean(c["Website"]) if c else None,
        })
    return people


def build_votes(rows, people):
    """For each item, how every person voted in the item's LATEST vote (the same vote
    that open-data-items.json shows). Stored as one short string per item, one letter per
    person in `people` order: Y yes, N no, A absent, I absent (declared interest),
    - = no row for that person in this vote.
    An item is skipped if the counts don't match the official result (we don't guess)."""
    index = {p["name"]: i for i, p in enumerate(people)}
    by_item = {}
    for row in rows:
        by_item.setdefault(row["Agenda Item #"], []).append(row)

    votes, skipped = {}, 0
    for item_id, item_rows in by_item.items():
        last = max(item_rows, key=lambda r: r["Date/Time"])  # ties: first of them
        # Same vote = same time, motion, description and result as the latest row.
        key = lambda r: (r["Date/Time"], r["Motion Type"], r["Vote Description"], r["Result"])
        group = [r for r in item_rows if key(r) == key(last)]
        letters = ["-"] * len(people)
        clash = False
        for r in group:
            i = index[person_key(r["First Name"], r["Last Name"])]
            clash = clash or letters[i] != "-"
            letters[i] = VOTE_CODES.get(r["Vote"], "-")
        # Check against the official result, e.g. "Carried, 25-1".
        counts = re.search(r"(\d+)-(\d+)", last["Result"])
        matches = counts and (letters.count("Y"), letters.count("N")) == (int(counts[1]), int(counts[2]))
        if clash or not matches:
            skipped += 1
            continue
        votes[item_id] = "".join(letters)
    return votes, skipped


def build_meetings():
    """Keep only meetings that haven't happened yet, soonest first.
    Also returns the last date in the schedule, so the app can say honestly
    when the published schedule runs out (e.g. between council terms)."""
    rows = get_json(newest_json_file_url(SCHEDULE_DATASET))
    last_scheduled = max(r["Date"] for r in rows)
    today = date.today().isoformat()
    meetings = [
        {
            "dateISO": r["Date"],
            "startTime": r["Start Time"],
            "committee": r["Committee"].strip(),
            "meetingNumber": r["MTG #"],
            "location": r["Location"],
            "url": MEETINGS_URL,
        }
        for r in rows
        if r["Date"] >= today
    ]
    meetings.sort(key=lambda m: (m["dateISO"], m["startTime"]))
    return meetings, last_scheduled


def save(name, payload, folder=None):
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    folder = folder or OUT_DIR
    folder.mkdir(parents=True, exist_ok=True)
    with open(folder / name, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": stamp, **payload}, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    vote_rows = get_json(newest_json_file_url(VOTING_DATASET))
    items = build_items(vote_rows)
    save("open-data-items.json", {"source": "Toronto Open Data: Members of Toronto City Council - Voting Record", "items": items})
    print(f"saved {len(items)} agenda items (newest vote: {items[0]['dateISO']})")

    people = build_councillors(vote_rows)
    votes, skipped = build_votes(vote_rows, people)
    save("votes.json", {
        "source": "Toronto Open Data: Members of Toronto City Council - Voting Record; Elected Officials' Contact Information",
        "councillors": people,
        "votes": votes,
    }, folder=PUBLIC_DATA_DIR)
    unmatched = [p["name"] for p in people if p["ward"] is None]
    print(f"saved votes for {len(votes)} items ({skipped} skipped: counts didn't match the result)")
    print(f"people without a ward match (left unmatched): {', '.join(unmatched)}")

    meetings, last_scheduled = build_meetings()
    save("upcoming-meetings.json", {
        "source": "Toronto Open Data: City Council and Committees Meeting Schedule Reports",
        "lastScheduledDate": last_scheduled,
        "meetings": meetings,
    })
    print(f"saved {len(meetings)} upcoming meetings")
