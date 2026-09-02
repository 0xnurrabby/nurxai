import { prisma } from "@/lib/db";

let schemaReady: Promise<void> | null = null;
let paygSchemaReady: Promise<void> | null = null;

async function verifyRuntimeSchema() {
  const [schema] = await prisma.$queryRaw<Array<{ missing: string[] }>>`
    WITH required_tables(table_name) AS (
      VALUES
        ('User'),
        ('Payment'),
        ('Subscription'),
        ('Generation'),
        ('Announcement'),
        ('AnnouncementRead'),
        ('ChatMessage'),
        ('SubscriptionGift'),
        ('WalletLedger'),
        ('WithdrawalRequest')
    ),
    required_columns(table_name, column_name, data_type, not_null) AS (
      VALUES
        ('User', 'passwordHash', 'text', false),
        ('User', 'googleId', 'text', false),
        ('User', 'authProvider', 'text', true),
        ('User', 'avatarUrl', 'text', false),
        ('User', 'chatReadAt', 'timestamp(3) without time zone', false),
        ('User', 'referralCode', 'text', false),
        ('User', 'referredById', 'text', false),
        ('User', 'referredAt', 'timestamp(3) without time zone', false),
        ('Payment', 'providerPaymentId', 'text', false),
        ('Payment', 'raw', 'jsonb', false),
        ('Payment', 'lastReconciledAt', 'timestamp(3) without time zone', false),
        ('Subscription', 'dailyLimit', 'integer', false),
        ('Generation', 'usageDetails', 'jsonb', false),
        ('Announcement', 'id', 'text', true),
        ('Announcement', 'title', 'text', false),
        ('Announcement', 'body', 'text', true),
        ('Announcement', 'createdAt', 'timestamp(3) without time zone', true),
        ('Announcement', 'createdBy', 'text', false),
        ('AnnouncementRead', 'id', 'text', true),
        ('AnnouncementRead', 'announcementId', 'text', true),
        ('AnnouncementRead', 'userId', 'text', true),
        ('AnnouncementRead', 'readAt', 'timestamp(3) without time zone', true),
        ('ChatMessage', 'id', 'text', true),
        ('ChatMessage', 'userId', 'text', true),
        ('ChatMessage', 'body', 'text', true),
        ('ChatMessage', 'createdAt', 'timestamp(3) without time zone', true),
        ('SubscriptionGift', 'id', 'text', true),
        ('SubscriptionGift', 'userId', 'text', true),
        ('SubscriptionGift', 'subscriptionId', 'text', true),
        ('SubscriptionGift', 'adminId', 'text', false),
        ('SubscriptionGift', 'days', 'integer', true),
        ('SubscriptionGift', 'note', 'text', false),
        ('SubscriptionGift', 'active', 'boolean', true),
        ('SubscriptionGift', 'createdAt', 'timestamp(3) without time zone', true),
        ('SubscriptionGift', 'updatedAt', 'timestamp(3) without time zone', true),
        ('WalletLedger', 'id', 'text', true),
        ('WalletLedger', 'userId', 'text', true),
        ('WalletLedger', 'amountUSD', 'numeric(65,30)', true),
        ('WalletLedger', 'type', 'text', true),
        ('WalletLedger', 'sourceType', 'text', false),
        ('WalletLedger', 'sourceId', 'text', false),
        ('WalletLedger', 'note', 'text', false),
        ('WalletLedger', 'adminId', 'text', false),
        ('WalletLedger', 'createdAt', 'timestamp(3) without time zone', true),
        ('WithdrawalRequest', 'id', 'text', true),
        ('WithdrawalRequest', 'userId', 'text', true),
        ('WithdrawalRequest', 'amountUSD', 'numeric(65,30)', true),
        ('WithdrawalRequest', 'network', 'text', true),
        ('WithdrawalRequest', 'address', 'text', true),
        ('WithdrawalRequest', 'status', 'text', true),
        ('WithdrawalRequest', 'userNote', 'text', false),
        ('WithdrawalRequest', 'adminNote', 'text', false),
        ('WithdrawalRequest', 'txHash', 'text', false),
        ('WithdrawalRequest', 'paidAt', 'timestamp(3) without time zone', false),
        ('WithdrawalRequest', 'rejectedAt', 'timestamp(3) without time zone', false),
        ('WithdrawalRequest', 'noticeSeenAt', 'timestamp(3) without time zone', false),
        ('WithdrawalRequest', 'noticeClearAt', 'timestamp(3) without time zone', false),
        ('WithdrawalRequest', 'createdAt', 'timestamp(3) without time zone', true),
        ('WithdrawalRequest', 'updatedAt', 'timestamp(3) without time zone', true)
    ),
    required_indexes(table_name, index_name, is_unique, column_names, has_predicate) AS (
      VALUES
        ('User', 'User_googleId_key', true, ARRAY['googleId'], false),
        ('User', 'User_referralCode_key', true, ARRAY['referralCode'], false),
        ('User', 'User_referredById_idx', false, ARRAY['referredById'], false),
        ('Payment', 'Payment_providerPaymentId_idx', false, ARRAY['providerPaymentId'], false),
        ('Payment', 'Payment_provider_status_lastReconciledAt_idx', false, ARRAY['provider', 'status', 'lastReconciledAt'], false),
        ('Announcement', 'Announcement_createdAt_idx', false, ARRAY['createdAt'], false),
        ('AnnouncementRead', 'AnnouncementRead_announcementId_userId_key', true, ARRAY['announcementId', 'userId'], false),
        ('AnnouncementRead', 'AnnouncementRead_userId_readAt_idx', false, ARRAY['userId', 'readAt'], false),
        ('ChatMessage', 'ChatMessage_createdAt_idx', false, ARRAY['createdAt'], false),
        ('ChatMessage', 'ChatMessage_userId_createdAt_idx', false, ARRAY['userId', 'createdAt'], false),
        ('SubscriptionGift', 'SubscriptionGift_userId_createdAt_idx', false, ARRAY['userId', 'createdAt'], false),
        ('SubscriptionGift', 'SubscriptionGift_subscriptionId_idx', false, ARRAY['subscriptionId'], false),
        ('SubscriptionGift', 'SubscriptionGift_active_createdAt_idx', false, ARRAY['active', 'createdAt'], false),
        ('WalletLedger', 'WalletLedger_userId_createdAt_idx', false, ARRAY['userId', 'createdAt'], false),
        ('WalletLedger', 'WalletLedger_type_createdAt_idx', false, ARRAY['type', 'createdAt'], false),
        ('WalletLedger', 'WalletLedger_sourceType_sourceId_key', true, ARRAY['sourceType', 'sourceId'], false),
        ('WithdrawalRequest', 'WithdrawalRequest_userId_createdAt_idx', false, ARRAY['userId', 'createdAt'], false),
        ('WithdrawalRequest', 'WithdrawalRequest_status_createdAt_idx', false, ARRAY['status', 'createdAt'], false),
        ('WithdrawalRequest', 'WithdrawalRequest_noticeClearAt_idx', false, ARRAY['noticeClearAt'], false)
    ),
    required_constraints(table_name, constraint_name, constraint_type) AS (
      VALUES
        ('User', 'User_referredById_fkey', 'f'),
        ('Announcement', 'Announcement_pkey', 'p'),
        ('AnnouncementRead', 'AnnouncementRead_pkey', 'p'),
        ('AnnouncementRead', 'AnnouncementRead_announcementId_fkey', 'f'),
        ('AnnouncementRead', 'AnnouncementRead_userId_fkey', 'f'),
        ('ChatMessage', 'ChatMessage_pkey', 'p'),
        ('ChatMessage', 'ChatMessage_userId_fkey', 'f'),
        ('SubscriptionGift', 'SubscriptionGift_pkey', 'p'),
        ('SubscriptionGift', 'SubscriptionGift_userId_fkey', 'f'),
        ('SubscriptionGift', 'SubscriptionGift_subscriptionId_fkey', 'f'),
        ('WalletLedger', 'WalletLedger_pkey', 'p'),
        ('WalletLedger', 'WalletLedger_userId_fkey', 'f'),
        ('WithdrawalRequest', 'WithdrawalRequest_pkey', 'p'),
        ('WithdrawalRequest', 'WithdrawalRequest_userId_fkey', 'f')
    ),
    missing AS (
      SELECT format('table public.%I', required.table_name) AS object
      FROM required_tables required
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_class table_class
        JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND table_class.relname::text = required.table_name
          AND table_class.relkind IN ('r', 'p')
      )
      UNION ALL
      SELECT format(
        'column public.%I.%I (%s, %s)',
        required.table_name,
        required.column_name,
        required.data_type,
        CASE WHEN required.not_null THEN 'required' ELSE 'nullable' END
      )
      FROM required_columns required
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_attribute attribute
        JOIN pg_class table_class ON table_class.oid = attribute.attrelid
        JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND table_class.relname::text = required.table_name
          AND attribute.attname::text = required.column_name
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND format_type(attribute.atttypid, attribute.atttypmod) = required.data_type
          AND attribute.attnotnull = required.not_null
      )
      UNION ALL
      SELECT format('index public.%I on %I', required.index_name, required.table_name)
      FROM required_indexes required
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_class index_class
        JOIN pg_namespace namespace ON namespace.oid = index_class.relnamespace
        JOIN pg_index index_details ON index_details.indexrelid = index_class.oid
        JOIN pg_class table_class ON table_class.oid = index_details.indrelid
        WHERE namespace.nspname = 'public'
          AND index_class.relname::text = required.index_name
          AND table_class.relname::text = required.table_name
          AND index_details.indisvalid
          AND index_details.indisready
          AND index_details.indisunique = required.is_unique
          AND (index_details.indpred IS NOT NULL) = required.has_predicate
          AND (
            SELECT array_agg(attribute.attname::text ORDER BY key.ordinality)
            FROM unnest(index_details.indkey) WITH ORDINALITY AS key(attnum, ordinality)
            JOIN pg_attribute attribute
              ON attribute.attrelid = table_class.oid
             AND attribute.attnum = key.attnum
          ) = required.column_names
      )
      UNION ALL
      SELECT format('constraint public.%I.%I', required.table_name, required.constraint_name)
      FROM required_constraints required
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_details
        JOIN pg_class table_class ON table_class.oid = constraint_details.conrelid
        JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND table_class.relname::text = required.table_name
          AND constraint_details.conname::text = required.constraint_name
          AND constraint_details.contype = required.constraint_type::"char"
          AND constraint_details.convalidated
      )
    )
    SELECT COALESCE(array_agg(object ORDER BY object), ARRAY[]::text[]) AS missing
    FROM missing
  `;

  if (schema.missing.length > 0) {
    throw new Error(
      `Runtime schema verification failed. Run Prisma migrations before serving requests. Missing or mismatched: ${schema.missing.join(", ")}`
    );
  }
}

async function verifyPaygSchema() {
  const [schema] = await prisma.$queryRaw<Array<{ missing: string[] }>>`
    WITH required_tables(table_name) AS (
      VALUES ('PaygGeneration'), ('PaygPricing')
    ),
    required_columns(table_name, column_name, data_type, not_null) AS (
      VALUES
        ('PaygGeneration', 'id', 'text', true),
        ('PaygGeneration', 'userId', 'text', true),
        ('PaygGeneration', 'requestHash', 'text', true),
        ('PaygGeneration', 'status', 'text', true),
        ('PaygGeneration', 'authorizationId', 'text', false),
        ('PaygGeneration', 'leaseToken', 'text', false),
        ('PaygGeneration', 'leaseExpiresAt', 'timestamp(3) without time zone', false),
        ('PaygGeneration', 'settlementStartBlock', 'bigint', false),
        ('PaygGeneration', 'pricingRevision', 'integer', true),
        ('PaygGeneration', 'quotedRegularPriceUSD', 'numeric(12,6)', true),
        ('PaygGeneration', 'quotedCurrentPriceUSD', 'numeric(12,6)', true),
        ('PaygGeneration', 'quotedAmountAtomic', 'text', true),
        ('PaygGeneration', 'quotedNetwork', 'text', true),
        ('PaygGeneration', 'quotedAsset', 'text', true),
        ('PaygGeneration', 'quotedPayTo', 'text', true),
        ('PaygGeneration', 'payer', 'text', false),
        ('PaygGeneration', 'transactionHash', 'text', false),
        ('PaygGeneration', 'settlement', 'jsonb', false),
        ('PaygGeneration', 'response', 'jsonb', false),
        ('PaygGeneration', 'error', 'text', false),
        ('PaygGeneration', 'createdAt', 'timestamp(3) without time zone', true),
        ('PaygGeneration', 'updatedAt', 'timestamp(3) without time zone', true),
        ('PaygPricing', 'id', 'text', true),
        ('PaygPricing', 'regularPriceUSD', 'numeric(12,6)', true),
        ('PaygPricing', 'currentPriceUSD', 'numeric(12,6)', true),
        ('PaygPricing', 'revision', 'integer', true),
        ('PaygPricing', 'updatedById', 'text', false),
        ('PaygPricing', 'createdAt', 'timestamp(3) without time zone', true),
        ('PaygPricing', 'updatedAt', 'timestamp(3) without time zone', true)
    ),
    required_indexes(table_name, index_name, is_unique, column_names, has_predicate) AS (
      VALUES
        ('PaygGeneration', 'PaygGeneration_transactionHash_key', true, ARRAY['transactionHash'], false),
        ('PaygGeneration', 'PaygGeneration_authorizationId_key', true, ARRAY['authorizationId'], false),
        ('PaygGeneration', 'PaygGeneration_userId_createdAt_idx', false, ARRAY['userId', 'createdAt'], false),
        ('PaygGeneration', 'PaygGeneration_status_updatedAt_idx', false, ARRAY['status', 'updatedAt'], false),
        ('PaygGeneration', 'PaygGeneration_status_leaseExpiresAt_idx', false, ARRAY['status', 'leaseExpiresAt'], false),
        ('PaygGeneration', 'PaygGeneration_activeUser_key', true, ARRAY['userId'], true),
        ('PaygGeneration', 'PaygGeneration_activePayer_key', true, ARRAY['payer'], true)
    ),
    required_constraints(table_name, constraint_name, constraint_type) AS (
      VALUES
        ('PaygGeneration', 'PaygGeneration_pkey', 'p'),
        ('PaygGeneration', 'PaygGeneration_userId_fkey', 'f'),
        ('PaygPricing', 'PaygPricing_pkey', 'p'),
        ('PaygPricing', 'PaygPricing_valid_prices', 'c')
    ),
    missing AS (
      SELECT format('table public.%I', required.table_name) AS object
      FROM required_tables required
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_class table_class
        JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND table_class.relname::text = required.table_name
          AND table_class.relkind IN ('r', 'p')
      )
      UNION ALL
      SELECT format(
        'column public.%I.%I (%s, %s)',
        required.table_name,
        required.column_name,
        required.data_type,
        CASE WHEN required.not_null THEN 'required' ELSE 'nullable' END
      )
      FROM required_columns required
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_attribute attribute
        JOIN pg_class table_class ON table_class.oid = attribute.attrelid
        JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND table_class.relname::text = required.table_name
          AND attribute.attname::text = required.column_name
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND format_type(attribute.atttypid, attribute.atttypmod) = required.data_type
          AND attribute.attnotnull = required.not_null
      )
      UNION ALL
      SELECT format('index public.%I on %I', required.index_name, required.table_name)
      FROM required_indexes required
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_class index_class
        JOIN pg_namespace namespace ON namespace.oid = index_class.relnamespace
        JOIN pg_index index_details ON index_details.indexrelid = index_class.oid
        JOIN pg_class table_class ON table_class.oid = index_details.indrelid
        WHERE namespace.nspname = 'public'
          AND index_class.relname::text = required.index_name
          AND table_class.relname::text = required.table_name
          AND index_details.indisvalid
          AND index_details.indisready
          AND index_details.indisunique = required.is_unique
          AND (index_details.indpred IS NOT NULL) = required.has_predicate
          AND (
            SELECT array_agg(attribute.attname::text ORDER BY key.ordinality)
            FROM unnest(index_details.indkey) WITH ORDINALITY AS key(attnum, ordinality)
            JOIN pg_attribute attribute
              ON attribute.attrelid = table_class.oid
             AND attribute.attnum = key.attnum
          ) = required.column_names
      )
      UNION ALL
      SELECT format('constraint public.%I.%I', required.table_name, required.constraint_name)
      FROM required_constraints required
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_details
        JOIN pg_class table_class ON table_class.oid = constraint_details.conrelid
        JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND table_class.relname::text = required.table_name
          AND constraint_details.conname::text = required.constraint_name
          AND constraint_details.contype = required.constraint_type::"char"
          AND constraint_details.convalidated
      )
    )
    SELECT COALESCE(array_agg(object ORDER BY object), ARRAY[]::text[]) AS missing
    FROM missing
  `;

  if (schema.missing.length > 0) {
    throw new Error(
      `PAYG schema verification failed. Run Prisma migrations before serving requests. Missing or mismatched: ${schema.missing.join(", ")}`
    );
  }

  const [pricing] = await prisma.$queryRaw<Array<{ ready: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM "PaygPricing" WHERE "id" = 'default') AS ready
  `;
  if (!pricing.ready) {
    throw new Error(
      'PAYG schema verification failed. Run Prisma migrations before serving requests. Missing required PaygPricing row "default".'
    );
  }
}

export function ensureRuntimeSchema() {
  schemaReady ??= verifyRuntimeSchema();
  return schemaReady.catch((error) => {
    schemaReady = null;
    throw error;
  });
}

export function ensurePaygSchema() {
  paygSchemaReady ??= verifyPaygSchema();
  return paygSchemaReady.catch((error) => {
    paygSchemaReady = null;
    throw error;
  });
}
