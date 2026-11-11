import { describe, expect, it } from "vitest";
import { parameterUsageNouns } from "./parameters";

describe("parameterUsageNouns", () => {
  it("names what uses each kind of list", () => {
    expect(parameterUsageNouns("payment_method")).toEqual({
      locative: "ödemede",
      genitivePlural: "ödemelerin",
    });
    expect(parameterUsageNouns("collection_category")).toEqual({
      locative: "tahsilatta",
      genitivePlural: "tahsilatların",
    });
    expect(parameterUsageNouns("association_role")).toEqual({
      locative: "organizasyon kaydında",
      genitivePlural: "organizasyon kayıtlarının",
    });
  });
});
