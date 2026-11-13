import { describe, expect, it } from "vitest";
import { parameterUsageNouns } from "./parameters";

describe("parameterUsageNouns", () => {
  it("names what uses each kind of list, and the field to change there", () => {
    expect(parameterUsageNouns("payment_method")).toEqual({
      locative: "ödemede",
      genitivePlural: "ödemelerin",
      field: "Ödeme Tipi",
    });
    // a Tahsilat Türü is a tahakkuk row's Aidat too
    expect(parameterUsageNouns("collection_category")).toEqual({
      locative: "tahsilat veya tahakkuk kaydında",
      genitivePlural: "kayıtların",
      field: "Tahsilat Türü / Aidat",
    });
    expect(parameterUsageNouns("collection_method")).toEqual({
      locative: "tahsilatta",
      genitivePlural: "tahsilatların",
      field: "Tahsilat Tipi",
    });
    expect(parameterUsageNouns("association_role")).toEqual({
      locative: "organizasyon kaydında",
      genitivePlural: "organizasyon kayıtlarının",
      field: "Dernek Görevi",
    });
  });
});
