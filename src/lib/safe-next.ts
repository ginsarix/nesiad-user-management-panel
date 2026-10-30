const PLACEHOLDER_ORIGIN = "http://local.invalid";

/**
 * The `next` query param from the login redirect, if it's a path on this
 * site; anything else (e.g. "//evil.com", "https://...") falls back.
 *
 * Parsed the way a browser would, so tricks like "/\t/evil.com" (browsers
 * drop tabs and newlines) can't turn it into another site.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/members",
) {
  if (!next?.startsWith("/")) return fallback;

  try {
    const url = new URL(next, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
