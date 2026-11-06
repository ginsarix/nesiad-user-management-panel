import { describe, expect, it } from "vitest";
import {
  isEstablished,
  MEMBER_STATUS_LABELS,
  MEMBER_STATUSES,
} from "./member-status";

describe("member status", () => {
  it("labels every status in Turkish", () => {
    expect(MEMBER_STATUSES.map((s) => MEMBER_STATUS_LABELS[s])).toEqual([
      "Aktif",
      "Pasif",
      "Aday",
      "Reddedildi",
    ]);
  });

  it("treats only active and passive as established", () => {
    expect(MEMBER_STATUSES.filter(isEstablished)).toEqual([
      "active",
      "passive",
    ]);
  });
});
