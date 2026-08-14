#!/usr/bin/env python3
"""Import the live tasks.json into the Supabase `tasks` table.

Idempotent: upserts on the task id, so re-running syncs rather than duplicating.
Reads the anon key from ~/.ascend-taskmanager-creds (never hardcoded here).

    python3 scripts/import_tasks.py [path/to/tasks.json]

Defaults to live/tasks.snapshot.json. Pass --live to pull straight from
https://ascend.help/protocols/taskmanager/tasks.json instead.
"""
import json
import os
import pathlib
import sys
import urllib.request

PROJECT = "xfxitjrubczqfnsslzuq"
REST = f"https://{PROJECT}.supabase.co/rest/v1/tasks"
LIVE_URL = "https://ascend.help/protocols/taskmanager/tasks.json"
REPO = pathlib.Path(__file__).resolve().parent.parent

# Columns the table actually has. Anything else in the JSON is reported and
# dropped rather than silently discarded, so a new upstream field is noticed.
COLUMNS = {
    "id", "title", "status", "priority", "assigned_to", "assigned_to_raw",
    "created_by", "created_by_raw", "family", "function", "due_date",
    "overview", "next_step", "context", "date_added", "_note", "created_at",
    "notes", "custom", "open_items", "deals",
    "co_owner", "recurrence", "recurrence_parent_id", "quadrant",
}
JSON_COLS = {"notes", "custom", "open_items", "deals"}
TEXT_DEFAULT_BLANK = {
    "assigned_to", "assigned_to_raw", "family", "function", "overview",
    "next_step", "context", "date_added", "_note", "co_owner", "quadrant",
}

# Seed the Eisenhower quadrant from the existing high/medium/low priority so
# every task starts with a sensible colour instead of 132 uncoloured rows.
# This is a starting point for Andrew to adjust, not a claim about the task.
QUADRANT_FROM_PRIORITY = {"high": "iu", "medium": "inu", "low": "nn"}


def load_creds():
    path = pathlib.Path.home() / ".ascend-taskmanager-creds"
    if not path.exists():
        sys.exit(f"missing {path} — cannot authenticate")
    creds = {}
    for line in path.read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            creds[k.strip()] = v.strip()
    key = creds.get("SUPABASE_ANON_KEY")
    if not key:
        sys.exit("SUPABASE_ANON_KEY not found in ~/.ascend-taskmanager-creds")
    return key


def clean(task):
    """Map one JSON task onto the table's columns."""
    row = {}
    for k, v in task.items():
        if k not in COLUMNS:
            continue
        if k in JSON_COLS:
            row[k] = v if isinstance(v, list) else []
        elif k == "due_date":
            row[k] = v or None          # '' is not a valid date
        elif k == "created_at":
            row[k] = v or None
        elif k in TEXT_DEFAULT_BLANK:
            row[k] = "" if v is None else v
        else:
            row[k] = v
    row.setdefault("status", "open")
    row.setdefault("priority", "medium")
    if not row.get("quadrant"):
        row["quadrant"] = QUADRANT_FROM_PRIORITY.get(row["priority"], "")
    row.setdefault("recurrence", "none")
    return row


def main():
    args = [a for a in sys.argv[1:]]
    if "--live" in args:
        args.remove("--live")
        print(f"fetching {LIVE_URL}")
        with urllib.request.urlopen(LIVE_URL, timeout=30) as r:
            doc = json.load(r)
    else:
        src = pathlib.Path(args[0]) if args else REPO / "live" / "tasks.snapshot.json"
        print(f"reading {src}")
        doc = json.loads(src.read_text())

    tasks = doc["tasks"] if isinstance(doc, dict) else doc
    print(f"{len(tasks)} tasks in source")

    # Report anything upstream has that we would otherwise drop on the floor.
    extra = {k for t in tasks for k in t} - COLUMNS
    if extra:
        print(f"WARNING: dropping unmapped field(s): {sorted(extra)}")

    rows = [clean(t) for t in tasks]

    # PostgREST rejects a bulk insert whose objects have differing key sets
    # ("All object keys must match"), so square every row to the same columns.
    used = sorted({k for r in rows for k in r})
    for r in rows:
        for k in used:
            if k not in r:
                r[k] = [] if k in JSON_COLS else ("" if k in TEXT_DEFAULT_BLANK else None)

    missing_id = [r for r in rows if not r.get("id")]
    if missing_id:
        sys.exit(f"{len(missing_id)} task(s) have no id — refusing to import")

    key = load_creds()
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        REST + "?on_conflict=id",
        data=body,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            # merge-duplicates makes this an upsert: safe to re-run.
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            out = json.load(r)
        print(f"upserted {len(out)} rows")
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()[:1000]}")


if __name__ == "__main__":
    main()
