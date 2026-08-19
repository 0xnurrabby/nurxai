import { detectAll } from "tinyld";

export function canonicalSourceLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().replace(/_/g, "-");
  if (!candidate || candidate.length > 35) return null;
  try {
    const canonical = Intl.getCanonicalLocales(candidate)[0];
    if (!canonical || canonical.toLowerCase() === "und") return null;
    return canonical;
  } catch {
    return null;
  }
}

export function primaryTweetText(context: string): string {
  const text = String(context || "").trim();
  const marker = /(?:^|\n)Tweet text:\s*/i.exec(text);
  if (!marker) return text;

  const primary = text.slice(marker.index + marker[0].length);
  const secondary = /\n(?:Links:|\[Card:|Quoted tweet(?: by [^:\n]+)?:)/i.exec(primary);
  return (secondary ? primary.slice(0, secondary.index) : primary).trim();
}

function baseLanguage(language: string) {
  return language.split("-")[0].toLowerCase();
}

function confidentlyDetectedLanguage(text: string): string | null {
  const signal = text
    .normalize("NFKC")
    .replace(/https?:\/\/\S+|[@$#][\p{L}\p{N}_]+/gu, " ")
    .replace(/[^\p{L}\p{M}'\u2019]+/gu, " ")
    .trim();
  const letters = signal.match(/\p{L}/gu)?.length || 0;
  const words = signal.match(/\p{L}[\p{L}\p{M}'\u2019]*/gu)?.length || 0;
  const compactScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u.test(signal);
  if (compactScript ? letters < 3 : letters < 8 || words < 2) return null;

  const results = detectAll(signal);
  const first = results[0];
  if (!first) return null;
  const secondAccuracy = results[1]?.accuracy || 0;
  const confident = first.accuracy >= 0.5 || (
    first.accuracy >= 0.1 && (!secondAccuracy || first.accuracy >= secondAccuracy * 1.45)
  );
  return confident ? canonicalSourceLanguage(first.lang) : null;
}

export function resolveSourceLanguage(context: string, hint: unknown): string | null {
  return canonicalSourceLanguage(hint) || confidentlyDetectedLanguage(primaryTweetText(context));
}

export function languageLabel(language: string | null): string {
  if (!language) return "the primary Tweet's language (infer only from Tweet text)";
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(language);
    return name && name !== language ? `${name} (${language})` : language;
  } catch {
    return language;
  }
}

export function suggestionMatchesLanguage(suggestion: string, targetLanguage: string | null): boolean {
  if (!targetLanguage) return true;
  const detected = confidentlyDetectedLanguage(suggestion);
  return !detected || baseLanguage(detected) === baseLanguage(targetLanguage);
}
