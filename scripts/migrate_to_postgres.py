#!/usr/bin/env python3
"""Migrate Beats SQLite database to PostgreSQL.

Requires psycopg2 or psycopg2-binary to be installed:
    pip install psycopg2-binary
"""

import argparse
import os
import sqlite3
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("Error: psycopg2 is not installed. Please run:\n    pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate Beats SQLite database to PostgreSQL")
    parser.add_argument(
        "--sqlite-db",
        default=os.environ.get("DB_PATH", "data/beats.sqlite"),
        help="Path to SQLite database file (default: env DB_PATH or data/beats.sqlite)"
    )
    parser.add_argument(
        "--postgres-url",
        default=os.environ.get("DATABASE_URL"),
        help="PostgreSQL connection URL (default: env DATABASE_URL)"
    )
    return parser.parse_args()


def migrate():
    args = parse_args()

    sqlite_path = Path(args.sqlite_db)
    if not sqlite_path.exists():
        print(f"Error: SQLite database not found at {sqlite_path}", file=sys.stderr)
        sys.exit(1)

    postgres_url = args.postgres_url
    if not postgres_url:
        print("Error: PostgreSQL connection URL must be specified via --postgres-url or DATABASE_URL env var", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to SQLite database: {sqlite_path}")
    conn_lite = sqlite3.connect(sqlite_path)
    cur_lite = conn_lite.cursor()

    print("Connecting to PostgreSQL database...")
    try:
        conn_pg = psycopg2.connect(postgres_url)
    except Exception as e:
        print(f"Error connecting to PostgreSQL: {e}", file=sys.stderr)
        sys.exit(1)

    cur_pg = conn_pg.cursor()

    try:
        # Migrate artists
        print("Migrating table: artists...")
        cur_lite.execute("SELECT id, name FROM artists")
        artists = cur_lite.fetchall()
        print(f"Found {len(artists)} artists in SQLite.")
        
        for artist_id, name in artists:
            cur_pg.execute(
                """
                INSERT INTO artists (id, name)
                VALUES (%s, %s)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
                """,
                (artist_id, name)
            )

        # Migrate licks
        print("Migrating table: licks...")
        cur_lite.execute("SELECT id, artist_id, name, url, goal_bpm FROM licks")
        licks = cur_lite.fetchall()
        print(f"Found {len(licks)} licks in SQLite.")

        for lick_id, artist_id, name, url, goal_bpm in licks:
            cur_pg.execute(
                """
                INSERT INTO licks (id, artist_id, name, url, goal_bpm)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET 
                    artist_id = EXCLUDED.artist_id,
                    name = EXCLUDED.name,
                    url = EXCLUDED.url,
                    goal_bpm = EXCLUDED.goal_bpm
                """,
                (lick_id, artist_id, name, url, goal_bpm)
            )

        # Migrate sessions
        print("Migrating table: sessions...")
        cur_lite.execute("SELECT id, lick_id, date, bpm FROM sessions")
        sessions = cur_lite.fetchall()
        print(f"Found {len(sessions)} sessions in SQLite.")

        for session_id, lick_id, date_str, bpm in sessions:
            cur_pg.execute(
                """
                INSERT INTO sessions (id, lick_id, date, bpm)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    lick_id = EXCLUDED.lick_id,
                    date = EXCLUDED.date,
                    bpm = EXCLUDED.bpm
                """,
                (session_id, lick_id, date_str, bpm)
            )

        # Commit migrations
        conn_pg.commit()
        print("Data insertion completed and committed successfully.")

        # Reset sequences
        print("Resetting primary key ID sequences...")
        tables = ["artists", "licks", "sessions"]
        for table in tables:
            cur_pg.execute(f"SELECT MAX(id) FROM {table}")
            max_id = cur_pg.fetchone()[0]
            if max_id is not None:
                seq_name = f"{table}_id_seq"
                cur_pg.execute(f"SELECT setval(%s, %s)", (seq_name, max_id))
                print(f"Sequence {seq_name} reset to {max_id}")

        conn_pg.commit()
        print("Sequence reset committed successfully. Migration complete!")

    except Exception as e:
        conn_pg.rollback()
        print(f"Migration failed! Transaction rolled back. Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        cur_lite.close()
        conn_lite.close()
        cur_pg.close()
        conn_pg.close()


if __name__ == "__main__":
    migrate()
