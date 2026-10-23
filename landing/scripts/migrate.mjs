// Applies scripts/waitlist-schema.sql to DATABASE_URL. Safe to run again: every statement is IF NOT EXISTS.
//   vercel env pull .env.local && node --env-file=.env.local scripts/migrate.mjs
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run `vercel env pull .env.local` first.");
const sql = neon(url);
const schema = readFileSync(new URL("./waitlist-schema.sql", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
for (const statement of schema.split(";").map((s) => s.trim()).filter(Boolean)) {
  await sql.query(statement);
}
const [{ count }] = await sql.query("SELECT count(*)::int AS count FROM waitlist");
console.log(`waitlist ready: ${count} rows`);
