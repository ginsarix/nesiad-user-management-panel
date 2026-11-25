import { describe, expect, it } from "vitest";
import { PARAMETER_KINDS, parameterUsageNouns } from "./parameters";

describe("PARAMETER_KINDS", () => {
  it("has no Ödeme Tipi or Tahsilat Tipi (Kasa - Banka replaced them)", () => {
    expect(PARAMETER_KINDS).toEqual([
      "collection_category",
      "payment_category",
      "association_role",
    ]);
  });
});

describe("parameterUsageNouns", () => {
  it("names what uses each kind of list, and the field to change there", () => {
    expect(parameterUsageNouns("payment_category")).toEqual({
      locative: "ödemede",
      genitivePlural: "ödemelerin",
      field: "Ödeme Türü",
    });
    // a Tahsilat Türü is a tahakkuk row's Tahakkuk Türü too
    expect(parameterUsageNouns("collection_category")).toEqual({
      locative: "tahsilat veya tahakkuk kaydında",
      genitivePlural: "kayıtların",
      field: "Tahsilat Türü / Tahakkuk Türü",
    });
    expect(parameterUsageNouns("association_role")).toEqual({
      locative: "organizasyon kaydında",
      genitivePlural: "organizasyon kayıtlarının",
      field: "Dernek Görevi",
    });
  });
});
