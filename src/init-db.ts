import { initSchema, openDb } from "./db";

const path = process.env.DB_PATH || "data/rpms.sqlite";
const db = openDb(path);
initSchema(db);
console.log(`Initialized schema at ${path}`);
