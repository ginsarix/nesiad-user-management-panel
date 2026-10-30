import type { ColumnVisibilityState } from "@tanstack/react-table";

/**
 * Column visibility is saved in a cookie (not localStorage) so the server
 * renders the table with the saved columns; otherwise every column shows
 * for a moment until the browser applies the choice.
 */
export function columnVisibilityCookieName(tableId: string) {
  return `nesiad-columns-${tableId}`;
}

/** The saved `{ columnId: visible }` map; anything malformed is ignored */
export function parseColumnVisibility(
  value: string | undefined,
): ColumnVisibilityState {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

/** In the browser: the saved map straight from document.cookie, if any */
export function readColumnVisibilityCookie(tableId: string) {
  const prefix = `${columnVisibilityCookieName(tableId)}=`;
  const cookie = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix));
  if (!cookie) return undefined;
  try {
    return parseColumnVisibility(
      decodeURIComponent(cookie.slice(prefix.length)),
    );
  } catch {
    // a malformed escape sequence
    return undefined;
  }
}
