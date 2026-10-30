import { describe, expect, it } from "vitest";
import { parseColumnVisibility } from "./column-visibility";

describe("parseColumnVisibility", () => {
  it("reads a saved visibility map", () => {
    expect(parseColumnVisibility('{"phone":false,"address":true}')).toEqual({
      phone: false,
      address: true,
    });
  });

  it("ignores a missing, malformed, or non-object value", () => {
    expect(parseColumnVisibility(undefined)).toEqual({});
    expect(parseColumnVisibility("{not json")).toEqual({});
    expect(parseColumnVisibility("null")).toEqual({});
    expect(parseColumnVisibility("[1,2]")).toEqual({});
  });

  it("drops entries that aren't booleans", () => {
    expect(parseColumnVisibility('{"phone":false,"x":"no","y":1}')).toEqual({
      phone: false,
    });
  });
});
