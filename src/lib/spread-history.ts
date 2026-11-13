/**
 * Undo for "Adet ve tutarı tüm satırlara uygula" in the Taahhütler editor.
 * The browser's own undo knows only the box typed in, so while the box is
 * ticked the editor keeps these steps instead: each is one box's edit until
 * it lost focus, with every row's value of that field before and after,
 * keyed by the row's useFieldArray id (removing a row doesn't shift them).
 * Client-safe.
 */

export type SpreadField = "quantity" | "amount";

export type SpreadStep = {
  field: SpreadField;
  /** row id → value */
  before: Record<string, string>;
  after: Record<string, string>;
};

export type SpreadHistory = {
  past: readonly SpreadStep[];
  future: readonly SpreadStep[];
};

export const emptySpreadHistory: SpreadHistory = { past: [], future: [] };

function changedAnything(step: SpreadStep) {
  return Object.keys(step.after).some(
    (id) => step.before[id] !== step.after[id],
  );
}

/** Adds a finished step; a new step drops whatever could be redone */
export function recordSpread(
  history: SpreadHistory,
  step: SpreadStep,
): SpreadHistory {
  if (!changedAnything(step)) return history;
  return { past: [...history.past, step], future: [] };
}

/** The values to put back for the last step, or null with nothing to undo */
export function undoSpread(history: SpreadHistory) {
  const step = history.past.at(-1);
  if (!step) return null;
  return {
    field: step.field,
    values: step.before,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, step],
    },
  };
}

/** The values to apply again for the last undone step, or null */
export function redoSpread(history: SpreadHistory) {
  const step = history.future.at(-1);
  if (!step) return null;
  return {
    field: step.field,
    values: step.after,
    history: {
      past: [...history.past, step],
      future: history.future.slice(0, -1),
    },
  };
}

/**
 * Drops the steps none of whose rows are left (`liveIds` are the rows' ids
 * now). Removing one row keeps the steps of the others; a reset gives every
 * row a new id, so everything goes.
 */
export function pruneSpread(
  history: SpreadHistory,
  liveIds: ReadonlySet<string>,
): SpreadHistory {
  const alive = (step: SpreadStep) =>
    Object.keys(step.before).some((id) => liveIds.has(id));
  const past = history.past.filter(alive);
  const future = history.future.filter(alive);
  if (
    past.length === history.past.length &&
    future.length === history.future.length
  ) {
    return history;
  }
  return past.length || future.length ? { past, future } : emptySpreadHistory;
}

/** Cmd/Ctrl+Z → undo; Cmd/Ctrl+Shift+Z and Ctrl+Y → redo */
export function undoShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): "undo" | "redo" | null {
  if (event.altKey || !(event.metaKey || event.ctrlKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.shiftKey) return "redo";
  return null;
}
