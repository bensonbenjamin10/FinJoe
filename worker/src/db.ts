import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../shared/schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

// Railway internal URL (*.railway.internal) requires sslmode=disable; pg defaults to SSL and times out otherwise
let connectionString = process.env.DATABASE_URL;
if (connectionString?.includes(".railway.internal") && !connectionString.includes("sslmode=")) {
  connectionString += (connectionString.includes("?") ? "&" : "?") + "sslmode=disable";
}

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 15000,
});
export const db = drizzle({ client: pool, schema });
