# RPM Tracker

Single-page RPM tracker for music practice sessions.

## Stack

- Bun (TypeScript server + SQLite)
- Lit + Shoelace (frontend)
- Python CSV importer

## Local Run

1. Install Bun.
2. Start server:

```bash
bun run src/server.ts
```

3. Open `http://localhost:3000`.

Default DB path: `data/rpms.sqlite`.

## CSV Import

```bash
python3 scripts/import_csv.py --db data/rpms.sqlite --csv path/to/input.csv
```

## Docker

Build image:

```bash
docker build -t rpms .
```

Run with persistent SQLite data:

```bash
docker run -p 3000:3000 -v $(pwd)/data:/data rpms
```

Container defaults:

- `PORT=3000`
- `DB_PATH=/data/rpms.sqlite`
