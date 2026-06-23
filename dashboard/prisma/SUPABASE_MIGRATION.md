# Supabase migration notes

NurXai uses Prisma with PostgreSQL, so Supabase works through `DATABASE_URL`.

## Fresh Supabase schema

Use this when you do not need the old Neon rows:

```powershell
cd dashboard
$env:DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require"
npx prisma migrate deploy
npx prisma generate
```

If the direct DB host is IPv6-only from your machine or deploy host, use the
Supabase pooler connection string from Project Settings > Database:

```env
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

## Copy existing Neon data

Install PostgreSQL client tools (`pg_dump` and `psql`), then run:

```powershell
$env:NEON_DATABASE_URL="postgresql://..."
$env:SUPABASE_DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require"

pg_dump "$env:NEON_DATABASE_URL" --format=custom --no-owner --no-acl --file nurxai-neon.dump
psql "$env:SUPABASE_DATABASE_URL" -c 'CREATE SCHEMA IF NOT EXISTS public;'
pg_restore --dbname "$env:SUPABASE_DATABASE_URL" --clean --if-exists --no-owner --no-acl nurxai-neon.dump

cd dashboard
$env:DATABASE_URL=$env:SUPABASE_DATABASE_URL
npx prisma migrate deploy
npx prisma generate
```

After migration, compare counts in both databases:

```sql
select 'User' as table, count(*) from "User"
union all select 'Subscription', count(*) from "Subscription"
union all select 'Payment', count(*) from "Payment"
union all select 'UsageLog', count(*) from "UsageLog"
union all select 'Project', count(*) from "Project"
union all select 'ProjectContext', count(*) from "ProjectContext"
union all select 'Generation', count(*) from "Generation"
union all select 'AuditLog', count(*) from "AuditLog";
```
