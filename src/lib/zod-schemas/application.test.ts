import { describe, expect, it } from "vitest";
import {
  APPLICATION_STEPS,
  applicationApiSchema,
  applicationFormSchema,
  stepOfField,
} from "./application";
import { documentFileSchema } from "./member";

const png = () =>
  new File([new Uint8Array([1])], "a.png", { type: "image/png" });

const validFormValues = {
  applicantFirstName: "Ayşe",
  applicantLastName: "Yılmaz",
  birthDate: "01.02.1990",
  birthPlace: "Nevşehir",
  nationalId: "10000000146",
  gender: "female",
  education: "Lisans",
  mobilePhone: "0532 123 45 67",
  email: "ayse@example.com",
  title: "Örnek AŞ",
  applicantRole: "Yönetim Kurulu Başkanı",
  employeeCount: "12",
  address: "Nevşehir",
  phone: "0384 213 00 00",
  website: "ornek.com",
  companyIntro: "Üç cümle. İki. Bir.",
  referenceName: "Mehmet Demir",
  otherAssociations: "",
  logo: png(),
  identityDocument: png(),
  activityDocument: png(),
  consentRules: true,
  consentData: true,
  faxNumber: "",
};

describe("APPLICATION_STEPS", () => {
  it("maps every form field to exactly one step", () => {
    const fields = APPLICATION_STEPS.flatMap((step) => [...step.fields]).sort();
    const expected = Object.keys(applicationFormSchema.shape)
      .filter((key) => key !== "faxNumber")
      .sort();

    expect(fields).toEqual(expected);
    expect(new Set(fields).size).toBe(fields.length);
    expect(stepOfField("logo")).toBe(3);
    expect(stepOfField("nope")).toBe(-1);
  });
});

describe("applicationFormSchema", () => {
  it("accepts a complete form", () => {
    expect(applicationFormSchema.safeParse(validFormValues).success).toBe(true);
  });

  it("requires everything except otherAssociations", () => {
    const blank = {
      ...validFormValues,
      applicantFirstName: "",
      applicantLastName: "",
      birthDate: "",
      birthPlace: "",
      nationalId: "",
      gender: "",
      education: "",
      mobilePhone: "",
      email: "",
      title: "",
      applicantRole: "",
      employeeCount: "",
      address: "",
      phone: "",
      website: "",
      companyIntro: "",
      referenceName: "",
      logo: null,
      identityDocument: null,
      activityDocument: null,
      consentRules: false,
      consentData: false,
    };
    const result = applicationFormSchema.safeParse(blank);
    const failed = new Set(
      result.error?.issues.map((issue) => String(issue.path[0])),
    );

    expect([...failed].sort()).toEqual(
      Object.keys(blank)
        .filter((key) => key !== "otherAssociations" && key !== "faxNumber")
        .sort(),
    );
  });

  it("refuses a future birth date", () => {
    const next = new Date().getFullYear() + 1;
    const result = applicationFormSchema.safeParse({
      ...validFormValues,
      birthDate: `01.01.${next}`,
    });

    expect(result.success).toBe(false);
  });

  it("collapses newlines in single-line fields", () => {
    const result = applicationFormSchema.safeParse({
      ...validFormValues,
      title: "A\nB",
    });

    expect(result.data?.title).toBe("A B");
  });

  it("accepts only up to seven digits as the employee count", () => {
    const parse = (employeeCount: string) =>
      applicationFormSchema.safeParse({ ...validFormValues, employeeCount })
        .success;

    expect(parse("9999999")).toBe(true);
    expect(parse("10000000")).toBe(false);
    expect(parse("1e3")).toBe(false);
  });

  it("accepts .JPG and an empty MIME type", () => {
    const file = new File([new Uint8Array([1])], "FOTO.JPG", { type: "" });

    expect(documentFileSchema.safeParse(file).success).toBe(true);
    expect(
      applicationFormSchema.safeParse({ ...validFormValues, logo: file })
        .success,
    ).toBe(true);
  });
});

describe("link-like names", () => {
  const withName = (field: string, value: string) =>
    applicationFormSchema.safeParse({ ...validFormValues, [field]: value });

  it.each([
    "Evil https://x.y",
    "www.x.y",
    "Kapadokya.com.tr",
    "abc.COM",
  ])("refuses %s in the name, surname and company", (value) => {
    for (const field of ["applicantFirstName", "applicantLastName", "title"]) {
      const result = withName(field, value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({ path: [field] });
      expect(result.error?.issues[0].message).toMatch(/bağlantı içeremez$/);
    }
  });

  it.each([
    "Kapadokya Tur.Org.San.Ltd.Şti.",
    "Avanos Seramik A.Ş.",
    "Örnek San. ve Tic. Ltd. Şti.",
  ])("accepts %s", (value) => {
    expect(withName("title", value).success).toBe(true);
  });

  it("also refuses them on the server", () => {
    const result = applicationApiSchema.safeParse({
      ...validFormValues,
      birthDate: "1990-02-01",
      consentRules: "true",
      consentData: "true",
      title: "Evil https://x.y",
    });
    expect(result.success).toBe(false);
  });
});

describe("applicationApiSchema", () => {
  const apiValues = {
    ...validFormValues,
    birthDate: "1990-02-01",
    consentRules: "true",
    consentData: "true",
  };

  it("parses multipart strings", () => {
    const result = applicationApiSchema.safeParse(apiValues);

    expect(result.data).toMatchObject({
      birthDate: "1990-02-01",
      employeeCount: 12,
      website: "https://ornek.com",
      otherAssociations: null,
    });
  });

  it("reports the failing field first", () => {
    const result = applicationApiSchema.safeParse({
      ...apiValues,
      nationalId: "12345678901",
    });

    expect(result.error?.issues[0].path[0]).toBe("nationalId");
  });

  it("accepts an omitted otherAssociations", () => {
    const { otherAssociations: _omit, ...without } = apiValues;

    expect(applicationApiSchema.safeParse(without).data).toMatchObject({
      otherAssociations: null,
    });
  });

  it("refuses control characters but keeps line breaks in long text", () => {
    const parse = (overrides: object) =>
      applicationApiSchema.safeParse({ ...apiValues, ...overrides });

    for (const title of ["A\u0000B", "A\u0007\u202eB", "A\u200bB"]) {
      expect(parse({ title }).error?.issues[0].path[0]).toBe("title");
    }
    expect(parse({ address: "Sokak 1\nNevşehir\t" }).success).toBe(true);
    expect(parse({ address: "Sokak\u0000" }).success).toBe(false);
    expect(parse({ otherAssociations: "A\u0000" }).success).toBe(false);
  });

  it("refuses a missing consent", () => {
    expect(
      applicationApiSchema.safeParse({ ...apiValues, consentData: "false" })
        .success,
    ).toBe(false);
  });
});
