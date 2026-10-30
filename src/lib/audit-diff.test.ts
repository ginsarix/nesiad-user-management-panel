import { describe, expect, it } from "vitest";
import {
  type AuditSpec,
  change,
  describeFields,
  diffFields,
  formatAudit,
} from "./audit-diff";

const spec: AuditSpec = {
  title: { label: "Ünvan", format: formatAudit.text },
  phone: { label: "Telefon", format: formatAudit.text },
  memberLoginDate: { label: "Üye Giriş Tarihi", format: formatAudit.date },
  active: { label: "Durum", format: formatAudit.active },
};

const before = {
  title: "ABC Ltd",
  phone: "0384 111",
  memberLoginDate: "2014-03-05",
  active: true,
};

describe("diffFields", () => {
  it("lists changed fields with display values", () => {
    expect(
      diffFields(spec, before, {
        title: "ABC Ltd",
        phone: "0384 222",
        memberLoginDate: "2015-01-02",
      }),
    ).toEqual([
      { label: "Telefon", from: "0384 111", to: "0384 222" },
      { label: "Üye Giriş Tarihi", from: "05.03.2014", to: "02.01.2015" },
    ]);
  });

  it("only looks at fields in the update", () => {
    expect(diffFields(spec, before, { active: false })).toEqual([
      { label: "Durum", from: "Aktif", to: "Pasif" },
    ]);
  });

  it("shows cleared values as a dash", () => {
    expect(diffFields(spec, before, { phone: null })).toEqual([
      { label: "Telefon", from: "0384 111", to: "—" },
    ]);
  });
});

describe("describeFields", () => {
  it("formats every field of the record", () => {
    expect(describeFields(spec, { ...before, phone: null })).toEqual([
      { label: "Ünvan", value: "ABC Ltd" },
      { label: "Telefon", value: "—" },
      { label: "Üye Giriş Tarihi", value: "05.03.2014" },
      { label: "Durum", value: "Aktif" },
    ]);
  });
});

describe("change", () => {
  it("is empty when nothing changed, a dash for blanks", () => {
    expect(change("Sektör", "İnşaat", "İnşaat")).toEqual([]);
    expect(change("Sektör", "İnşaat", null)).toEqual([
      { label: "Sektör", from: "İnşaat", to: "—" },
    ]);
  });
});
