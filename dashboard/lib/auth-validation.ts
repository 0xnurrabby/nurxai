export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

export function isValidEmail(email: string) {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: unknown): password is string {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) return false;
  return new TextEncoder().encode(password).length <= 72;
}

export function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60) || null;
}
