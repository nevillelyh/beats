import { join } from "node:path";
import {
  addSession,
  createArtist,
  createLick,
  getArtists,
  getHeatmap,
  getLickMeta,
  getLicks,
  getSessions,
  getSessionRpmRange,
  hasSessionForDate,
  initSchema,
  normalizeLocalDate,
  openDb,
} from "./db";

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || "data/rpms.sqlite";

const db = openDb(DB_PATH);
initSchema(db);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function parseIntParam(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new Error("Expected integer parameter");
  }
  return n;
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function notFound(message: string): Response {
  return json({ error: message }, 404);
}

async function handleApi(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/artists" && req.method === "GET") {
    return json({ data: getArtists(db) });
  }

  if (url.pathname === "/api/artists" && req.method === "POST") {
    try {
      const body = (await req.json()) as { artistName?: string };
      if (!body.artistName) {
        return badRequest("artistName is required");
      }
      const id = createArtist(db, body.artistName);
      return json({ id }, 201);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("UNIQUE constraint failed")) {
        return badRequest("Artist already exists");
      }
      return badRequest(message);
    }
  }

  if (url.pathname === "/api/licks" && req.method === "GET") {
    try {
      const artistId = parseIntParam(url.searchParams.get("artist_id"));
      const sortBy = url.searchParams.get("sort_by") || "artist";
      const sortDir = url.searchParams.get("sort_dir") || "asc";
      const localDate = normalizeLocalDate(req.headers.get("x-local-date"));
      const rows = getLicks(db, artistId, sortBy, sortDir, localDate);
      return json({ data: rows });
    } catch (err) {
      return badRequest((err as Error).message);
    }
  }

  if (url.pathname === "/api/heatmap" && req.method === "GET") {
    return json({ data: getHeatmap(db) });
  }

  if (url.pathname === "/api/licks" && req.method === "POST") {
    try {
      const body = (await req.json()) as {
        artistName?: string;
        lickName?: string;
        goalRpm?: number;
        url?: string;
      };
      if (!body.artistName || !body.lickName || !body.goalRpm) {
        return badRequest("artistName, lickName, and goalRpm are required");
      }
      const id = createLick(db, body.artistName, body.lickName, body.goalRpm, body.url);
      return json({ id }, 201);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("UNIQUE constraint failed")) {
        return badRequest("Lick already exists for this artist");
      }
      return badRequest(message);
    }
  }

  const sessionListMatch = url.pathname.match(/^\/api\/licks\/(\d+)\/sessions$/);
  if (sessionListMatch && req.method === "GET") {
    try {
      const lickId = Number(sessionListMatch[1]);
      const sortBy = url.searchParams.get("sort_by") || "date";
      const sortDir = url.searchParams.get("sort_dir") || "desc";
      const rows = getSessions(db, lickId, sortBy, sortDir);
      return json({ data: rows });
    } catch (err) {
      return badRequest((err as Error).message);
    }
  }

  if (sessionListMatch && req.method === "POST") {
    try {
      const lickId = Number(sessionListMatch[1]);
      const body = (await req.json()) as { rpm?: number };
      const rpm = body.rpm;
      if (!Number.isInteger(rpm) || rpm <= 0) {
        return badRequest("rpm must be a positive integer");
      }

      const localDate = normalizeLocalDate(req.headers.get("x-local-date"));
      const meta = getLickMeta(db, lickId);
      if (!meta) {
        return notFound("Lick not found");
      }

      const best = meta.best_rpm ?? 0;
      if (best >= meta.goal_rpm) {
        return badRequest("Cannot add session when best RPM already meets/exceeds goal");
      }
      if (hasSessionForDate(db, lickId, localDate)) {
        return badRequest("Session already exists for today");
      }
      const range = getSessionRpmRange(best, meta.goal_rpm);
      if (rpm < range.min || rpm > range.max) {
        return badRequest(`rpm must be between ${range.min} and ${range.max}`);
      }

      const id = addSession(db, lickId, localDate, rpm);
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

console.log(`RPM tracker running on http://localhost:${PORT}`);
console.log(`Using DB_PATH=${DB_PATH}`);
