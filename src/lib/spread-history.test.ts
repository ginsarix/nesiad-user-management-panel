import { describe, expect, it } from "vitest";
import {
  emptySpreadHistory,
  pruneSpread,
  recordSpread,
  redoSpread,
  type SpreadStep,
  undoShortcut,
  undoSpread,
} from "./spread-history";

const step = (before: string, after: string): SpreadStep => ({
  field: "quantity",
  before: { a: before, b: before },
  after: { a: after, b: after },
});

describe("spread history", () => {
  it("undoes and redoes steps in order", () => {
    let history = recordSpread(emptySpreadHistory, step("1", "2"));
    history = recordSpread(history, step("2", "3"));

    const first = undoSpread(history);
    expect(first?.values).toEqual({ a: "2", b: "2" });
    const second = undoSpread(first?.history ?? emptySpreadHistory);
    expect(second?.values).toEqual({ a: "1", b: "1" });
    expect(undoSpread(second?.history ?? emptySpreadHistory)).toBeNull();

    const redone = redoSpread(second?.history ?? emptySpreadHistory);
    expect(redone?.values).toEqual({ a: "2", b: "2" });
    expect(redone?.field).toBe("quantity");
  });

  it("drops redo once a new step is recorded", () => {
    let history = recordSpread(emptySpreadHistory, step("1", "2"));
    history = undoSpread(history)?.history ?? emptySpreadHistory;
    history = recordSpread(history, step("1", "5"));
    expect(redoSpread(history)).toBeNull();
  });

  it("ignores a step that changed nothing", () => {
    const history = recordSpread(emptySpreadHistory, step("4", "4"));
    expect(history).toBe(emptySpreadHistory);
  });
});

describe("pruneSpread", () => {
  const onRows = (ids: string[], before: string, after: string) => ({
    field: "amount" as const,
    before: Object.fromEntries(ids.map((id) => [id, before])),
    after: Object.fromEntries(ids.map((id) => [id, after])),
  });

  it("drops only the steps whose rows are all gone", () => {
    // row a typed alone, then rows b and c added and changed with it
    let history = recordSpread(emptySpreadHistory, onRows(["a"], "", "1000"));
    history = recordSpread(history, onRows(["a", "b", "c"], "1000", "750"));

    const pruned = pruneSpread(history, new Set(["b", "c"]));
    expect(pruned.past).toHaveLength(1);
    expect(undoSpread(pruned)?.values).toEqual({
      a: "1000",
      b: "1000",
      c: "1000",
    });
  });

  it("drops everything after a reset gives every row a new id", () => {
    let history = recordSpread(emptySpreadHistory, onRows(["a"], "1", "2"));
    history = undoSpread(history)?.history ?? history;
    expect(pruneSpread(history, new Set(["x", "y"]))).toEqual(
      emptySpreadHistory,
    );
  });

  it("keeps the same history when nothing is gone", () => {
    const history = recordSpread(emptySpreadHistory, onRows(["a"], "1", "2"));
    expect(pruneSpread(history, new Set(["a", "b"]))).toBe(history);
  });
});

describe("undoShortcut", () => {
  const key = (k: string, extra: Partial<KeyboardEvent> = {}) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
  });

  it("reads Cmd/Ctrl+Z as undo", () => {
    expect(undoShortcut(key("z", { metaKey: true }))).toBe("undo");
    expect(undoShortcut(key("z", { ctrlKey: true }))).toBe("undo");
  });

  it("reads Cmd/Ctrl+Shift+Z and Ctrl+Y as redo", () => {
    expect(undoShortcut(key("Z", { metaKey: true, shiftKey: true }))).toBe(
      "redo",
    );
    expect(undoShortcut(key("z", { ctrlKey: true, shiftKey: true }))).toBe(
      "redo",
    );
    expect(undoShortcut(key("y", { ctrlKey: true }))).toBe("redo");
  });

  it("leaves other keys alone", () => {
    expect(undoShortcut(key("z"))).toBeNull();
    expect(undoShortcut(key("z", { metaKey: true, altKey: true }))).toBeNull();
    expect(undoShortcut(key("y", { metaKey: true }))).toBeNull();
  });
});
