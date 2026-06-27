import { NextRequest, NextResponse } from "next/server";

const DEFAULT_EXTENSION_UPDATE_URL = "https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb";
const UPDATE_AWARE_EXTENSION_VERSION = "2.0.10";

function parseVersion(value: string) {
  const parts = value
    .trim()
    .split(".")
    .map((part) => {
      const match = part.match(/^\d+/);
      return match ? Number(match[0]) : 0;
    });
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

export function requireSupportedExtensionVersion(req: NextRequest, options: { requireHeader?: boolean } = {}) {
  const requiredVersion = (process.env.MIN_EXTENSION_VERSION || "").trim();
  if (!requiredVersion) return null;

  const currentVersion = (req.headers.get("x-client-version") || "").trim();
  if (!currentVersion && !options.requireHeader) return null;

  if (!currentVersion || compareVersions(currentVersion, requiredVersion) < 0) {
    const updateUrl = process.env.EXTENSION_UPDATE_URL || DEFAULT_EXTENSION_UPDATE_URL;
    const updateAwareClient = !!currentVersion && compareVersions(currentVersion, UPDATE_AWARE_EXTENSION_VERSION) >= 0;

    return NextResponse.json(
      {
        // Builds before 2.0.10 did not know EXTENSION_UPDATE_REQUIRED and
        // rendered unknown errors as "Could not generate suggestions." Keep a
        // legacy-known error for those clients while newer builds still use
        // the 426 status to show the proper update button.
        error: updateAwareClient ? "EXTENSION_UPDATE_REQUIRED" : "NEEDS_RECONNECT",
        code: "EXTENSION_UPDATE_REQUIRED",
        message: `Please update NurAi extension to v${requiredVersion} or newer.`,
        currentVersion: currentVersion || null,
        requiredVersion,
        updateUrl
      },
      { status: 426 }
    );
  }

  return null;
}
