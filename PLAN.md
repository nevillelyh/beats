# Beats

A web app for tracking BPMs of music practice sessions.

## Goal

Build a mobile-friendly web app (iOS-inspired UI) for tracking lick progress over time, with local SQLite storage, no auth, typed code, minimal dependencies, no ORM, and a simple test harness.

## Locked Product Decisions

1. Main table rows are **licks** (aggregated from sessions), not sessions.
2. CSV import ignores derived fields (`Best`, `%`, `First`, `Last`) and recomputes them from sessions.
3. Disable add-session only when `best >= goal`; if today already exists, saving updates today's session instead.
4. "Today" uses the **device local timezone**.
5. Tech stack: **Bun + Lit + custom CSS** (no UI framework dependency).
6. Main table sort defaults to **ascending** for all columns.
7. Main view state is URL-persistent (`artist`, `sort`, `dir`, `progress`).
8. Use 3 top-level tabs: `Beats` (`/`), `Trends` (`/trends.html`), and `Stats` (`/stats.html`).
9. The shared top navigation includes an in-page metronome popup on all pages.

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
  - `DB_PATH=/data/beats.sqlite`
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
  - `goal_bpm INTEGER NOT NULL CHECK(goal_bpm > 0)`
  - `UNIQUE(artist_id, name)`

- `sessions`
  - `id INTEGER PRIMARY KEY`
  - `lick_id INTEGER NOT NULL REFERENCES licks(id)`
  - `date TEXT NOT NULL` (`YYYY-MM-DD`, device-local calendar date)
  - `bpm INTEGER NOT NULL CHECK(bpm > 0)`
  - `UNIQUE(lick_id, date)`

### Relationships

- Artist : Lick = 1:N
- Lick : Session = 1:N

## CSV Import

Provide `scripts/import_csv.py`:

- CLI:
  - `python scripts/import_csv.py --db data/beats.sqlite --csv input.csv`
  - Optional: `--default-year YYYY` for `MM/DD` date inputs.
- Supported session column styles:
  - `Date N` / `BPM N`
  - `D1` / `B1` (and higher numbered pairs)
- Date input formats:
  - `YYYY-MM-DD`
  - `MM/DD`
  - `MM/DD/YYYY`
  - `MM/DD/YY`
- Rules:
  - Use `Artist`, `Lick`, `Goal`, and date/BPM pairs.
  - Ignore derived fields: `Best`, `%`, `First`, `Last`.
  - Duplicate `(lick, date)` rows are **upserted** (replace BPM).
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
    - `lick_url`, `best_bpm`, `pct_of_goal`, `first_date`, `last_date`, `session_count`, `can_add_today`
- `POST /api/licks`
  - Body: `{ artistName, lickName, goalBpm, url? }`
- `PATCH /api/licks/:lickId`
  - Body: `{ lickName, goalBpm, url? }`
  - Enforces same per-artist unique lick-name constraint.
  - Enforces `goalBpm >= best_bpm` when previous sessions exist.
- `GET /api/licks/:lickId/sessions?sort_by=date|bpm&sort_dir=asc|desc`
- `POST /api/licks/:lickId/sessions`
  - Body: `{ bpm }`
  - Client sends `X-Local-Date: YYYY-MM-DD`
  - Reject if `best >= goal` or `bpm` is outside `[min, goal]`
  - If a session already exists for today, overwrite that day's BPM instead of creating a second row
  - `min` is `1` when no previous session exists; otherwise `best + 1`
- `GET /api/stats`
  - Returns per-day practice density:
    - `date`, `session_count`
- `GET /api/stats/bars`
  - Returns stacked-bar data by day:
    - `sessions`: `first_sessions`, `progression_sessions`, `completion_sessions`
    - `bpm_deltas`: `first_sessions` + absolute-BPM delta bins (`5, 10, 15, ...`)
      - Deltas chart uses weighted stack heights:
        - `first` contributes `+5` per first session
        - each bin contributes `delta_bin * session_count`
- `GET /api/stats/histograms`
  - Returns histogram data:
    - `session_deltas` (absolute BPM deltas, bucketed by 5)
    - `sessions_to_complete` (completed licks only)
    - `days_to_complete` (completed licks only)
- `GET /api/stats/progress`
  - Returns best-% distribution bins:
    - `bucket_pct` from `0..100` in `10%` steps
    - `lick_count`

## UI Specification

### Header and toolbar actions

- Top navigation includes `Beats`, `Trends`, `Stats`, and `Metronome`; it opens a popup in the current page.
- Do not show a standalone `Beats` title before the top navigation.
- Highlight the `Metronome` button while its popup is open.
- Main toolbar first row has two grouped control blocks that can wrap as whole groups on mobile:
  - Artist block: `Artist` label, fixed-width artist dropdown, always-visible edit artist button, and `+` add artist button.
  - Metrics block: `New`, `In progress`, `Done`, `Average %`, and `+` add lick button.
- Disable edit artist and add lick when the artist dropdown is `All`.
- Lick text filter is on its own row below the toolbar groups and fills the available row width.

### Metronome popup

- Available from every top-level page.
- Opens as an in-page dialog and stops playback when closed.
- Default tempo is `120` BPM.
- Tempo row:
  - controls are double-left, single-left, `[BPM display]`, single-right, double-right triangle buttons
  - BPM display is read-only and narrow enough for 3 digits
  - double-triangle controls adjust by `5`
  - single-triangle controls adjust by `1`
- Keyboard UX while the popup is open:
  - `Space` starts/stops playback
  - `ArrowUp` / `ArrowDown` adjust BPM by `1`
  - `Shift+ArrowUp` / `Shift+ArrowDown` adjust BPM by `5`
- Top controls use one row with:
  - time signature toggle group: `3/4`, `4/4` (default `4/4`)
  - Rhythm toggle group: `1/4` (default), `1/8`, `1/8T`, `1/16`
- Bottom row:
  - beat dots stay centered and show `4` dots for `4/4`, `3` dots for `3/4`
  - the active beat dot highlights while running
  - start/stop uses media-player icons and is fixed to the right side of the row, independent of dot count
- Sound uses Web Audio blips, with a higher-pitched and louder downbeat.
- Audio starts from direct pointer/touch gestures and explicitly unlocks/resumes Web Audio for mobile Safari compatibility.

### Main table

Columns:

- Artist
- Lick
- Goal (BPM)
- Best (BPM)
- % (`best / goal * 100`, rounded integer)
- # (session count)
- First (date)
- Last (date)

Rules:

- Filter by artist.
- Artist filter default option label is `All`.
- Client-side lick text filter:
  - Text input in its own row between the toolbar controls and licks table.
  - Fills the available row width on mobile.
  - Filters by lick name or artist name (case-insensitive).
  - Keyboard shortcuts:
    - `Cmd/Ctrl+F` focuses and selects the filter input.
    - `Esc` clears the filter and blurs the input.
- Sort by any column.
- Always show Artist column (even when an artist filter is active).
- For no-session licks: show `-` in Best/%/First/Last.
- If a lick has a URL, clicking the lick name opens it in a new tab.
- Long lick names/URLs wrap in desktop mode so table layout remains stable.
- Goal-hit highlighting:
  - When `Best >= Goal` and `% >= 100`, values are emphasized.
  - Desktop table uses bold green text (no pill/background) to preserve row alignment.
  - Wrapped mobile cards use green pill-style emphasis.
- Desktop numeric alignment:
  - `Goal`, `Best`, `%`, and `#` columns are right-aligned.
  - Header sort controls retain bubble styling and reserve arrow space.
  - `%` column uses slightly reduced right cell padding versus other numeric columns.
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
  - Opens modal with sessions (`date`, `bpm`), sortable by either column
  - Default sort: `date desc`
  - `Esc` closes the sessions modal

- `+` (add session)
  - Disabled when `best >= goal`
  - Opens modal with:
    - Context lines:
      - `Lick: <name>`
      - `Best: <bpm>` (`None` when no prior session exists) and `Goal: <bpm>` on the same line
    - Inline metronome controls, without the standalone metronome title/header
  - Range:
    - Practice tempo can be reduced below the current best
    - `min = 1`
    - `max = goal`
    - Default BPM value is current best, or `1` when no previous session exists
  - Save validation:
    - value must be an integer
    - value must stay within `[1, goal]`
    - value must be greater than current best when a prior best exists
    - invalid values disable `Save`
    - the `BPM must be greater than current best` alert is hidden on open and only shown after an attempted save
  - Keyboard UX:
    - `Enter` submits the dialog
    - `Esc` closes the dialog
    - inline metronome supports:
      - `Space` starts/stops playback
      - `ArrowUp` / `ArrowDown` adjust BPM by `1`
      - `Shift+ArrowUp` / `Shift+ArrowDown` adjust BPM by `5`
    - Add Session routes arrow keys to the inline metronome while the dialog is open, even after focus moves elsewhere
  - Closing the dialog stops the inline metronome
  - Submit creates today's session, or updates today's existing session when one is already present
- `Edit` icon in row actions (before `...`)
  - Opens `Edit Lick` dialog for selected lick:
    - fields: `Lick`, `URL`, `Goal BPM`
  - Keyboard UX:
    - `Enter` submits the dialog
    - `Esc` closes the dialog
    - Goal BPM input supports stepper keys (`ArrowUp`/`+`, `ArrowDown`/`-`) in steps of `5`
  - Focus behavior:
    - desktop focuses the Goal BPM input when the dialog opens
    - mobile does not focus the Goal BPM input on open, to avoid iOS viewport shifts from the virtual keyboard
  - Validation:
    - same per-artist unique lick-name constraint
    - minimum goal BPM is prior best session BPM when it exists
    - goal input accepts any integer value (`step=1`) so existing non-5-multiple goals remain editable

### Trends and Stats pages

- Global tab navigation is shown without a separate page title:
  - `Beats` (`/`)
  - `Trends` (`/trends.html`)
  - `Stats` (`/stats.html`)
- Main page title is `Beats`.
- `Trends` page (`Beats - Trends`) renders:
  - A top streak summary row above the graphs showing current streak and longest streak with compact icons.
    - If there is no session today, current streak shows the run through yesterday instead of resetting to `0`.
  - GitHub-style heatmap with month/day axes
  - `Sessions`: stacked daily bars (`First`, `Progression`, `First+Completion`, `Completion`)
    - `First+Completion` is for sessions that are both first and completion.
    - Stack order: `First` (bottom), `Progression`, `Completion`, `First+Completion` (top).
  - `Deltas`: stacked daily bars with `First` at the bottom, then absolute BPM-change bins (`+5`, `+10`, ...)
    - Legend shows one trailing unit label (`BPM`) instead of repeating units per bin
    - Stack segment heights are weighted by total BPM change (not raw count):
      - `First` = `first_sessions * 5`
      - each delta bin = `delta_bin * session_count`
  - Sessions/Deltas range controls:
    - horizontal range-button selectors inside both cards
    - options: `1M`, `3M`, `6M`, `1Y`, `2Y`, `YTD`, `All Time` (default `1M`)
    - selectors are synced: changing one applies to both charts
    - x-axis labels include month and day (`M/D`)
    - on narrow mobile viewports, each day column must stay clipped to its own grid track so `1M` bars do not widen or overlap neighboring days
  - On wide desktop screens, the heatmap card uses fixed chart-width sizing (not full-width stretch).
  - Heatmap range/viewport behavior:
    - default range is rolling `1Y` (`53` weeks, ending this week) on all viewports
    - range selector is a horizontal button row above the heatmap card (`1Y`, then descending years)
    - selecting a calendar year renders that full year (`Jan 01` to `Dec 31`)
    - mobile allows horizontal scrolling for the heatmap when needed
    - on mobile default (`1Y`) view, initial scroll is right-aligned so newest days are visible
    - desktop heatmap card width is fixed to match the chart-width model used by the bar-chart cards
    - Safari overflow/truncation is avoided by explicit heatmap-width column sizing (no `max-content` growth)
- `Stats` page (`Beats - Stats`) renders:
  - `Progress`: best-% distribution bars (`0, 10, 20, ... 100`)
  - `Session Deltas` histogram
  - `Sessions To Completion` histogram
  - `Days To Completion` histogram
  - Layout uses 2 graphs per row on wide screens.

### Add licks

Opened from the toolbar `+` add lick button when an artist filter is active. Modal uses currently selected artist and includes:

- Repeatable rows with `Lick` and inline `Goal BPM` controls on the same row
- Header-row `+` button to add another row
- Per-row `-` button to delete that row; first row delete stays disabled so at least one row always remains
- No URL input in the add flow
- Default Goal BPM is `120` for each new row
- Keyboard UX:
  - `Enter` adds a new row instead of submitting
  - `Esc` closes the dialog
  - Goal BPM input supports stepper keys (`ArrowUp`/`+`, `ArrowDown`/`-`) in steps of `5`
- Focus behavior:
  - desktop focuses the first Lick input when the dialog opens
  - adding a row focuses the new Lick input
  - mobile does not autofocus dialog inputs to avoid iOS viewport shifts from the virtual keyboard
- Goal BPM input accepts any integer value (`step=1`) while the stepper buttons and keyboard shortcuts still adjust by `5`

### Add artist

Opened from the toolbar `+` add artist button:

- Artist name input
- After create, artist filter automatically switches to the new artist
- Keyboard UX:
  - `Enter` submits the dialog
  - `Esc` closes the dialog

### Edit artist

Edit button is always visible next to the artist dropdown, disabled when `All` is selected:

- Edit artist name
- Keyboard UX:
  - `Enter` submits the dialog
  - `Esc` closes the dialog
- Uses same unique-name constraint as artist creation

## Testing and Acceptance Criteria

1. DB constraints enforce uniqueness and positive BPM/goal.
2. Aggregates are correct for 0/1/N sessions.
3. Add-session behavior is correct for:
   - `best >= goal`
   - today session updates the existing row instead of being blocked
4. Add-session range math is correct (`min = 1` or `best + 1`, bounded by goal), with API-side enforcement.
5. Table sorting/filtering works for all columns.
6. Artist column stays visible when artist filter is active.
7. Progress chip filtering works for `New`, `In progress`, and `Done`, with click-to-clear back to `all`.
8. URL state persists and restores artist/sort/dir/progress.
9. Session modal defaults to date descending and supports sort toggles.
10. CSV importer:
    - ignores derived fields
    - supports `Date N/BPM N` and `Dn/Bn`
    - accepts configured date formats
    - upserts duplicate lick/date
    - logs malformed pairs
11. Device-local date controls "today" behavior.
12. Artist toolbar shows edit and add artist controls beside the fixed-width artist dropdown, disabling edit when `All` is selected.
13. Add-lick `+` appears beside the metrics controls, is disabled until an artist is selected, and binds to the current artist.
14. Optional lick URL is stored and lick name opens URL in a new tab when present.
15. Goal-hit highlighting appears on `Best` and `%` with desktop text-only style and mobile pill style.
16. Docker image builds and app starts on port `3000`.
17. SQLite file persists across restarts when `/data` is mounted.
18. Trends page renders current/longest streaks and a contribution-style grid with month/day axes using `/api/stats`; current streak preserves the run through yesterday when there is no session today.
19. Trends and Stats pages render only their owned graph sections from shared stats APIs.
20. Stats page uses a 2-per-row chart layout on wide screens.
21. Artist edit flow enforces unique artist names.
22. Lick edit flow supports name/URL/goal updates with unique lick-name and min-goal validation.
23. Add-lick flow supports batch creation with repeatable rows and atomic save behavior.
24. Metronome popup is available on Beats/Trends/Stats, supports tempo/time/rhythm controls, highlights beats, highlights its top-nav button while open, plays downbeat-accented blips, supports keyboard shortcuts, and stops when closed.
25. Add-session flow embeds the metronome, starts at current best, allows practice tempo below best, disables save until tempo exceeds best, and stops playback when the dialog closes.
26. Beats page toolbar groups artist controls and metrics controls into one wrapping row, with the lick text filter on its own full-width row above the table.

## Implementation Milestones

1. Project bootstrap (Bun server + Lit app skeleton + DB init).
2. SQL schema + query layer (no ORM).
3. API routes + validation + aggregate queries.
4. Main table UI (fetch, filter, sort).
5. Session modal and add-session modal.
6. Add-licks modal with repeatable rows.
7. Mobile wrapped-row layout and chip-based sorting.
8. Progress filter chips + metrics row (`New/In progress/Done` + `Average %`).
9. URL-state persistence in main view.
10. Toolbar add flows (`+` add artist / `+` add lick) and dialogs.
11. Optional lick URL data flow (schema, API, lick edit form, link rendering).
12. CSV importer script enhancements.
13. Dockerfile + `.dockerignore` + container run docs.
14. Test suite and edge-case hardening.
15. Split analytics UI into `Trends` (`/trends.html`) and `Stats` (`/stats.html`) with shared tab navigation.
16. Dead/duplicate frontend code cleanup (deduped submit/icon/range handlers, consolidated stepper/button helpers and progress predicates, unified repeated stats chart scaffolding, and removed unused stats CSS blocks).
17. Shared metronome popup in top navigation with Web Audio playback, beat visualization, and keyboard controls.
18. Inline add-session metronome with practice tempo controls and save-only new-best validation.
19. Compact tracker navigation and grouped toolbar layout with metronome active-state highlighting.

## Reference Docs

- Bun SQLite: https://bun.sh/docs/runtime/sqlite
- Bun HTTP server: https://bun.sh/docs/runtime/http/server
- Bun tests: https://bun.sh/docs/test/writing-tests
- Lit docs: https://lit.dev/docs/
