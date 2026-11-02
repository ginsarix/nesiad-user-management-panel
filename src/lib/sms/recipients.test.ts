import { describe, expect, it } from "vitest";
import { buildRecipients, type Contact } from "./recipients";

const member = (id: number, phone: string | null): Contact => ({
  kind: "member",
  id,
  name: `Üye ${id}`,
  phone,
});
const representative = (id: number, phone: string | null): Contact => ({
  kind: "representative",
  id,
  name: `Yetkili ${id}`,
  phone,
});

// PLAN.md Level 2 done check: 7 alıcı · 2 telefonsuz · 1 geçersiz · 1 tekrar
const contacts: Contact[] = [
  member(1, "0 (535) 406 82 92"),
  member(2, "0532 123 45 67"),
  member(3, null),
  member(4, "0384 213 11 11"), // landline
  member(5, "5051112233"),
  member(6, "+90 542 000 00 01"),
  representative(1, "+90 535 406 82 92"), // member 1's number, typed differently
  representative(2, "0 (533) 765 43 21"),
  representative(3, null),
  representative(4, "905449998877"),
  representative(5, "0090 555 444 33 22"),
];

describe("buildRecipients", () => {
  const { recipients, skipped } = buildRecipients(contacts);

  it("sends one SMS to each valid mobile, in the given order", () => {
    expect(recipients).toEqual([
      { phone: "5354068292", contact: contacts[0] },
      { phone: "5321234567", contact: contacts[1] },
      { phone: "5051112233", contact: contacts[4] },
      { phone: "5420000001", contact: contacts[5] },
      { phone: "5337654321", contact: contacts[7] },
      { phone: "5449998877", contact: contacts[9] },
      { phone: "5554443322", contact: contacts[10] },
    ]);
  });

  it("skips the rest with a reason", () => {
    expect(skipped).toEqual([
      { contact: contacts[2], reason: "no_phone" },
      { contact: contacts[3], reason: "invalid" },
      { contact: contacts[6], reason: "duplicate" },
      { contact: contacts[8], reason: "no_phone" },
    ]);
  });

  it("returns nothing for nobody", () => {
    expect(buildRecipients([])).toEqual({ recipients: [], skipped: [] });
  });
});
