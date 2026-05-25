# Beats

Beats is a tracker for music practice sessions with three pages and a shared metronome popup:

- `Beats` (`/`)
- `Trends` (`/trends.html`)
- `Stats` (`/stats.html`)
- `Metronome` popup available from each page

## Stack

- Bun (TypeScript server + PostgreSQL)
- Lit (via CDN) + custom CSS (frontend)
- Python SQLite to Postgres migration script

## Local Run

### 1. Start PostgreSQL Database
Start the database container using Docker Compose:

```bash
docker compose up -d db
```

This starts a Postgres instance at `localhost:5432` with username, password, and database all set to `beats`.

### 2. Start Application Server
Set the `DATABASE_URL` environment variable and start the server:

```bash
DATABASE_URL=postgres://beats:beats@localhost:5432/beats bun run src/server.ts
```

### 3. Open Web UI
Open `http://localhost:3000` in your browser.

---

## Docker Compose (All-in-One Dev)

To start both the database and the auto-reloading web application server in a single command:

```bash
docker compose up
```

---

## Data Migration (SQLite to Postgres)

If you have an existing SQLite database (e.g. `beats.sqlite`), you can migrate it to the new Postgres database:

1. Install `psycopg2-binary`:
   ```bash
   pip install psycopg2-binary
   ```
2. Run the migration script:
   ```bash
   DATABASE_URL=postgres://beats:beats@localhost:5432/beats DB_PATH=beats.sqlite python scripts/migrate_to_postgres.py
   ```

---

## Docker Production

Build image:

```bash
docker build -t beats .
```

Run container:

```bash
docker run -p 3000:3000 -e DATABASE_URL=postgres://user:pass@host:port/db beats
```
