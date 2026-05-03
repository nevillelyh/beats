#!/usr/bin/env python3
"""Import BPM CSV data into SQLite.

Expected columns include Artist, Lick, Goal, and any number of Date N / BPM N pairs.
Derived columns (Best, %, First, Last) are ignored.
"""

from __future__ import annotations

import argparse
import csv
import re
import sqlite3
from datetime import date, datetime
from pathlib import Path

DATE_COL_RE = re.compile(r"^Date\s+(\d+)$")
BPM_COL_RE = re.compile(r"^BPM\s+(\d+)$")
DATE_SHORT_RE = re.compile(r"^D(\d+)$")
BPM_SHORT_RE = re.compile(r"^B(\d+)$")


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS licks (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT,
  goal_bpm INTEGER NOT NULL CHECK(goal_bpm > 0),
  UNIQUE(artist_id, name)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  lick_id INTEGER NOT NULL REFERENCES licks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  bpm INTEGER NOT NULL CHECK(bpm > 0),
  UNIQUE(lick_id, date)
);
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import BPM CSV into SQLite")
    parser.add_argument("--db", required=True, help="SQLite database path")
    parser.add_argument("--csv", required=True, help="CSV file path")
    parser.add_argument(
        "--default-year",
        type=int,
        default=date.today().year,
        help="Year used for MM/DD dates (default: current year)",
    )
    return parser.parse_args()


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


def resolve_pairs(fieldnames: list[str]) -> list[tuple[str, str]]:
    dates: dict[int, str] = {}
    bpm_columns: dict[int, str] = {}
    for name in fieldnames:
        if not name:
            continue
        clean = name.strip()
        m_date = DATE_COL_RE.match(clean)
        if m_date:
            dates[int(m_date.group(1))] = name
            continue
        m_short_date = DATE_SHORT_RE.match(clean)
        if m_short_date:
            dates[int(m_short_date.group(1))] = name
            continue
        m_bpm = BPM_COL_RE.match(clean)
        if m_bpm:
            bpm_columns[int(m_bpm.group(1))] = name
            continue
        m_short_bpm = BPM_SHORT_RE.match(clean)
        if m_short_bpm:
            bpm_columns[int(m_short_bpm.group(1))] = name

    pairs: list[tuple[str, str]] = []
    for i in sorted(set(dates.keys()) & set(bpm_columns.keys())):
        pairs.append((dates[i], bpm_columns[i]))
    return pairs


def normalize_date(raw: str, default_year: int) -> str | None:
    v = raw.strip()
    if not v:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return v
    if re.match(r"^\d{2}/\d{2}$", v):
        month, day = v.split("/")
        try:
            return date(default_year, int(month), int(day)).isoformat()
        except ValueError:
            return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def ensure_artist(conn: sqlite3.Connection, name: str) -> int:
    conn.execute("INSERT OR IGNORE INTO artists(name) VALUES (?)", (name,))
    row = conn.execute("SELECT id FROM artists WHERE name = ?", (name,)).fetchone()
    if row is None:
        raise RuntimeError(f"Failed to resolve artist: {name}")
    return int(row[0])


def ensure_lick(conn: sqlite3.Connection, artist_id: int, name: str, goal: int) -> int:
    existing = conn.execute(
        "SELECT id, goal_bpm FROM licks WHERE artist_id = ? AND name = ?",
        (artist_id, name),
    ).fetchone()
    if existing:
        lick_id = int(existing[0])
        current_goal = int(existing[1])
        if current_goal != goal:
            conn.execute("UPDATE licks SET goal_bpm = ? WHERE id = ?", (goal, lick_id))
        return lick_id

    conn.execute(
        "INSERT INTO licks(artist_id, name, goal_bpm) VALUES (?, ?, ?)",
        (artist_id, name, goal),
    )
    row = conn.execute(
        "SELECT id FROM licks WHERE artist_id = ? AND name = ?",
        (artist_id, name),
    ).fetchone()
    if row is None:
        raise RuntimeError(f"Failed to create lick: {name}")
    return int(row[0])


def import_csv(db_path: Path, csv_path: Path, default_year: int) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    init_schema(conn)

    with csv_path.open("r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise RuntimeError("CSV has no headers")

        pairs = resolve_pairs(reader.fieldnames)
        imported = 0
        skipped = 0

        for row_no, row in enumerate(reader, start=2):
            artist = (row.get("Artist") or "").strip()
            lick = (row.get("Lick") or "").strip()
            goal_raw = (row.get("Goal") or "").strip()

            if not artist or not lick or not goal_raw:
                print(f"row {row_no}: skipped (missing Artist/Lick/Goal)")
                skipped += 1
                continue

            try:
                goal = int(float(goal_raw))
            except ValueError:
                print(f"row {row_no}: skipped (invalid Goal: {goal_raw})")
                skipped += 1
                continue

            if goal <= 0:
                print(f"row {row_no}: skipped (Goal must be > 0)")
                skipped += 1
                continue

            artist_id = ensure_artist(conn, artist)
            lick_id = ensure_lick(conn, artist_id, lick, goal)

            for date_col, bpm_col in pairs:
                date_raw = (row.get(date_col) or "").strip()
                bpm_raw = (row.get(bpm_col) or "").strip()
                if not date_raw and not bpm_raw:
                    continue
                if not date_raw or not bpm_raw:
                    print(f"row {row_no}: warning (partial pair {date_col}/{bpm_col})")
                    continue
                normalized = normalize_date(date_raw, default_year)
                if not normalized:
                    print(f"row {row_no}: warning (invalid date {date_raw})")
                    continue
                try:
                    bpm = int(float(bpm_raw))
                except ValueError:
                    print(f"row {row_no}: warning (invalid bpm {bpm_raw})")
                    continue
                if bpm <= 0:
                    print(f"row {row_no}: warning (bpm must be > 0)")
                    continue

                conn.execute(
                    """
                    INSERT INTO sessions(lick_id, date, bpm)
                    VALUES (?, ?, ?)
                    ON CONFLICT(lick_id, date) DO UPDATE SET bpm = excluded.bpm
                    """,
                    (lick_id, normalized, bpm),
                )
                imported += 1

        conn.commit()
        print(f"imported sessions: {imported}")
        print(f"skipped rows: {skipped}")


if __name__ == "__main__":
    args = parse_args()
    import_csv(Path(args.db), Path(args.csv), args.default_year)
