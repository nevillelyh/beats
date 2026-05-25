import { initSchema, openDb } from "./db";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const db = openDb(url);
try {
  await initSchema(db);
  console.log("Initialized PostgreSQL schema successfully");
} catch (err) {
  console.error("Failed to initialize database schema:", err);
  process.exit(1);
} finally {
  await db.end();
}
