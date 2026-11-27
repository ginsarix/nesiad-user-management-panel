import { describe, expect, it } from "vitest";
import {
  EMPTY_COMPANY_FIELDS,
  type MemberFormInput,
  memberFormSchema,
} from "./member";

function values(overrides: Partial<MemberFormInput> = {}): MemberFormInput {
  return {
    firstName: "Ayşe",
    lastName: "Yılmaz",
    memberLoginDate: "",
    status: "active",
    email: "",
    mobilePhone: "",
    birthDate: "",
    notes: "",
    poPositiveCardNo: "",
    photo: null,
    removePhoto: false,
    birthPlace: "",
    nationalId: "",
    education: "",
    otherAssociations: "",
    gender: "",
    referenceName: "",
    identityDocument: null,
    companyRole: "",
    company: {
      mode: "none",
      id: null,
      existing: EMPTY_COMPANY_FIELDS,
      new: EMPTY_COMPANY_FIELDS,
      logo: null,
      removeLogo: false,
      activityDocument: null,
    },
    organizations: [],
    ...overrides,
  };
}

function issues(input: MemberFormInput) {
  const result = memberFormSchema.safeParse(input);
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

describe("memberFormSchema", () => {
  it("needs Adı and Soyadı", () => {
    expect(issues(values({ firstName: " ", lastName: "" }))).toEqual([
      { path: "firstName", message: "Adı boş olamaz" },
      { path: "lastName", message: "Soyadı boş olamaz" },
    ]);
  });

  it("checks the cep telefonu and TC Kimlik No when given", () => {
    expect(issues(values({ mobilePhone: "123", nationalId: "123" }))).toEqual([
      { path: "mobilePhone", message: "Geçerli bir cep telefonu girin" },
      { path: "nationalId", message: "Geçerli bir TC Kimlik No girin" },
    ]);
    expect(issues(values({ mobilePhone: "0532 123 45 67" }))).toEqual([]);
  });

  it("ignores the hidden company fields with no company", () => {
    const input = values();
    input.company.new = { ...EMPTY_COMPANY_FIELDS, website: "javascript:x" };
    const result = memberFormSchema.parse(input);
    expect(result.company).toEqual({ mode: "none" });
  });

  it("checks only the chosen mode's fields", () => {
    const input = values();
    input.company = {
      ...input.company,
      mode: "new",
      new: { ...EMPTY_COMPANY_FIELDS, employeeCount: "-1" },
      // left over from picking an existing company first
      existing: { ...EMPTY_COMPANY_FIELDS, website: "javascript:x" },
    };
    expect(issues(input)).toEqual([
      { path: "company.new.title", message: "Ünvan boş olamaz" },
      {
        path: "company.new.employeeCount",
        message: "Çalışan sayısı sıfır veya daha büyük bir tam sayı olmalıdır",
      },
    ]);
  });

  it("needs a picked company for an existing one", () => {
    const input = values();
    input.company = { ...input.company, mode: "existing" };
    expect(issues(input)).toContainEqual({
      path: "company.id",
      message: "Firma seçin",
    });
  });

  it("submits the company as the chosen mode", () => {
    const fields = { ...EMPTY_COMPANY_FIELDS, title: "__test__ Firma" };
    const input = values();
    input.company = {
      ...input.company,
      mode: "existing",
      id: 7,
      existing: fields,
    };
    expect(memberFormSchema.parse(input).company).toEqual({
      mode: "existing",
      id: 7,
      fields,
      logo: null,
      removeLogo: false,
      activityDocument: null,
    });
  });

  it("needs every Organizasyon row picked", () => {
    const input = values({
      organizations: [
        { rowId: null, organization: null, groupId: null, roleId: null },
      ],
    });
    expect(issues(input).map((issue) => issue.path)).toEqual([
      "organizations.0.organization",
      "organizations.0.groupId",
      "organizations.0.roleId",
    ]);
  });
});
