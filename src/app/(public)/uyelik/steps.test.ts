import { describe, expect, it } from "vitest";
import { applicationFormSchema } from "@/lib/zod-schemas/application";
import { APPLICATION_STEPS, stepOfField } from "./steps";

describe("APPLICATION_STEPS", () => {
  it("maps every form field to exactly one step", () => {
    const fields = APPLICATION_STEPS.flatMap((step) => [...step.fields]).sort();
    const expected = Object.keys(applicationFormSchema.shape)
      .filter((key) => key !== "leaveBlank")
      .sort();

    expect(fields).toEqual(expected);
    expect(new Set(fields).size).toBe(fields.length);
    expect(stepOfField("logo")).toBe(3);
    expect(stepOfField("nope")).toBe(-1);
  });
});
