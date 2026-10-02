# Beats

A web app for tracking BPMs of music practice sessions.

## Goal

Build a mobile-friendly web app (iOS-inspired UI) for tracking lick progress over time, with PostgreSQL storage, no auth, typed code, minimal dependencies, no ORM, and a simple test harness.

## Locked Product Decisions

1. Main table rows are **licks** (aggregated from sessions), not sessions.
2. Disable add-session when `best >= goal` unless the lick is starred. Completed starred licks allow reviews at goal BPM only. Saving again today updates the existing session without lowering its BPM.
3. "Today" uses the **device local timezone**.
4. Tech stack: **Bun + Lit + custom CSS** (no UI framework dependency).
5. Table sorting defaults to **artist ascending, then lick ascending**; selecting a new column starts ascending.
6. Licks view state is URL-persistent (`artist`, `sort`, `dir`, `progress`).
7. Use 4 top-level pages: `Today` (`/`), `Licks` (`/licks.html`), `Trends` (`/trends.html`), and `Stats` (`/stats.html`).
8. The shared header keeps the `Beats` title, uses icon tabs for the four pages, and places the in-page metronome control separately at the right edge.

## Tech Stack

- Runtime/server: Bun (`Bun.serve`)
- Backend language: TypeScript
- DB: PostgreSQL via `postgres` client library with raw SQL; SQLite via `bun:sqlite` for local use
- Frontend: Lit + native HTML controls + custom CSS
- Tests: Bun test runner with SQLite by default, optional PostgreSQL via `TEST_DATABASE_URL`, and HTTP integration tests against an isolated in-memory SQLite server
- Containerization: Docker with a production-oriented `Dockerfile` and a local `compose.yaml`

## Dockerfile Requirements

- Add a `Dockerfile` at repo root.
- Use an official Bun base image (`oven/bun`) pinned to a specific major/minor tag.
- Set a working directory (for example `/app`).
- Copy dependency manifests first, install dependencies, then copy source to preserve layer caching.
- Expose port `3000`.
- Define runtime env defaults:
  - `NODE_ENV=production`
  - `PORT=3000`
  - `DATABASE_URL=""`
- Start command should run the Bun server entrypoint in production mode.
- Include a `.dockerignore` file to exclude unnecessary files (`.git`, `node_modules`, temp/build artifacts).

## Data Model

### Tables

- `artists`
  - `id SERIAL PRIMARY KEY`
  - `name TEXT NOT NULL UNIQUE`

- `licks`
  - `id SERIAL PRIMARY KEY`
  - `artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE`
  - `name TEXT NOT NULL`
  - `url TEXT NULL` (optional external reference URL)
  - `goal_bpm INTEGER NOT NULL CHECK(goal_bpm > 0)`
  - `starred BOOLEAN NOT NULL DEFAULT FALSE`
  - `UNIQUE(artist_id, name)`

- `sessions`
  - `id SERIAL PRIMARY KEY`
  - `lick_id INTEGER NOT NULL REFERENCES licks(id) ON DELETE CASCADE`
  - `date TEXT NOT NULL` (`YYYY-MM-DD`, device-local calendar date)
  - `bpm INTEGER NOT NULL CHECK(bpm > 0)`
  - `UNIQUE(lick_id, date)`

Existing SQLite and PostgreSQL databases gain `licks.starred` automatically at startup; migration is safe to repeat and preserves existing data. Reviews are derived from chronological session history, not stored as a flag on the lick or session. A session after a prior completion is a review regardless of current star status. Completion is evaluated against the lick's current goal, as in the existing statistics logic.

### Relationships

- Artist : Lick = 1:N
- Lick : Session = 1:N

---

## API Interfaces

- `GET /api/artists`
- `POST /api/artists`
  - Body: `{ artistName }`
- `PATCH /api/artists/:artistId`
  - Body: `{ artistName }`
  - Updates artist name with the same unique-name constraint as create.
- `GET /api/licks?artist_id=&sort_by=&sort_dir=`
  - Returns lick rows with aggregates:
    - `lick_url`, `starred`, `best_bpm`, `pct_of_goal`, `first_date`, `last_date`, `session_count`, `can_add_today`
- `GET /api/today`
  - Returns up to `50` unique licks: up to `40` unfinished practice licks plus up to `10` starred completed licks for review, sorted by artist then lick after selection.
  - Selection takes up to `10` in-progress licks from each category, discarding duplicates before moving to the next candidate:
    1. Most recent sessions.
    2. Least recent sessions.
    3. Lowest best percentage.
    4. Random licks with exactly one session.
  - If fewer than `40` practice rows were selected, fill the remainder with random unused in-progress licks, then random unstarted licks.
  - Add up to `10` starred completed licks (`best >= goal`), least recently practiced first, with artist/name as the tie-breaker. Reviews do not consume practice slots.
- `POST /api/licks`
  - Body: `{ artistName, lickName, goalBpm, url? }`
- `PATCH /api/licks/:lickId`
  - Body: `{ lickName, goalBpm, url? }`
  - Enforces same per-artist unique lick-name constraint.
  - Enforces `goalBpm >= best_bpm` when previous sessions exist.
- `PATCH /api/licks/:lickId/star`
  - Body: `{ starred: boolean }`
  - Sets or clears the star without changing session history.
- `GET /api/licks/:lickId/sessions?sort_by=date|bpm&sort_dir=asc|desc`
- `POST /api/licks/:lickId/sessions`
  - Body: `{ bpm }`
  - Client sends `X-Local-Date: YYYY-MM-DD`
  - Reject completed unstarred licks; completed starred licks require `bpm == goal`.
  - Unfinished licks retain normal progression rules, whether starred or not: `min` is `1` with no previous session, otherwise `best + 1`; `max` is `goal`.
  - If today's session exists, keep one row and the greater of its existing BPM and the submitted BPM. A same-day completion remains Completion or First+Completion, not Review.
  - The metronome UI has a `30` BPM minimum; database/API positive-BPM constraints remain unchanged.
- `GET /api/stats`
  - Returns per-day practice density:
    - `date`, `session_count`
- `GET /api/stats/bars`
  - Returns stacked-bar data by day:
    - `sessions`: `first_sessions`, `progression_sessions`, `completion_sessions`, `first_completion_sessions`, `review_sessions`
    - `progress`: percentage-change values, excluding reviews
    - `bpm_deltas`: `first_sessions`, `review_sessions`, and absolute-BPM delta bins (`5, 10, 15, ...`), excluding reviews from the bins
      - Deltas chart uses weighted stack heights:
        - `first` contributes `+5` per first session
        - `review` contributes fixed `+5` practice credit per review, not measured BPM improvement
        - each bin contributes `delta_bin * session_count`
- `GET /api/stats/histograms`
  - Returns histogram data:
    - `session_deltas` (absolute BPM deltas, bucketed by 5, excluding reviews)
    - `sessions_to_complete` (completed licks only)
    - `days_to_complete` (completed licks only)
- `GET /api/stats/progress`
  - Returns best-% distribution bins:
    - `bucket_pct` from `0..100` in `10%` steps
    - `lick_count`

## UI Specification

### Header and toolbar actions

- The shared header shows the `Beats` title followed by icon tabs for `Today`, `Licks`, `Trends`, and `Stats`.
- Icons use a checkbox for Today, pick for Licks, calendar for Trends, and chart for Stats.
- The metronome icon is right-aligned and separate from the page-tab group; it opens a popup in the current page.
- Icon-only controls have accessible labels and hover titles, and the current page tab is highlighted.
- The following toolbar controls appear on the Licks page only:
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
  - controls are double-left, single-left, `[BPM input]`, single-right, double-right triangle buttons
  - BPM input accepts keyboard entry and is narrow enough for 3 digits
  - tempo range is `30..300`; completed edits are clamped to that range and truncated to an integer
  - both decrease buttons disable at the minimum and both increase buttons disable at the maximum; state updates after clicks, typing, and keyboard shortcuts
  - clearing the input allows replacement typing; committing an empty input restores the current tempo
  - typed changes update playback immediately without replacing the focused input
  - double-triangle controls adjust by `5`
  - single-triangle controls adjust by `1`
- Keyboard UX while the popup is open:
  - `Space` starts/stops playback
  - `ArrowUp` / `ArrowDown` adjust BPM by `1`
  - `Shift+ArrowUp` / `Shift+ArrowDown` adjust BPM by `5`
  - arrow shortcuts also work inside the BPM input and suppress native number-input stepping
- Top controls use one row with:
  - time signature toggle group: `3/4`, `4/4` (default `4/4`)
  - Rhythm toggle group: `1/4` (default), `1/8`, `1/8T`, `1/16`
- Bottom row:
  - beat dots stay centered and show `4` dots for `4/4`, `3` dots for `3/4`
  - the active beat dot highlights while running
  - start/stop uses media-player icons and is fixed to the right side of the row, independent of dot count
- Sound uses Web Audio blips, with a higher-pitched and louder downbeat.
- Audio starts from direct pointer/touch gestures and explicitly unlocks/resumes Web Audio for mobile Safari compatibility.

### Today page

- `Today` is the default page at `/`.
- It uses the same responsive table, sortable columns, row actions, and dialogs as the Licks page.
- It displays the unique recommendations returned by `GET /api/today`: up to `40` practice licks plus `10` least-recently-practiced starred completed licks, with default artist-then-lick ordering after selection.
- It does not show:
  - Artist filter or artist add/edit controls.
  - New/In progress/Done filters or Average % metric.
  - Add lick button.
  - Lick text filter.

### Licks table

`Licks` is the second page at `/licks.html` and contains the complete lick list.

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
- Artist-specific prefix buttons appear below the text filter:
  - Require a selected artist with at least `25` distinct lick names and at least two prefix groups of `5` or more distinct names each.
  - Use the shortest prefix at a valid word/code boundary, with simple attached numbering removed: `DWPS Alt ...` → `DWPS`, `WW111` → `WW`.
  - Explicit numbering preserves the series code: `MGL1 #11` → `MGL1`. Mixed alphanumeric codes such as `S2E2` remain intact.
  - Strip trailing separator punctuation: `ex <01>`, `ex#1`, and `ex #1` → `ex`.
  - Keep `地獄01` and `地獄の反逆01` in separate groups (`地獄` and `地獄の反逆`).
  - Match case-insensitively using the same prefix extraction for grouping and filtering; do not use unrestricted substring matching.
  - Buttons show the trimmed prefix, with distinct lick count on hover, sorted by prefix.
  - Selection is exclusive; clicking the active button clears it. Combine with text, progress, and session-date filters.
  - Calculate groups before text/progress/date filtering so filtering does not remove buttons or change their counts.
  - Clear selection when the artist changes; remove selections whose group no longer qualifies after a data refresh. Prefix selection is not URL-persistent.
- Sort by any column.
- A calendar button at the end of the table header, aligned with Add Session, cycles through `All` → `Today` → `Past` → `All`.
  - Tooltips are `All`, `Today`, and `Past`; icons are calendar, calendar-check, and calendar-minus respectively.
  - `Today` matches Last equal to today (browser local date); `Past` matches Last not equal to today, including never-practiced licks.
  - Available on both Today and Licks, including compact layout; defaults to `All` and resets on page reload.
  - Each state combines with artist, text, prefix, and New/In progress/Done filters where available and leaves summary metrics unchanged.
  - Highlighted means `Today` or `Past` is selected.
- Always show Artist column (even when an artist filter is active).
- For no-session licks: show `-` in Best/%/First/Last.
- A star toggle precedes the lick name on both desktop and mobile, on Today and Licks. An outlined star is unstarred; a filled gold star is starred. Toggling persists immediately without changing sort order.
- Unstarring disables further sessions for completed licks but preserves all existing reviews.
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
  - Disabled when `best >= goal` and the lick is not starred
  - Opens modal with:
    - Context lines:
      - `Lick: <name>`
      - `Best: <bpm>` (`None` when no prior session exists) and `Goal: <bpm>` on the same line
    - Inline metronome controls, without the standalone metronome title/header
  - Range:
    - Practice tempo can be reduced below the current best
    - Metronome `min = 30`
    - `max = goal`
    - Default BPM value is current best, or half the goal rounded up to the next multiple of `10` when no previous session exists; the tempo control clamps to its range
    - BPM typing and completed-edit normalization match the standalone metronome, with `goal` as the maximum
  - Completed starred licks open a `Review` dialog at goal BPM:
    - All four tempo buttons are disabled, the BPM input is read-only, and tempo keyboard shortcuts cannot change BPM.
    - Playback, time signature, and rhythm controls still work.
    - Save requires exactly goal BPM on both client and server; no new-best requirement applies.
  - Normal-session save validation:
    - value must be an integer
    - value must stay within `[1, goal]`
    - value must be greater than current best when a prior best exists
    - invalid values disable `Save`
    - the `BPM must be greater than current best` alert is hidden on open and only shown after an attempted save
  - Keyboard UX:
    - `Enter` submits the dialog
    - `Esc` closes the dialog
    - inline metronome supports:
      - typing an integer directly into the BPM box
      - `Space` starts/stops playback
      - `ArrowUp` / `ArrowDown` adjust BPM by `1`
      - `Shift+ArrowUp` / `Shift+ArrowDown` adjust BPM by `5`
    - Add Session routes arrow keys to the inline metronome while the dialog is open, even after focus moves elsewhere
    - desktop focuses and selects the BPM input on open; mobile focuses the dialog to avoid opening the virtual keyboard
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

- Global navigation uses the shared `Beats` title and icon controls:
  - `Today` (`/`)
  - `Licks` (`/licks.html`)
  - `Trends` (`/trends.html`)
  - `Stats` (`/stats.html`)
- `Trends` page (`Beats - Trends`) renders:
  - A top streak summary row above the graphs showing current streak and longest streak with compact icons.
    - If there is no session today, current streak shows the run through yesterday instead of resetting to `0`.
  - GitHub-style heatmap with month/day axes
  - `Sessions`: stacked daily bars (`First`, `Progression`, `First+Completion`, `Completion`, `Review`)
    - `First+Completion` is for sessions that are both first and completion.
    - Stack order: `First` (bottom), `Progression`, `Completion`, `First+Completion`, `Review` (top).
    - Completion stays green (`#15803d`); Review is darker green (`#14532d`).
    - Reviews count toward session totals, heatmap density, and streaks, but not progress deltas or completion metrics.
  - `Deltas`: stacked daily bars with `First` at the bottom, then `Review`, then absolute BPM-change bins (`+5`, `+10`, ...)
    - Review is red (`#ef4444`), labeled `Review (+5)`, and excluded from the ordinary delta bins.
    - Legend shows one trailing unit label (`BPM`) instead of repeating units per term
    - Stack segment heights use measured delta bins plus fixed First/Review credit:
      - `First` = `first_sessions * 5`
      - `Review` = `review_sessions * 5` (fixed practice credit)
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
   - `best >= goal`: blocked if unstarred, locked to goal BPM if starred
   - today session updates the existing row instead of being blocked
4. Normal-session range math is correct (`min = 1` or `best + 1`, bounded by goal), with API-side enforcement. Review requests reject BPM below or above goal.
5. Table sorting/filtering works for all columns.
6. Artist column stays visible when artist filter is active.
7. Progress chip filtering works for `New`, `In progress`, and `Done`, with click-to-clear back to `all`.
8. URL state persists and restores artist/sort/dir/progress.
9. Session modal defaults to date descending and supports sort toggles.
10. Data migration:
    - migrates artists, licks, and sessions correctly maintaining IDs.
    - resets serial sequence values.
11. Device-local date controls "today" behavior.
12. Artist toolbar shows edit and add artist controls beside the fixed-width artist dropdown, disabling edit when `All` is selected.
13. Add-lick `+` appears beside the metrics controls, is disabled until an artist is selected, and binds to the current artist.
14. Optional lick URL is stored and lick name opens URL in a new tab when present.
15. Goal-hit highlighting appears on `Best` and `%` with desktop text-only style and mobile pill style.
16. Docker Compose environment starts the Postgres container and web container successfully.
17. Trends page renders current/longest streaks and a contribution-style grid with month/day axes; current streak preserves the run through yesterday when there is no session today.
18. Trends and Stats pages render only their owned graph sections from shared stats APIs.
19. Stats page uses a 2-per-row chart layout on wide screens.
20. Artist edit flow enforces unique artist names.
21. Lick edit flow supports name/URL/goal updates with unique lick-name and min-goal validation.
22. Add-lick flow supports batch creation with repeatable rows and atomic save behavior.
23. Metronome popup is available on Today/Licks/Trends/Stats, supports tempo/time/rhythm controls, highlights beats, plays downbeat-accented blips, supports keyboard shortcuts, and stops when closed.
24. Normal add-session flow embeds the metronome, starts at current best, allows practice tempo below best within the control range, disables save until tempo exceeds best, and stops playback when the dialog closes. Completed starred licks instead use locked goal-BPM reviews.
25. Licks page toolbar groups artist controls and metrics controls into one wrapping row, with the lick text filter on its own full-width row above the table.
26. Today selects up to 10 unique in-progress licks per requested category, fills shortages with unused in-progress then unstarted licks up to 40, then adds up to 10 least-recently-practiced starred completed licks. No duplicates or extra fill rows may exceed the 50-row cap.
27. Today sorts the final populated list by artist then lick and omits all Licks-page filters and artist/lick creation controls.
28. Shared navigation keeps the Beats title, uses accessible page icons in Today/Licks/Trends/Stats order, and right-aligns the separate metronome icon.
29. Prefix groups use distinct lick names, respect the 25/5/two-group thresholds, preserve mixed series codes and Japanese boundaries, and support exclusive toggle selection.
30. The star migration is repeatable on SQLite and PostgreSQL and preserves existing licks and sessions. Star state persists and controls completed-lick session availability.
31. Reviews retain their classification when a lick is unstarred, contribute to session totals and fixed +5 Deltas credit, and do not alter progression or first-completion statistics.
32. Saving again on the completion date preserves the completion classification and highest recorded BPM, with only one session per lick/date.
33. Tempo buttons disable at the 30 BPM minimum and configured maximum after button, text, and keyboard input. Reviews lock all tempo controls while retaining playback controls.

## Implementation Milestones

1. Project bootstrap (Bun server + Lit app skeleton + DB init).
2. PostgreSQL schema + query layer (no ORM).
3. API routes + validation + aggregate queries.
4. Main table UI (fetch, filter, sort).
5. Session modal and add-session modal.
6. Add-licks modal with repeatable rows.
7. Mobile wrapped-row layout and chip-based sorting.
8. Progress filter chips + metrics row (`New/In progress/Done` + `Average %`).
9. URL-state persistence in main view.
10. Toolbar add flows (`+` add artist / `+` add lick) and dialogs.
11. Optional lick URL data flow (schema, API, lick edit form, link rendering).
12. Data migration python script.
13. Dockerfile + compose.yaml + `.dockerignore` + container run docs.
14. Test suite and edge-case hardening.
15. Split analytics UI into `Trends` (`/trends.html`) and `Stats` (`/stats.html`) with shared tab navigation.
16. Dead/duplicate frontend code cleanup (deduped submit/icon/range handlers, consolidated stepper/button helpers and progress predicates, unified repeated stats chart scaffolding, and removed unused stats CSS blocks).
17. Shared metronome popup in top navigation with Web Audio playback, beat visualization, and keyboard controls.
18. Inline add-session metronome with practice tempo controls and save-only new-best validation.
19. Compact tracker navigation and grouped toolbar layout with metronome active-state highlighting.
20. Default Today recommendation page, renamed Licks page, and shared icon navigation with a separately aligned metronome control.
21. Artist-specific prefix filters with exclusive toggle buttons and distinct-name thresholds.
22. Persistent lick stars, goal-BPM reviews, and up to ten additional review recommendations on Today.
23. Review categories in Sessions and Deltas charts, with history preserved after unstarring and same-day completion protection.
24. Metronome tempo-button limit states and 30 BPM minimum.
