# Ascend Task Manager

The task board and protocol registry served at **https://ascend.help/protocols/**.

## Layout

```
live/index.html   source for /protocols/index.html  — Protocols tab + Tasks tab
live/task.html    source for /protocols/task.html   — single-task detail page
dist/             build output (contains the Supabase key — gitignored)
migrations/       Supabase schema
scripts/build.sh  substitutes the anon key into dist/
scripts/import_tasks.py   loads tasks.json into Supabase (idempotent upsert)
test/tm_test.js   config-consistency tests
```

Build and test:

```bash
bash scripts/build.sh     # writes dist/
node test/tm_test.js      # config consistency
```

`live/` keeps the literal placeholder `__SUPABASE_ANON_KEY__`; `build.sh` swaps in
the real key from `~/.ascend-taskmanager-creds`. **Never commit `dist/`.**

## Storage

Tasks live in Supabase project **ascend-task-manager** (`xfxitjrubczqfnsslzuq`,
us-east-1), table `public.tasks`, 132 rows imported from the old JSON store on
2026-08-14 with no field mismatches.

The previous store — `tasks.json` plus `add-task.php` / `update-task.php` /
`delete-task.php` / `delete-note.php` under `/protocols/taskmanager/` — is
**retained as a fallback**. Every read and write in `TM` tries Supabase first
and drops to PHP on failure, so an outage degrades rather than breaks.

> **The two stores drift.** A write that lands in Supabase is not echoed into
> `tasks.json`. The fallback is an availability measure, not a mirror. If the
> PHP store ever takes writes for a stretch, re-sync with:
> `python3 scripts/import_tasks.py --live`

Notes are a `jsonb` array on the row, so appending or deleting one is a
read-modify-write. Two people editing notes on the same task within the same
second can lose an entry — the PHP store behaved the same way.

## Security — read before exposing this more widely

`index.html` ships the Supabase anon key in client-side JavaScript, and the
table's RLS policy grants `anon` full read/write. That matches how the app works
today rather than improving on it:

- `/protocols/` requires no login.
- `tasks.json` was fetched unauthenticated and is world-readable as deployed.
- "Who am I" is a slug the user picks for themselves and is stored in
  `localStorage` under `taskManagerUser`. It is a display preference used to
  attribute edit-log notes — **it is not authentication.**

So all 132 tasks were already public to anyone with the URL, and moving to
Supabase neither widens nor narrows that. Putting the page behind real auth is
separate, unstarted work; until then, treat everything in here as public.

## Config lives in five places — keep them in step

The client/family roster, type list and owner roster are each declared more
than once:

| List | `live/index.html` | `live/task.html` |
|---|---|---|
| Families | `FAMILY_OPTIONS` | `KV_FAMILY_OPTIONS` |
| Types | `TYPE_OPTIONS` | `KV_FUNCTION_OPTIONS` |
| Owners | `OWNER_SLUGS` / `OWNER_SLUG_TO_NAME` | `KV_OWNER_SLUGS` / `KV_OWNER_NAMES` |

This duplication is exactly why the lists drifted: Newman survived in some
dropdowns after being retired, and Escher Trust / KT Ventures / Katz were
missing from others. `test/tm_test.js` now fails if the copies disagree — run it
after touching any of them. The Add Task modal no longer holds a third copy; it
renders from `TYPE_OPTIONS` / `FAMILY_OPTIONS` / `OWNER_SLUGS` at open time.

Every list is passed through `sortOptions()` / `kvSortOptions()` at render time,
so display order is alphabetical by construction — adding an entry anywhere in
the array keeps the dropdown A→Z. Owners sort by displayed name, not slug
(`cz` shows as "Chris" and files under C).

## Deploying

> **`ascend.help` is NOT on the same box as Athena.** This cost real time, so
> it is worth stating plainly:
>
> | Host | IP | Provider |
> |---|---|---|
> | `ascend.help` | 198.54.114.219 (`server72-1.web-hosting.com`) | **Namecheap** |
> | `interplay.bot`, `sandbox.ascend.help`, `athena.ascend.fo` | 198.12.239.79 | GoDaddy |
>
> The Athena FTP account (`~/.athena-ftp-creds`, `ftp.interplay.bot`) reaches
> the **GoDaddy** box. That account also has a `protocols/` directory — but it
> serves `interplay.bot/protocols/`, a different live product ("Interplay ·
> Protocol Dashboard"). Deploying there succeeds and silently overwrites the
> wrong site. Verified by uploading a probe file: it returned 200 from
> `interplay.bot` and 404 from `ascend.help`.

Credentials: `~/.ascend-help-ftp-creds` (`ftp.ascend.help`, port 21, explicit
FTPS). cPanel user is `ascernhh`; document root is `/home/ascernhh/public_html`.
An FTP account's Directory field must be set to `public_html` — left at the
cPanel default it is jailed to `/home/<user>/<login>`, an empty folder, where
the login succeeds but nothing is visible.

**Use `lftp`, not `curl`** (curl gets spurious 451s from these hosts).

```bash
bash scripts/build.sh
. ~/.ascend-help-ftp-creds
lftp -u "$FTP_USER,$FTP_PASS" "$FTP_HOST" <<'EOF'
set ftp:ssl-force true
set ssl:verify-certificate no
put dist/index.html -o protocols/index.html
put dist/task.html  -o protocols/task.html
EOF
```

`/protocols/` serves **`index.html`** — this `.htaccess` has no
`DirectoryIndex` directive, so Apache's default order applies. There is also a
stale `index.php` (76 KB, unused); leave it alone. Confirm which file is live by
hashing it against the URL rather than assuming.

Always back up server-side first, matching the existing convention:
`mv protocols/index.html protocols/index.html.backup-$(date +%Y%m%d-%H%M%S)`.

Leave `/protocols/taskmanager/` in place — it still hosts the PHP fallback
endpoints, `tasks.json`, `favicon.svg`, `headshots/` and `protocol.html`, all
referenced by absolute path. Its `index.html` is now a redirect to
`/protocols/?tab=tasks` so the duplicate UI is gone without breaking bookmarks.

### Before trusting any deploy target

Upload a uniquely-named probe file and fetch it over HTTPS from the domain you
expect. If it does not come back, you are on the wrong server — no matter how
plausible the directory listing looks. Delete the probe afterwards.

## Background

Two forks of this app were running against one backend: `/protocols/` (older,
no sorting, no filters, no add-task) and `/protocols/taskmanager/` (current).
They were merged into `/protocols/` on 2026-08-14. Andrew Leahy's feedback from
the same day — compliance/HR types, sorted dropdowns, the family roster fixes,
co-owner, recurring tasks, sort on every column, hiding completed tasks by
default, and the importance/urgency colour legend — is implemented in the
merged page.

Two notes on that legend:

- The Eisenhower quadrant is a **separate field from `priority`**. Priority is
  one urgency axis (high/medium/low); the quadrant crosses importance with
  urgency. Andrew asked to *also* colour by the legend, so both are kept. Every
  task's quadrant was seeded from its priority on import (high → important &
  urgent, medium → important not urgent, low → neither) so the colours are
  useful from day one; adjust from there.
- The "neither" quadrant is **black in light mode and slate in dark mode**.
  Pure black is invisible on the dark board, so the legend swatch and the row
  marker both switch together and always agree.
