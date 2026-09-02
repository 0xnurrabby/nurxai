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

if (process.env.VERCEL_ENV === "preview" && process.env.MIGRATE_ON_PREVIEW !== "true") {
  console.log("Skipping Prisma migrations for Preview. Set MIGRATE_ON_PREVIEW=true only with an isolated preview database.");
  process.exit(0);
}

const databaseUrl = process.env.DIRECT_DATABASE_URL
  || sessionPoolUrl()
  || process.env.POSTGRES_URL_NON_POOLING
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_URL
  || process.env.DATABASE_URL;
if (!databaseUrl) {
  if (process.env.SKIP_MIGRATIONS === "true") {
    console.log("Skipping Prisma migrations because SKIP_MIGRATIONS=true.");
    process.exit(0);
  }
  if (
    process.env.VERCEL_ENV === "production"
    || process.env.NODE_ENV === "production"
    || process.env.STRICT_ENV_VALIDATION === "true"
  ) {
    throw new Error("A migration-capable database URL is required for Production.");
  }
  console.log("Skipping Prisma migrations outside Production: no database URL is configured.");
  process.exit(0);
}

const prismaCli = resolve("node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl }
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
