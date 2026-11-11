import { describe, expect, it } from "vitest";
import {
  amountToInput,
  formatAmount,
  formatAmountText,
  parseAmountInput,
} from "./money";

describe("parseAmountInput", () => {
  it.each([
    ["1.250,50", "1250.50"],
    ["1250,5", "1250.50"],
    ["1250", "1250.00"],
    ["0,99", "0.99"],
    [" 12.345.678,9 ", "12345678.90"],
    ["1.250", "1250.00"],
    ["0", "0.00"],
  ])("parses %s", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each([
    "",
    "abc",
    "1,250.50",
    "12,345",
    "1.25",
    "1,234",
    "-5",
    "1,2,3",
    "12345678901",
  ])("rejects %s", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});

describe("formatAmount", () => {
  it("formats as Turkish lira", () => {
    expect(formatAmount("1250.5")).toBe("₺1.250,50");
    expect(formatAmount("0.3")).toBe("₺0,30");
    expect(formatAmount(1234567.891)).toBe("₺1.234.567,89");
  });
});

describe("formatAmountText", () => {
  it("writes TL instead of the ₺ sign, which SMS can't carry", () => {
    expect(formatAmountText("1250.5")).toBe("1.250,50 TL");
    expect(formatAmountText("0.3")).toBe("0,30 TL");
    expect(formatAmountText(1234567.891)).toBe("1.234.567,89 TL");
  });
});

describe("amountToInput", () => {
  it("formats for the amount input, without the symbol", () => {
    expect(amountToInput("1250.50")).toBe("1.250,50");
    expect(amountToInput("7.00")).toBe("7,00");
  });
});
