import pg from "pg";
import { pipeline } from "node:stream/promises";
import copyStreams from "pg-copy-streams";

const { from: copyFrom, to: copyTo } = copyStreams;
const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;
const APPLY = process.argv.includes("--apply");

if (!SOURCE_URL || !TARGET_URL) {
  console.error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required.");
  process.exit(1);
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return "invalid-url"; }
}

function ident(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

const src = new pg.Client({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } });
const dst = new pg.Client({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });
await src.connect();
await dst.connect();
console.log(`source host: ${hostOf(SOURCE_URL)}`);
console.log(`target host: ${hostOf(TARGET_URL)}`);
console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

async function tablesOf(client) {
  const result = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
  );
  return result.rows.map((row) => row.tablename);
}

const sourceTables = (await tablesOf(src)).filter((t) => t !== "_prisma_migrations");
const targetTables = new Set((await tablesOf(dst)).filter((t) => t !== "_prisma_migrations"));

const sourceCounts = {};
for (const t of sourceTables) {
  const result = await src.query(`SELECT count(*)::int AS c FROM public.${ident(t)}`);
  sourceCounts[t] = result.rows[0].c;
}
console.log("source counts:");
console.log(JSON.stringify(sourceCounts, null, 2));

const copyable = sourceTables.filter((t) => targetTables.has(t));
const skipped = sourceTables.filter((t) => !targetTables.has(t));
if (skipped.length) console.log("skipped (not on target):", skipped.join(", "));
const untouched = [...targetTables].filter((t) => !sourceTables.includes(t));
if (untouched.length) console.log("left untouched on target (not on source):", untouched.join(", "));

async function columnsOf(client, table) {
  const result = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [table]
  );
  return result.rows.map((row) => row.column_name);
}

const columnPlan = {};
for (const t of copyable) {
  const sourceCols = await columnsOf(src, t);
  const targetSet = new Set(await columnsOf(dst, t));
  const common = sourceCols.filter((c) => targetSet.has(c));
  const dropped = sourceCols.filter((c) => !targetSet.has(c));
  const added = [...targetSet].filter((c) => !sourceCols.includes(c));
  columnPlan[t] = { copiableColumns: common.length, sourceNotOnTarget: dropped, targetOnlyDefaults: added };
}
console.log("column plan:");
console.log(JSON.stringify(columnPlan, null, 2));

if (!APPLY) {
  console.log("dry run complete — no writes performed.");
  await src.end();
  await dst.end();
  process.exit(0);
}

const fks = (await dst.query(
  "SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conrelid::regclass::text, conname"
)).rows;
for (const fk of fks) {
  await dst.query(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT ${ident(fk.conname)}`);
}
console.log(`dropped ${fks.length} foreign key constraints on target`);

for (const t of copyable) {
  await dst.query(`TRUNCATE TABLE public.${ident(t)}`);
}
console.log(`truncated ${copyable.length} target tables`);

for (const t of copyable) {
  const sourceCols = await columnsOf(src, t);
  const targetSet = new Set(await columnsOf(dst, t));
  const columns = sourceCols.filter((c) => targetSet.has(c));
  if (!columns.length) {
    console.log(`skipped ${t} (no shared columns)`);
    continue;
  }
  const colList = columns.map(ident).join(", ");
  const out = src.query(copyTo(`COPY public.${ident(t)} (${colList}) TO STDOUT`));
  const inn = dst.query(copyFrom(`COPY public.${ident(t)} (${colList}) FROM STDIN`));
  await pipeline(out, inn);
  console.log(`copied ${t} (${sourceCounts[t]} rows, ${columns.length} columns)`);
}

let fkFailures = 0;
for (const fk of fks) {
  try {
    await dst.query(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT ${ident(fk.conname)} ${fk.def}`);
  } catch (error) {
    fkFailures += 1;
    console.log(`FK restore failed for ${fk.tbl} ${fk.conname}: ${error.message}`);
  }
}
console.log(fkFailures === 0 ? "all foreign key constraints restored" : `${fkFailures} foreign key constraints failed to restore`);

const targetCounts = {};
let mismatches = 0;
for (const t of copyable) {
  const result = await dst.query(`SELECT count(*)::int AS c FROM public.${ident(t)}`);
  targetCounts[t] = result.rows[0].c;
  if (targetCounts[t] !== sourceCounts[t]) mismatches += 1;
}
console.log("target counts:");
console.log(JSON.stringify(targetCounts, null, 2));
console.log(mismatches === 0 ? "row counts match" : `${mismatches} table(s) have mismatched row counts`);

await src.end();
await dst.end();
if (fkFailures > 0 || mismatches > 0) process.exit(1);
