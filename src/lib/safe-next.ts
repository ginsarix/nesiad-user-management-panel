/**
 * The `next` query param from the login redirect, if it's a path on this
 * site; anything else (e.g. "//evil.com", "https://...") falls back.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/members",
) {
  if (
    !next?.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return fallback;
  }
  return next;
}
