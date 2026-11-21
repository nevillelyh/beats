# Beats

> **Disclaimer:** This repository, including its code and documentation, was
> generated entirely by AI.

Beats is a tracker for music practice sessions with four pages and a shared metronome popup:

- `Today` (`/`)
- `Licks` (`/licks.html`)
- `Trends` (`/trends.html`)
- `Stats` (`/stats.html`)
- `Metronome` popup available from each page

The Licks page also tracks completed lessons. Select an artist, open the add dialog, and choose **Lesson** to enter a name and optional URL. Saving records one completed session for today, with no BPM. Lessons count toward activity and streaks, but are excluded from Today recommendations and tempo statistics.

## Stack

- Bun (TypeScript server + SQLite or PostgreSQL)
- Lit (via CDN) + custom CSS (frontend)

## Local Run

SQLite is the default for local development and tests. Start the server with:

```bash
bun run dev
```

This creates `beats.sqlite` in the project directory. To use PostgreSQL instead, start the database and set its URL:

```bash
docker compose up -d db
DATABASE_URL=postgres://beats:beats@localhost:5432/beats bun run src/server.ts
```

Open `http://localhost:3000` in your browser.

---

## Docker Compose (All-in-One Dev)

To start both the database and the auto-reloading web application server in a single command:

```bash
docker compose up
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

## License

[MIT](LICENSE)
