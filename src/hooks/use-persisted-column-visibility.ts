import {
  type ColumnVisibilityState,
  functionalUpdate,
  type Updater,
} from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";

function storageKey(tableId: string) {
  return `nesiad:columns:${tableId}`;
}

/**
 * Column visibility for a table, remembered in this browser's localStorage.
 * `defaults` should be a module-level constant; saved choices are merged
 * over it, so a newly added column starts with its default.
 */
export function usePersistedColumnVisibility(
  tableId: string,
  defaults: ColumnVisibilityState,
) {
  const [visibility, setVisibility] = useState(defaults);

  // Read after mount: the server render can't see localStorage, so reading
  // it during render would make the first client render not match
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(tableId));
      if (saved) setVisibility({ ...defaults, ...JSON.parse(saved) });
    } catch {
      // storage unavailable or corrupt: keep the defaults
    }
  }, [tableId, defaults]);

  const updateVisibility = useCallback(
    (updater: Updater<ColumnVisibilityState>) => {
      setVisibility((previous) => {
        const next = functionalUpdate(updater, previous);
        try {
          localStorage.setItem(storageKey(tableId), JSON.stringify(next));
        } catch {
          // not persisted this time; the table still updates
        }
        return next;
      });
    },
    [tableId],
  );

  return [visibility, updateVisibility] as const;
}
