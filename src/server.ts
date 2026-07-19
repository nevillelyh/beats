import { join } from "node:path";
import {
  addSession,
  createArtist,
  createLick,
  createLicks,
  getProgressDistribution,
  getArtists,
  getStatsHistograms,
  getStatsBars,
  getStats,
  getLickMeta,
  getLicks,
  getSessions,
  getSessionBpmRange,
  initSchema,
  normalizeLocalDate,
  openDb,
  updateArtist,
  updateLick,
} from "./db";

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || "beats.sqlite";

const db = openDb(DATABASE_URL);
try {
  await initSchema(db);
  console.log("Database schema initialized successfully");
} catch (err) {
  console.error("Failed to initialize database schema:", err);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function notFound(message: string): Response {
  return json({ error: message }, 404);
}

function handleDbError(err: unknown, uniqueMsg: string): Response {
  const message = (err as Error).message;
  // postgres unique constraint failure has different error message pattern (typically contains "unique constraint" or similar)
  if (message.includes("unique constraint") || message.includes("UNIQUE constraint failed")) {
    return badRequest(uniqueMsg);
  }
  if (message.includes("not found")) return notFound(message);
  return badRequest(message);
}

function parseRouteId(match: RegExpMatchArray): number {
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Invalid ID");
  return n;
}

function parseOptionalPositiveIntParam(value: string | null, name: string): number | null {
  if (value === null) {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

async function handleApi(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/artists" && req.method === "GET") {
    return json({ data: await getArtists(db) });
  }

  if (url.pathname === "/api/artists" && req.method === "POST") {
    try {
      const body = (await req.json()) as { artistName?: string };
      if (!body.artistName) {
        return badRequest("artistName is required");
      }
      const id = await createArtist(db, body.artistName);
      return json({ id }, 201);
    } catch (err) {
      return handleDbError(err, "Artist already exists");
    }
  }

  const artistMatch = url.pathname.match(/^\/api\/artists\/(\d+)$/);
  if (artistMatch && req.method === "PATCH") {
    try {
      const artistId = parseRouteId(artistMatch);
      const body = (await req.json()) as { artistName?: string };
      if (!body.artistName) {
        return badRequest("artistName is required");
      }
      await updateArtist(db, artistId, body.artistName);
      return json({ ok: true });
    } catch (err) {
      return handleDbError(err, "Artist already exists");
    }
  }

  if (url.pathname === "/api/licks" && req.method === "GET") {
    try {
      const artistId = parseOptionalPositiveIntParam(url.searchParams.get("artist_id"), "artist_id");
      const sortBy = url.searchParams.get("sort_by") || "artist";
      const sortDir = url.searchParams.get("sort_dir") || "asc";
      const localDate = normalizeLocalDate(req.headers.get("x-local-date"));
      const rows = await getLicks(db, artistId, sortBy, sortDir, localDate);
      return json({ data: rows });
    } catch (err) {
      return badRequest((err as Error).message);
    }
  }

  if (url.pathname === "/api/stats" && req.method === "GET") {
    return json({ data: await getStats(db) });
  }

  if (url.pathname === "/api/stats/bars" && req.method === "GET") {
    return json({ data: await getStatsBars(db) });
  }

  if (url.pathname === "/api/stats/histograms" && req.method === "GET") {
    return json({ data: await getStatsHistograms(db) });
  }

  if (url.pathname === "/api/stats/progress" && req.method === "GET") {
    return json({ data: await getProgressDistribution(db) });
  }

  if (url.pathname === "/api/licks" && req.method === "POST") {
    try {
      const body = (await req.json()) as {
        artistName?: string;
        lickName?: string;
        goalBpm?: number;
        url?: string;
        licks?: Array<{
          lickName?: string;
          goalBpm?: number;
          url?: string;
        }>;
      };
      if (!body.artistName) {
        return badRequest("artistName is required");
      }
      if (Array.isArray(body.licks)) {
        if (body.licks.length === 0) {
          return badRequest("At least one lick is required");
        }
        const ids = await createLicks(
          db,
          body.artistName,
          body.licks.map((lick) => ({
            lickName: lick.lickName || "",
            goalBpm: lick.goalBpm ?? 0,
            lickUrl: lick.url,
          })),
        );
        return json({ ids, id: ids[0] }, 201);
      }
      if (!body.lickName || !body.goalBpm) {
        return badRequest("artistName, lickName, and goalBpm are required");
      }
      const id = await createLick(db, body.artistName, body.lickName, body.goalBpm, body.url);
      return json({ id, ids: [id] }, 201);
    } catch (err) {
      return handleDbError(err, "Lick already exists for this artist");
    }
  }

  const lickMatch = url.pathname.match(/^\/api\/licks\/(\d+)$/);
  if (lickMatch && req.method === "PATCH") {
    try {
      const lickId = parseRouteId(lickMatch);
      const body = (await req.json()) as {
        lickName?: string;
        goalBpm?: number;
        url?: string;
      };
      if (!body.lickName || !body.goalBpm) {
        return badRequest("lickName and goalBpm are required");
      }
      await updateLick(db, lickId, body.lickName, body.goalBpm, body.url);
      return json({ ok: true });
    } catch (err) {
      return handleDbError(err, "Lick already exists for this artist");
    }
  }

  const sessionListMatch = url.pathname.match(/^\/api\/licks\/(\d+)\/sessions$/);
  if (sessionListMatch && req.method === "GET") {
    try {
      const lickId = parseRouteId(sessionListMatch);
      const sortBy = url.searchParams.get("sort_by") || "date";
      const sortDir = url.searchParams.get("sort_dir") || "desc";
      const rows = await getSessions(db, lickId, sortBy, sortDir);
      return json({ data: rows });
    } catch (err) {
      return badRequest((err as Error).message);
    }
  }

  if (sessionListMatch && req.method === "POST") {
    try {
      const lickId = parseRouteId(sessionListMatch);
      const body = (await req.json()) as { bpm?: number };
      const bpm = body.bpm;
      if (!Number.isInteger(bpm) || bpm <= 0) {
        return badRequest("bpm must be a positive integer");
      }

      const localDate = normalizeLocalDate(req.headers.get("x-local-date"));
      const meta = await getLickMeta(db, lickId);
      if (!meta) {
        return notFound("Lick not found");
      }

      const best = meta.best_bpm ?? 0;
      if (best >= meta.goal_bpm) {
        return badRequest("Cannot add session when best BPM already meets/exceeds goal");
      }
      const range = getSessionBpmRange(best, meta.goal_bpm);
      if (bpm < range.min || bpm > range.max) {
        return badRequest(`bpm must be between ${range.min} and ${range.max}`);
      }

      const id = await addSession(db, lickId, localDate, bpm);
      return json({ id }, 201);
    } catch (err) {
      return badRequest((err as Error).message);
    }
  }

  return null;
}

async function serveStatic(url: URL): Promise<Response> {
  let target = url.pathname === "/" ? "/index.html" : url.pathname;
  if (target.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  target = target.replace(/^\/+/, "");

  const filePath = join(process.cwd(), "src", "static", target);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  const type = file.type || "application/octet-stream";
  headers.set("content-type", type);
  if (target.endsWith(".js")) {
    headers.set("content-type", "text/javascript; charset=utf-8");
  }
  if (target.endsWith(".css")) {
    headers.set("content-type", "text/css; charset=utf-8");
  }
  return new Response(file, { headers });
}

Bun.serve({
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      const response = await handleApi(req, url);
      return response ?? notFound("Unknown API route");
    }
    return serveStatic(url);
  },
});

console.log(`Beats running on http://localhost:${PORT}`);
console.log(`Using DATABASE_URL=${DATABASE_URL}`);
