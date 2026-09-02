const DEFAULT_APP_URL = "https://nurxai.xyz";

export function getPublicAppUrl() {
  const raw = process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.origin;
  } catch {
    throw new Error("PUBLIC_URL must be a valid http(s) origin.");
  }
}
