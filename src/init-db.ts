import { initSchema, openDb } from "./db";

const url = process.env.DATABASE_URL || "beats.sqlite";

const db = openDb(url);
try {
  await initSchema(db);
  console.log("Initialized database schema successfully");
} catch (err) {
  console.error("Failed to initialize database schema:", err);
  process.exit(1);
} finally {
  await db.end();
}
