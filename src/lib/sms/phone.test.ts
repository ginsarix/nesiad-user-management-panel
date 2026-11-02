import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    // as stored in the panel today
    ["0 (535) 406 82 92", "5354068292"],
    ["0 (535 406 82 92)", "5354068292"],
    // other ways people type a mobile number
    ["5321234567", "5321234567"],
    ["0532-123-45-67", "5321234567"],
    ["+90 532 123 45 67", "5321234567"],
    ["905321234567", "5321234567"],
    ["0090 532 123 45 67", "5321234567"],
  ])("%s → %s", (raw, phone) => {
    expect(normalizePhone(raw)).toEqual({ ok: true, phone });
  });

  it.each([
    ["0384 213 11 11", "landline", "Nevşehir"],
    ["0352 123 45 67", "landline", "Kayseri"],
    ["0532 123 45", "length", "too short"],
    ["0532 123 45 67 8", "length", "too long"],
    ["+1 555 123 4567", "unknown", "not a Turkish number"],
    // foreign country codes that start like a Turkish number
    ["+44 7911 123456", "unknown", "UK"],
    ["+55 11 91234 5678", "unknown", "Brazil"],
    ["+53 5 123 4567", "unknown", "Cuba, looks like a 535 mobile"],
    ["0044 7911 123456", "unknown", "UK, written with 00"],
    ["", "unknown", "empty"],
    ["yok", "unknown", "no digits"],
  ])("%s → %s (%s)", (raw, reason) => {
    expect(normalizePhone(raw)).toEqual({ ok: false, reason });
  });
});
