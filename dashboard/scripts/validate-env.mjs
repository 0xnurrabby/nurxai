const strict = process.argv.includes("--strict")
  || process.env.VERCEL === "1"
  || process.env.NODE_ENV === "production"
  || process.env.STRICT_ENV_VALIDATION === "true";
const errors = [];
const warnings = [];

function value(name) {
  return process.env[name]?.trim() || "";
}

function requireOne(names, label = names.join(" or ")) {
  if (!names.some((name) => value(name))) errors.push(`Missing ${label}.`);
}

function requireValue(name, minimumLength = 1) {
  if (value(name).length < minimumLength) {
    errors.push(minimumLength > 1 ? `${name} must contain at least ${minimumLength} characters.` : `Missing ${name}.`);
  }
}

function requireUrl(name, protocols = ["https:"]) {
  const raw = value(name);
  if (!raw) return errors.push(`Missing ${name}.`);
  try {
    const url = new URL(raw);
    if (!protocols.includes(url.protocol) || url.pathname !== "/" || url.search || url.hash) throw new Error();
  } catch {
    errors.push(`${name} must be an origin using ${protocols.join(" or ")} with no path, query, or fragment.`);
  }
}

requireOne(["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"], "a PostgreSQL runtime URL");
requireValue("JWT_SECRET", 32);
requireValue("AUTH_RATE_LIMIT_PEPPER", 32);
requireValue("OTP_PEPPER", 32);
requireValue("RESEND_API_KEY");
requireValue("RESEND_FROM_EMAIL");
requireValue("AI_GATEWAY_API_KEY");
requireValue("NEXT_PUBLIC_GOOGLE_CLIENT_ID");
requireUrl("PUBLIC_URL", process.env.NODE_ENV === "production" ? ["https:"] : ["http:", "https:"]);
requireUrl("NEXT_PUBLIC_APP_URL", process.env.NODE_ENV === "production" ? ["https:"] : ["http:", "https:"]);

if (value("NEXT_PUBLIC_GOOGLE_CLIENT_ID") && !value("NEXT_PUBLIC_GOOGLE_CLIENT_ID").endsWith(".apps.googleusercontent.com")) {
  errors.push("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not a Google web client ID.");
}
if (value("PUBLIC_URL") && value("NEXT_PUBLIC_APP_URL")) {
  try {
    if (new URL(value("PUBLIC_URL")).origin !== new URL(value("NEXT_PUBLIC_APP_URL")).origin) {
      errors.push("PUBLIC_URL and NEXT_PUBLIC_APP_URL must use the same origin.");
    }
  } catch {}
}
const directGoogleAuth = value("NEXT_PUBLIC_GOOGLE_DIRECT_AUTH");
if (!new Set(["true", "false"]).has(directGoogleAuth)) {
  errors.push("NEXT_PUBLIC_GOOGLE_DIRECT_AUTH must be true or false.");
}
if (directGoogleAuth === "false") {
  requireUrl("NEXT_PUBLIC_GOOGLE_BRIDGE_ORIGIN");
  requireValue("SESSION_COOKIE_DOMAIN");
  requireValue("GOOGLE_CLIENT_SECRET", 16);
}
const cookieSecure = value("SESSION_COOKIE_SECURE");
if (cookieSecure && !new Set(["true", "false"]).has(cookieSecure)) {
  errors.push("SESSION_COOKIE_SECURE must be true or false.");
}
const cookieDomain = value("SESSION_COOKIE_DOMAIN").replace(/^\./, "").toLowerCase();
if (cookieDomain) {
  const coversDomain = (hostname) => hostname === cookieDomain || hostname.endsWith(`.${cookieDomain}`);
  for (const name of ["PUBLIC_URL", ...(directGoogleAuth === "false" ? ["NEXT_PUBLIC_GOOGLE_BRIDGE_ORIGIN"] : [])]) {
    try {
      if (!coversDomain(new URL(value(name)).hostname.toLowerCase())) {
        errors.push(`SESSION_COOKIE_DOMAIN does not cover ${name}.`);
      }
    } catch {}
  }
}
const legacyFallback = value("LEGACY_AUTH_FALLBACK_ENABLED");
if (legacyFallback && !new Set(["true", "false"]).has(legacyFallback)) {
  errors.push("LEGACY_AUTH_FALLBACK_ENABLED must be true or false.");
}
if (legacyFallback === "true") {
  requireValue("LEGACY_STORE_VERSION");
  const legacyUrl = value("LEGACY_AUTH_CHECK_URL");
  try {
    const authority = new URL(legacyUrl);
    if (authority.protocol !== "https:") throw new Error();
    if (value("PUBLIC_URL") && authority.origin === new URL(value("PUBLIC_URL")).origin) {
      errors.push("LEGACY_AUTH_CHECK_URL cannot point to the current app origin.");
    }
  } catch {
    errors.push("LEGACY_AUTH_CHECK_URL must be a valid HTTPS URL.");
  }

  const parseVersion = (raw) => /^\d+\.\d+\.\d+$/.test(raw) ? raw.split(".").map(Number) : null;
  const minimum = parseVersion(value("MIN_EXTENSION_VERSION"));
  const legacy = parseVersion(value("LEGACY_STORE_VERSION"));
  if (!legacy) errors.push("LEGACY_STORE_VERSION must use major.minor.patch format.");
  if (minimum && legacy) {
    const minimumIsNewer = minimum.some((part, index) =>
      part > legacy[index] && minimum.slice(0, index).every((earlier, earlierIndex) => earlier === legacy[earlierIndex])
    );
    if (minimumIsNewer) errors.push("MIN_EXTENSION_VERSION cannot block LEGACY_STORE_VERSION while legacy fallback is enabled.");
  }
}
if (value("PAYG_X402_ENABLED") === "true") {
  for (const name of ["X402_PAY_TO", "X402_BUILDER_CODE", "CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "BASE_RPC_URL"]) {
    requireValue(name);
  }
  requireValue("PAYG_INTERNAL_SECRET", 32);
}
if (value("NOWPAYMENTS_API_KEY") || value("NOWPAYMENTS_KEY")) {
  requireValue("NOWPAYMENTS_IPN_SECRET", 16);
  requireValue("CRON_SECRET", 32);
}
if (value("BILLING_RECONCILE_SECRET")) requireValue("BILLING_RECONCILE_SECRET", 32);
if (process.env.NODE_ENV === "production" && (value("ENABLE_DEV_GRANT") || value("DEV_ADMIN_KEY"))) {
  warnings.push("Development grant variables are configured in Production; the endpoint remains disabled by NODE_ENV.");
}

if (!strict) {
  if (errors.length) console.log(`Environment validation is non-strict outside Vercel. Missing configuration: ${errors.length}.`);
  for (const warning of warnings) console.warn(`Environment warning: ${warning}`);
  process.exit(0);
}
if (errors.length) {
  console.error("Environment validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
for (const warning of warnings) console.warn(`Environment warning: ${warning}`);
console.log("Environment validation passed.");
