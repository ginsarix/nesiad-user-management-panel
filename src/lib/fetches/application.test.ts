import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationError,
  type ApplicationUpload,
  submitApplication,
} from "./application";

const values: ApplicationUpload = {
  applicantFirstName: "Ayşe",
  applicantLastName: "Yılmaz",
  birthDate: "25.03.1985",
  birthPlace: "Nevşehir",
  nationalId: "10000000146",
  gender: "female",
  education: "Lisans",
  mobilePhone: "05321234567",
  email: "ayse@example.com",
  title: "__test__ Firma",
  applicantRole: "Yönetici",
  employeeCount: "12",
  address: "Adres",
  phone: "03842123650",
  website: "example.com",
  companyIntro: "Tanıtım",
  referenceName: "Ref",
  otherAssociations: "",
  logo: {
    logo: new File([new Uint8Array([1])], "logo.png", { type: "image/png" }),
  },
  identityDocument: new File([new Uint8Array([1])], "id.pdf"),
  activityDocument: new File([new Uint8Array([1])], "act.jpg"),
  consentRules: true,
  consentData: true,
  leaveBlank: "",
};

afterEach(() => vi.unstubAllGlobals());

describe("submitApplication", () => {
  it("throws the API's error and field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "x", field: "nationalId" }, { status: 400 }),
      ),
    );
    const error = await submitApplication(values).catch((e) => e);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.message).toBe("x");
    expect(error.field).toBe("nationalId");
  });

  it("falls back on a non-JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>413</html>", { status: 413 })),
    );
    const error = await submitApplication(values).catch((e) => e);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.message).toBe(
      "Başvuru gönderilemedi. Dosya boyutlarını kontrol edip tekrar deneyin.",
    );
    expect(error.field).toBeUndefined();
  });

  it("falls back on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const error = await submitApplication(values).catch((e) => e);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.message).toBe("Bağlantı kurulamadı. Lütfen tekrar deneyin.");
  });

  it("sends the birth date as yyyy-aa-gg", async () => {
    const fetchStub = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ message: "ok" }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchStub);
    await submitApplication(values);
    const body = fetchStub.mock.calls[0][1].body as FormData;
    expect(body.get("birthDate")).toBe("1985-03-25");
    expect(body.get("consentRules")).toBe("true");
    expect(body.get("otherAssociations")).toBe("");
    expect(body.get("logo")).toBeInstanceOf(File);
    expect(body.has("logoOriginal")).toBe(false);
  });

  it("sends a PDF logo's original next to its image", async () => {
    const fetchStub = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ message: "ok" }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchStub);
    const image = new File([new Uint8Array([1])], "logo.png");
    const pdf = new File([new Uint8Array([2])], "logo.pdf");
    await submitApplication({
      ...values,
      logo: { logo: image, logoOriginal: pdf },
    });
    const body = fetchStub.mock.calls[0][1].body as FormData;
    expect((body.get("logo") as File).name).toBe("logo.png");
    expect((body.get("logoOriginal") as File).name).toBe("logo.pdf");
  });
});
