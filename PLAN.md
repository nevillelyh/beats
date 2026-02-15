# RPMs

A web app for tracking RPMs of music practice sessions.

## Goal

Build a mobile-friendly web app (iOS-inspired UI) for tracking lick progress over time, with local SQLite storage, no auth, typed code, minimal dependencies, no ORM, and a simple test harness.

## Locked Product Decisions

1. Main table rows are **licks** (aggregated from sessions), not sessions.
2. CSV import ignores derived fields (`Best`, `%`, `First`, `Last`) and recomputes them from sessions.
3. Disable add-session when `best >= goal` or when a session already exists for today.
4. "Today" uses the **device local timezone**.
5. Tech stack: **Bun + Lit + custom CSS** (no UI framework dependency).
6. Main table sort defaults to **ascending** for all columns.
7. Main view state is URL-persistent (`artist`, `sort`, `dir`, `progress`).
8. Add a dedicated heatmap page (GitHub-style contribution grid) reachable from the main header.

## Tech Stack

- Runtime/server: Bun (`Bun.serve`)
- Backend language: TypeScript
- DB: SQLite via `bun:sqlite` with raw SQL
- Frontend: Lit + native HTML controls + custom CSS
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
  - `url TEXT NULL` (optional external reference URL)
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
  - Optional: `--default-year YYYY` for `MM/DD` date inputs.
- Supported session column styles:
  - `Date N` / `RPM N`
  - `D1` / `R1` (and higher numbered pairs)
- Date input formats:
  - `YYYY-MM-DD`
  - `MM/DD`
  - `MM/DD/YYYY`
  - `MM/DD/YY`
- Rules:
  - Use `Artist`, `Lick`, `Goal`, and date/RPM pairs.
  - Ignore derived fields: `Best`, `%`, `First`, `Last`.
  - Duplicate `(lick, date)` rows are **upserted** (replace RPM).
  - Skip malformed pairs with warnings; continue import.

## API Interfaces

- `GET /api/artists`
- `POST /api/artists`
  - Body: `{ artistName }`
- `GET /api/licks?artist_id=&sort_by=&sort_dir=`
  - Returns lick rows with aggregates:
    - `lick_url`, `best_rpm`, `pct_of_goal`, `first_date`, `last_date`, `session_count`, `can_add_today`
- `POST /api/licks`
  - Body: `{ artistName, lickName, goalRpm, url? }`
- `GET /api/licks/:lickId/sessions?sort_by=date|rpm&sort_dir=asc|desc`
- `POST /api/licks/:lickId/sessions`
  - Body: `{ rpm }`
  - Client sends `X-Local-Date: YYYY-MM-DD`
  - Reject if today already exists, `best >= goal`, or `rpm` is outside `[min, goal]`
  - `min` is `1` when no previous session exists; otherwise `best + 1`
- `GET /api/heatmap`
  - Returns per-day practice density:
    - `date`, `session_count`

## UI Specification

### Header actions

- If no artist filter is active: show `+ Add Artist`.
- If artist filter is active: show `+ Add Lick`.

### Main table

Columns:

- Artist
- Lick
- Goal (RPM)
- Best (RPM)
- % (`best / goal * 100`, rounded integer)
- # (session count)
- First (date)
- Last (date)

Rules:

- Filter by artist.
- Sort by any column.
- Always show Artist column (even when an artist filter is active).
- For no-session licks: show `-` in Best/%/First/Last.
- If a lick has a URL, clicking the lick name opens it in a new tab.
- Long lick names/URLs wrap in desktop mode so table layout remains stable.
- Goal-hit highlighting:
  - When `Best >= Goal` and `% >= 100`, values are emphasized.
  - Desktop table uses bold green text (no pill/background) to preserve row alignment.
  - Wrapped mobile cards use green pill-style emphasis.
- URL persists view state:
  - `artist` (artist filter)
  - `sort` (sort field)
  - `dir` (sort direction)
  - `progress` (`all|new|progress|done`)

### Progress filter control

Row below artist filter with icon chips and metrics:

- `New` chip: count of licks with `0` sessions.
- `In progress` chip: count of licks with `> 0` sessions and `% < 100`.
- `Done` chip: count of licks with `% = 100`.
- `Average %`: mean `%` across licks with `> 0` sessions.
- Clicking `New`, `In progress`, or `Done` applies that filter.
- Clicking the currently active chip again clears back to `all`.

### Mobile/wrapped row view

On narrow screens, rows render as wrapped cards:

- Top line: artist, lick name, row actions.
- Metrics line: Goal, Best, %.
- Date/session line:
  - Session badge: `# N`
  - Separate stylized `First` and `Last` date pills.
- Sorting in mobile uses horizontal sort chips (instead of dropdowns).

### Row actions

Each lick row has:

- `...` (expand sessions)
  - Disabled when `session_count == 0`
  - Opens modal with sessions (`date`, `rpm`), sortable by either column
  - Default sort: `date desc`

- `+` (add session)
  - Disabled when `best >= goal` or today session exists
  - Opens modal with:
    - Stepper controls: `- [RPM number] +`
  - Range:
    - `min = 1` if no previous session exists, else `best + 1`
    - `max = goal`
    - If `min > max`, disable action
    - `-` and `+` adjust by increments of `5`
    - Default RPM value:
      - if no previous session: `goal / 2`, rounded up to the next multiple of `10` (capped to range)
      - otherwise: next multiple of `5` above `best` (capped to range)
  - Input validation:
    - value must be an integer
    - value must stay within `[min, max]`
  - Submit creates today's session

### Heatmap page

- Main header includes `Heatmap` button next to `RPM Tracker` title.
- `Heatmap` route renders a GitHub-style pixel heatmap using session-count-per-day.
- Axes:
  - X-axis month labels
  - Y-axis weekday labels
- On wide desktop screens, the heatmap card should size to chart content instead of stretching across the full container.

### Add lick

Shown only when artist filter is active. Modal uses currently selected artist and includes:

- Lick name input
- Optional URL input
- Goal RPM stepper: `- [RPM number] +` (increment 5, minimum 1)
- Default Goal RPM is `100` when opening the dialog

### Add artist

Shown only when no artist filter is active:

- Artist name input

## Testing and Acceptance Criteria

1. DB constraints enforce uniqueness and positive RPM/goal.
2. Aggregates are correct for 0/1/N sessions.
3. Add-session disable logic is correct for:
   - `best >= goal`
   - today session already exists
4. Add-session range math is correct (`min = 1` or `best + 1`, bounded by goal), with API-side enforcement.
5. Table sorting/filtering works for all columns.
6. Artist column stays visible when artist filter is active.
7. Progress chip filtering works for `New`, `In progress`, and `Done`, with click-to-clear back to `all`.
8. URL state persists and restores artist/sort/dir/progress.
9. Session modal defaults to date descending and supports sort toggles.
10. CSV importer:
    - ignores derived fields
    - supports `Date N/RPM N` and `Dn/Rn`
    - accepts configured date formats
    - upserts duplicate lick/date
    - logs malformed pairs
11. Device-local date controls "today" behavior.
12. `+ Add Artist` is shown only when no artist filter is active and creates artists.
13. `+ Add Lick` is shown only when artist filter is active and binds to current artist.
14. Optional lick URL is stored and lick name opens URL in a new tab when present.
15. Goal-hit highlighting appears on `Best` and `%` with desktop text-only style and mobile pill style.
16. Docker image builds and app starts on port `3000`.
17. SQLite file persists across restarts when `/data` is mounted.
18. Heatmap page renders a contribution-style grid with month/day axes using `/api/heatmap`.

## Implementation Milestones

1. Project bootstrap (Bun server + Lit app skeleton + DB init).
2. SQL schema + query layer (no ORM).
3. API routes + validation + aggregate queries.
4. Main table UI (fetch, filter, sort).
5. Session modal and add-session modal.
6. Add-lick modal.
7. Mobile wrapped-row layout and chip-based sorting.
8. Progress filter chips + metrics row (`New/In progress/Done` + `Average %`).
9. URL-state persistence in main view.
10. Conditional add flows (`+ Add Artist` / `+ Add Lick`) and dialogs.
11. Optional lick URL data flow (schema, API, add-lick form, link rendering).
12. CSV importer script enhancements.
13. Dockerfile + `.dockerignore` + container run docs.
14. Test suite and edge-case hardening.
15. Heatmap page (`/heatmap.html`) + `GET /api/heatmap` + axis labels.

## Reference Docs

- Bun SQLite: https://bun.sh/docs/runtime/sqlite
- Bun HTTP server: https://bun.sh/docs/runtime/http/server
- Bun tests: https://bun.sh/docs/test/writing-tests
- Lit docs: https://lit.dev/docs/
