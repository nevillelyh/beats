# RPMs

An web app for tracking RPMs of music practice sessions.

## Tech Stack

Build a web app with the following requirements, research tech stack options:
* Mobile friendly, minicking native iOS UI
* Simple clean UI with tables, forms, boxes, etc.
* One page app
* No user auth
* Typed languages preferred
* Local SQLite for data storage
* Minimalistic, no heavy frameworks, no ORM, simple test harness

## Data Model

Store data in the following relational models:
* Artist: artist_name string
* Lick: artist (foreign key), lick_name string, goal_rpm int
* Session: lick (foreign key), date, rpm int

Relations:
* Artist:Lick: 1:N mapping
* Lick: session: 1:N mapping
* Each artist_name must be unique
* Each (artist_name, lick_name) must be unique

Also include a Python script that imports CSV directly into SQLite, where the CSV has the following columns:

* Artist
* Lick
* Goal
* Best
* %
* First
* Last
* Date 1
* RPM 1
* Date 2
* RPM 2
* ...

## UI

### Main table

The main UI shows a table with the following columns:

* Artist
* Lick
* Goal (RPM)
* Best (RPM) - best RPM amongst all sessions of the same lick
* % - percentage of best RPM / goal RPM
* First (date) - first date from all sessions of the same lick
* Last (date) - last date from all sessions of the same lick

The table show allow:
* Filtering by artist
* Sort by any of the columns
* If an artist filter is applied, hide the artist column

### Row interactions

At the end of each row, i.e. lick, show a "..." (expand) and a "+" (add) button.

The "..." button:
* Should be grayed out if the lick has 0 sessions
* Otherwise show a pop up of all sessions of the lick, with columns date & RPM, sortable by either column

The "+" button:
* Should be grayed out if the last date of the lick == today, or of best RPM == goal RPM
* Otherwise show a pop up horizontal bar for entering a new RPM, bewteen [min, goal RPM]
* Where min should be > best RPM and rounded to multiples of 5
* The bar should move in increments of 5
* There should be a box for entering exact RPM
* Once submitted, it should create a new session for today

### Adding new rows

At the top of the main UI, there should be a "+" (add) button for adding new licks.

The "+" button shows pop up for adding a new lick, and include:
* Artist combo box, either from existing ones or entering a new one
* Text box for lick
* Goal RPM
