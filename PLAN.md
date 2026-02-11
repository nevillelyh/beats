# RPMs

A web app for tracking RPMs of music practice sessions.

## Goal

Build a one-page, mobile-friendly web app (iOS-inspired UI) for tracking lick progress over time, with local SQLite storage, no auth, typed code, minimal dependencies, no ORM, and a simple test harness.

## Locked Product Decisions

1. Main table rows are **licks** (aggregated from sessions), not sessions.
2. CSV import ignores derived fields (`Best`, `%`, `First`, `Last`) and recomputes them from sessions.
3. Disable add-session when `best >= goal` or when a session already exists for today.
4. "Today" uses the **device local timezone**.
5. Tech stack: **Bun + Lit + Shoelace**.

## Tech Stack

- Runtime/server: Bun (`Bun.serve`)
- Backend language: TypeScript
- DB: SQLite via `bun:sqlite` with raw SQL
- Frontend: Lit + Shoelace (lightweight web components)
- Tests: Bun test runner
- CSV importer: Python CLI script
- Containerization: Docker with a production-oriented `Dockerfile`

## Dockerfile Requirements

- Add a `Dockerfile` at repo root.
- Use an official Bun base image (`oven/bun`) pinned to a specific major/minor tag.
- Set a working directory (for example `/app`).
- Copy dependency manifests first, install dependencies, then copy source to preserve layer caching.
- Expose port `3000`.
- Define runtime env defaults:
  - `NODE_ENV=production`
  - `PORT=3000`
  - `DB_PATH=/data/rpms.sqlite`
- Persist SQLite data in a mounted directory (`/data`) so container restarts do not lose data.
- Start command should run the Bun server entrypoint in production mode.
- Include a `.dockerignore` file to exclude unnecessary files (`.git`, local DB files, `node_modules`, temp/build artifacts).
- Document canonical run command:
  - `docker run -p 3000:3000 -v $(pwd)/data:/data <image>`

## Data Model

### Tables

- `artists`
  - `id INTEGER PRIMARY KEY`
  - `name TEXT NOT NULL UNIQUE`

- `licks`
  - `id INTEGER PRIMARY KEY`
  - `artist_id INTEGER NOT NULL REFERENCES artists(id)`
  - `name TEXT NOT NULL`
  - `goal_rpm INTEGER NOT NULL CHECK(goal_rpm > 0)`
  - `UNIQUE(artist_id, name)`

- `sessions`
  - `id INTEGER PRIMARY KEY`
  - `lick_id INTEGER NOT NULL REFERENCES licks(id)`
  - `date TEXT NOT NULL` (`YYYY-MM-DD`, device-local calendar date)
  - `rpm INTEGER NOT NULL CHECK(rpm > 0)`
  - `UNIQUE(lick_id, date)`

### Relationships

- Artist : Lick = 1:N
- Lick : Session = 1:N

## CSV Import

Provide `scripts/import_csv.py`:

- CLI:
  - `python scripts/import_csv.py --db data/rpms.sqlite --csv input.csv`
- Expected columns:
  - `Artist`, `Lick`, `Goal`, `Best`, `%`, `First`, `Last`, `Date 1`, `RPM 1`, `Date 2`, `RPM 2`, ...
- Rules:
  - Use `Artist`, `Lick`, `Goal`, and `Date N` / `RPM N` pairs.
  - Ignore derived fields: `Best`, `%`, `First`, `Last`.
  - Duplicate `(lick, date)` rows are **upserted** (replace RPM).
  - Skip malformed pairs with warnings; continue import.

## API Interfaces

- `GET /api/artists`
- `GET /api/licks?artist_id=&sort_by=&sort_dir=`
  - Returns lick rows with aggregates:
    - `best_rpm`, `pct_of_goal`, `first_date`, `last_date`, `session_count`, `can_add_today`
- `POST /api/licks`
  - Body: `{ artistName, lickName, goalRpm }`
- `GET /api/licks/:lickId/sessions?sort_by=date|rpm&sort_dir=asc|desc`
- `POST /api/licks/:lickId/sessions`
  - Body: `{ rpm }`
  - Client sends `X-Local-Date: YYYY-MM-DD`
  - Reject if today already exists or `best >= goal`

## UI Specification

### Main table

Columns:

- Artist
- Lick
- Goal (RPM)
- Best (RPM)
- % (`best / goal * 100`, rounded integer)
- First (date)
- Last (date)

Rules:

- Filter by artist.
- Sort by any column.
- Hide Artist column when an artist filter is active.
- For no-session licks: show `-` in Best/%/First/Last.

### Row actions

Each lick row has:

- `...` (expand sessions)
  - Disabled when `session_count == 0`
  - Opens modal with sessions (`date`, `rpm`), sortable by either column

- `+` (add session)
  - Disabled when `best >= goal` or today session exists
  - Opens modal with:
    - Slider (step 5)
    - Numeric input
  - Range:
    - `min = next multiple of 5 strictly greater than best`
    - `max = goal`
    - If `min > max`, disable action
  - Submit creates today's session

### Add lick

Top-level `+` button opens modal with:

- Artist combobox (select existing or enter new)
- Lick name input
- Goal RPM input (integer > 0)

## Testing and Acceptance Criteria

1. DB constraints enforce uniqueness and positive RPM/goal.
2. Aggregates are correct for 0/1/N sessions.
3. Add-session disable logic is correct for:
   - `best >= goal`
   - today session already exists
4. Slider range math is correct (`min` multiple-of-5 strictly above best).
5. Table sorting/filtering works for all columns.
6. Artist filter hides Artist column.
7. CSV importer:
   - ignores derived fields
   - imports date/RPM pairs
   - upserts duplicate lick/date
   - logs malformed pairs
8. Device-local date controls "today" behavior.
9. Docker image builds and app starts on port `3000`.
10. SQLite file persists across restarts when `/data` is mounted.

## Implementation Milestones

1. Project bootstrap (Bun server + Lit app skeleton + DB init).
2. SQL schema + query layer (no ORM).
3. API routes + validation + aggregate queries.
4. Main table UI (fetch, filter, sort).
5. Session modal and add-session modal.
6. Add-lick modal.
7. CSV importer script.
8. Dockerfile + `.dockerignore` + container run docs.
9. Test suite and edge-case hardening.

## Reference Docs

- Bun SQLite: https://bun.sh/docs/runtime/sqlite
- Bun HTTP server: https://bun.sh/docs/runtime/http/server
- Bun tests: https://bun.sh/docs/test/writing-tests
- Lit docs: https://lit.dev/docs/
- Shoelace docs: https://shoelace.style/getting-started/installation
