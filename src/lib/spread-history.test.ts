import { describe, expect, it } from "vitest";
import {
  emptySpreadHistory,
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
