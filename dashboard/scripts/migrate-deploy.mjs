import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function sessionPoolUrl() {
  for (const candidate of [process.env.POSTGRES_URL, process.env.POSTGRES_PRISMA_URL, process.env.DATABASE_URL]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (!url.hostname.endsWith(".pooler.supabase.com")) continue;
      url.port = "5432";
      url.searchParams.delete("pgbouncer");
      url.searchParams.delete("connection_limit");
      return url.toString();
    } catch {}
  }
  return null;
}

const databaseUrl = sessionPoolUrl() || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("Skipping Prisma migrations: no database URL is configured.");
  process.exit(0);
}

const prismaCli = resolve("node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl }
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
