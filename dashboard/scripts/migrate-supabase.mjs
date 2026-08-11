import { PrismaClient } from "@prisma/client";

const sourceUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const sourceKey = process.env.SUPABASE_ANON_KEY;
const targetUrl = process.env.TARGET_DATABASE_URL;

if (!sourceUrl || !sourceKey || !targetUrl) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and TARGET_DATABASE_URL are required.");
}
if (process.env.CONFIRM_DATABASE_RESET !== "yes") {
  throw new Error("Set CONFIRM_DATABASE_RESET=yes to replace all target application data.");
}

const tables = [
  ["User", "user", ["chatReadAt", "referredAt", "createdAt"], []],
  ["Subscription", "subscription", ["startsAt", "endsAt"], []],
  ["UsageLog", "usageLog", [], []],
  ["Payment", "payment", ["createdAt"], ["amount"]],
  ["Project", "project", ["createdAt"], []],
  ["Generation", "generation", ["createdAt"], ["costUSD"]],
  ["AuditLog", "auditLog", ["createdAt"], []],
  ["Announcement", "announcement", ["createdAt"], []],
  ["ChatMessage", "chatMessage", ["createdAt"], []],
  ["ProjectContext", "projectContext", ["createdAt"], []],
  ["SubscriptionGift", "subscriptionGift", ["createdAt", "updatedAt"], []],
  ["AnnouncementRead", "announcementRead", ["readAt"], []],
  ["WalletLedger", "walletLedger", ["createdAt"], ["amountUSD"]],
  [
    "WithdrawalRequest",
    "withdrawalRequest",
    ["paidAt", "rejectedAt", "noticeSeenAt", "noticeClearAt", "createdAt", "updatedAt"],
    ["amountUSD"]
  ]
];

async function fetchTable(table) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(`${sourceUrl}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: sourceKey,
        Authorization: `Bearer ${sourceKey}`,
        Range: `${offset}-${offset + pageSize - 1}`
      }
    });

    if (!response.ok) {
      throw new Error(`Could not export ${table}: HTTP ${response.status}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function normalizeRows(rows, dateFields, decimalFields) {
  return rows.map((row) => {
    const normalized = { ...row };
    for (const field of dateFields) {
      if (normalized[field] != null) normalized[field] = new Date(normalized[field]);
    }
    for (const field of decimalFields) {
      if (normalized[field] != null) normalized[field] = String(normalized[field]);
    }
    return normalized;
  });
}

async function createInBatches(delegate, rows) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    await delegate.createMany({ data: rows.slice(offset, offset + 250) });
  }
}

const exported = new Map();
for (const [table, , dateFields, decimalFields] of tables) {
  const rows = await fetchTable(table);
  exported.set(table, normalizeRows(rows, dateFields, decimalFields));
  console.log(`Exported ${table}: ${rows.length}`);
}

const prisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });

try {
  await prisma.$transaction([
    prisma.withdrawalRequest.deleteMany(),
    prisma.walletLedger.deleteMany(),
    prisma.subscriptionGift.deleteMany(),
    prisma.announcementRead.deleteMany(),
    prisma.chatMessage.deleteMany(),
    prisma.projectContext.deleteMany(),
    prisma.generation.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.usageLog.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.project.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany()
  ]);

  for (const [table, delegateName] of tables) {
    const rows = exported.get(table);
    await createInBatches(prisma[delegateName], rows);
    const targetCount = await prisma[delegateName].count();
    if (targetCount !== rows.length) {
      throw new Error(`${table} count mismatch: source=${rows.length}, target=${targetCount}`);
    }
    console.log(`Verified ${table}: ${targetCount}`);
  }

  await prisma.$executeRawUnsafe('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated');
  await prisma.$executeRawUnsafe('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated');
  await prisma.$executeRawUnsafe(
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated'
  );
  await prisma.$executeRawUnsafe(
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated'
  );
  console.log("Migration completed and public database roles were revoked.");
} finally {
  await prisma.$disconnect();
}
