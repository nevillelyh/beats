import { afterAll, beforeAll, expect, test } from "bun:test";
import { resolve } from "node:path";

let server: ReturnType<typeof Bun.spawn>;
let baseUrl: string;

beforeAll(async () => {
  server = Bun.spawn([process.execPath, "run", "src/server.ts"], {
    cwd: resolve(import.meta.dir, ".."),
    env: { ...process.env, PORT: "0", DATABASE_URL: ":memory:" },
    stdout: "pipe",
    stderr: "inherit",
  });
  const reader = (server.stdout as ReadableStream<Uint8Array>).getReader();
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`Server exited before startup: ${output}`);
    output += new TextDecoder().decode(value);
    const match = output.match(/Beats running on (http:\/\/localhost:\d+)/);
    if (match) {
      baseUrl = match[1];
      reader.releaseLock();
      break;
    }
  }
});

afterAll(async () => {
  server?.kill();
  await server?.exited;
});

test("review API enforces goal BPM, preserves same-day completion, and keeps unstarred history", async () => {
  const request = (path: string, method = "GET", body?: unknown, date = "2026-02-10") =>
    fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Local-Date": date },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const created = await request("/licks", "POST", { artistName: "Pat", lickName: "Review", goalBpm: 100 });
  expect(created.status).toBe(201);
  const { id } = await created.json();
  const star = (starred: unknown) => request(`/licks/${id}/star`, "PATCH", { starred });
  const session = (bpm: number, date?: string) => request(`/licks/${id}/sessions`, "POST", { bpm }, date);

  expect((await star("true")).status).toBe(400);
  expect((await star(true)).status).toBe(200);
  expect((await session(80)).status).toBe(201);
  expect((await session(80)).status).toBe(400); // Stars don't relax unfinished practice.
  expect((await session(100, "2026-02-11")).status).toBe(201);
  expect((await session(100, "2026-02-11")).status).toBe(201);
  const sameDay = (await (await request("/stats/bars")).json()).data;
  expect(sameDay.sessions[1]).toMatchObject({ completion_sessions: 1, review_sessions: 0 });

  expect((await session(99, "2026-02-12")).status).toBe(400);
  expect((await session(101, "2026-02-12")).status).toBe(400);
  expect((await session(100, "2026-02-12")).status).toBe(201);
  const bars = (await (await request("/stats/bars")).json()).data;
  expect(bars.sessions[2].review_sessions).toBe(1);
  expect((await (await request("/today")).json()).data.map((lick: { id: number }) => lick.id)).toEqual([id]);

  expect((await star(false)).status).toBe(200);
  expect((await session(100, "2026-02-13")).status).toBe(400);
  expect((await (await request("/today")).json()).data).toEqual([]);
  expect((await (await request("/stats/bars")).json()).data).toEqual(bars);
  expect((await (await request(`/licks/${id}/sessions`)).json()).data).toHaveLength(3);
});
