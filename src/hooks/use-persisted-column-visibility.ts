import {
  type ColumnVisibilityState,
  functionalUpdate,
  type Updater,
} from "@tanstack/react-table";
import { useCallback, useState } from "react";
import {
  columnVisibilityCookieName,
  readColumnVisibilityCookie,
} from "@/lib/column-visibility";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * Column visibility for a table, remembered in this browser via a cookie.
 * `saved` is what the page read from that cookie on the server; the saved
 * choice is merged over `defaults`, so a newly added column starts with its
 * default.
 */
export function usePersistedColumnVisibility(
  tableId: string,
  defaults: ColumnVisibilityState,
  saved: ColumnVisibilityState,
) {
  const [visibility, setVisibility] = useState(() => ({
    ...defaults,
    // Back/forward can reuse a cached render whose `saved` predates the
    // last change, so the browser reads the cookie itself. On the first
    // load both are the same cookie, so hydration still matches.
    ...(typeof document === "undefined"
      ? saved
      : (readColumnVisibilityCookie(tableId) ?? saved)),
  }));

  const updateVisibility = useCallback(
    (updater: Updater<ColumnVisibilityState>) => {
      setVisibility((previous) => {
        const next = functionalUpdate(updater, previous);
        // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API isn't in every browser the staff may use
        document.cookie = `${columnVisibilityCookieName(tableId)}=${encodeURIComponent(
          JSON.stringify(next),
        )}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
        return next;
      });
    },
    [tableId],
  );

  return [visibility, updateVisibility] as const;
}
