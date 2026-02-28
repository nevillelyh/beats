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
8. Use 3 top-level tabs: `Tracker` (`/`), `Trends` (`/trends.html`), and `Stats` (`/stats.html`).

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
- `PATCH /api/artists/:artistId`
  - Body: `{ artistName }`
  - Updates artist name with the same unique-name constraint as create.
- `GET /api/licks?artist_id=&sort_by=&sort_dir=`
  - Returns lick rows with aggregates:
    - `lick_url`, `best_rpm`, `pct_of_goal`, `first_date`, `last_date`, `session_count`, `can_add_today`
- `POST /api/licks`
  - Body: `{ artistName, lickName, goalRpm, url? }`
- `PATCH /api/licks/:lickId`
  - Body: `{ lickName, goalRpm, url? }`
  - Enforces same per-artist unique lick-name constraint.
  - Enforces `goalRpm >= best_rpm` when previous sessions exist.
- `GET /api/licks/:lickId/sessions?sort_by=date|rpm&sort_dir=asc|desc`
- `POST /api/licks/:lickId/sessions`
  - Body: `{ rpm }`
  - Client sends `X-Local-Date: YYYY-MM-DD`
  - Reject if today already exists, `best >= goal`, or `rpm` is outside `[min, goal]`
  - `min` is `1` when no previous session exists; otherwise `best + 1`
- `GET /api/stats`
  - Returns per-day practice density:
    - `date`, `session_count`
- `GET /api/stats/bars`
  - Returns stacked-bar data by day:
    - `sessions`: `first_sessions`, `progression_sessions`, `completion_sessions`
    - `rpms`: `first_sessions` + absolute-RPM delta bins (`5, 10, 15, ...`)
      - Deltas chart uses weighted stack heights:
        - `first` contributes `+5` per first session
        - each bin contributes `delta_bin * session_count`
- `GET /api/stats/histograms`
  - Returns histogram data:
    - `session_deltas` (absolute RPM deltas, bucketed by 5)
    - `sessions_to_completion` (completed licks only)
    - `days_to_completion` (completed licks only)
- `GET /api/stats/progress`
  - Returns best-% distribution bins:
    - `bucket_pct` from `0..100` in `10%` steps
    - `lick_count`

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
- Artist filter default option label is `All`.
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
- `Done` chip: count of licks with `% >= 100`.
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
    - Context lines:
      - `Lick: <name>`
      - `Best: <rpm>` (`None` when no prior session exists)
      - `Goal: <rpm>`
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
  - Keyboard UX:
    - `Enter` submits the dialog
    - `Esc` closes the dialog
    - RPM input supports stepper keys:
      - `ArrowUp` / `+` increase by `5`
      - `ArrowDown` / `-` decrease by `5`
  - Submit creates today's session
- `Edit` icon in row actions (before `...`)
  - Opens `Edit Lick` dialog for selected lick:
    - fields: `Lick`, `URL`, `Goal RPM`
  - Keyboard UX:
    - `Enter` submits the dialog
    - `Esc` closes the dialog
    - Goal RPM input supports stepper keys (`ArrowUp`/`+`, `ArrowDown`/`-`) in steps of `5`
  - Validation:
    - same per-artist unique lick-name constraint
    - minimum goal RPM is prior best session RPM when it exists

### Trends and Stats pages

- Global tab navigation is shown next to the `RPMs` title:
  - `Tracker` (`/`)
  - `Trends` (`/trends.html`)
  - `Stats` (`/stats.html`)
- Main page title is `RPMs - Tracker`.
- `Trends` page (`RPMs - Trends`) renders:
  - GitHub-style heatmap with month/day axes
  - `Sessions`: stacked daily bars (`First`, `Progression`, `First+Completion`, `Completion`)
    - `First+Completion` is for sessions that are both first and completion.
    - Stack order: `First` (bottom), `Progression`, `Completion`, `First+Completion` (top).
  - `Deltas`: stacked daily bars with `First` at the bottom, then absolute RPM-change bins (`+5`, `+10`, ...)
    - Legend shows one trailing unit label (`RPM`) instead of repeating units per bin
    - Stack segment heights are weighted by total RPM change (not raw count):
      - `First` = `first_sessions * 5`
      - each delta bin = `delta_bin * session_count`
  - Sessions/Deltas range controls:
    - horizontal range-button selectors inside both cards
    - options: `1M`, `3M`, `6M`, `1Y`, `2Y`, `YTD`, `All Time` (default `1M`)
    - selectors are synced: changing one applies to both charts
    - x-axis labels include month and day (`M/D`)
  - On wide desktop screens, the heatmap card uses fixed chart-width sizing (not full-width stretch).
  - Heatmap range/viewport behavior:
    - default range is rolling `1Y` (`53` weeks, ending this week) on all viewports
    - range selector is a horizontal button row above the heatmap card (`1Y`, then descending years)
    - selecting a calendar year renders that full year (`Jan 01` to `Dec 31`)
    - mobile allows horizontal scrolling for the heatmap when needed
    - on mobile default (`1Y`) view, initial scroll is right-aligned so newest days are visible
    - desktop heatmap card width is fixed to match the chart-width model used by the bar-chart cards
    - Safari overflow/truncation is avoided by explicit heatmap-width column sizing (no `max-content` growth)
- `Stats` page (`RPMs - Stats`) renders:
  - `Progress`: best-% distribution bars (`0, 10, 20, ... 100`)
  - `Session Deltas` histogram
  - `Sessions To Completion` histogram
  - `Days To Completion` histogram
  - Layout uses 2 graphs per row on wide screens.

### Add lick

Shown only when artist filter is active. Modal uses currently selected artist and includes:

- Lick name input
- Optional URL input
- Goal RPM stepper: `- [RPM number] +` (increment 5, minimum 1)
- Default Goal RPM is `100` when opening the dialog
- Keyboard UX:
  - `Enter` submits the dialog
  - `Esc` closes the dialog
  - Goal RPM input supports stepper keys (`ArrowUp`/`+`, `ArrowDown`/`-`) in steps of `5`

### Add artist

Shown only when no artist filter is active:

- Artist name input
- After create, artist filter automatically switches to the new artist
- Keyboard UX:
  - `Enter` submits the dialog
  - `Esc` closes the dialog

### Edit artist

Shown only when an artist filter is active (icon button next to artist dropdown):

- Edit artist name
- Keyboard UX:
  - `Enter` submits the dialog
  - `Esc` closes the dialog
- Uses same unique-name constraint as artist creation

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
18. Trends page renders a contribution-style grid with month/day axes using `/api/stats`.
19. Trends and Stats pages render only their owned graph sections from shared stats APIs.
20. Stats page uses a 2-per-row chart layout on wide screens.
21. Artist edit flow enforces unique artist names.
22. Lick edit flow supports name/URL/goal updates with unique lick-name and min-goal validation.

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
15. Split analytics UI into `Trends` (`/trends.html`) and `Stats` (`/stats.html`) with shared tab navigation.

## Reference Docs

- Bun SQLite: https://bun.sh/docs/runtime/sqlite
- Bun HTTP server: https://bun.sh/docs/runtime/http/server
- Bun tests: https://bun.sh/docs/test/writing-tests
- Lit docs: https://lit.dev/docs/
