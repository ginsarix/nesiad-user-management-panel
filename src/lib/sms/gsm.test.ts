import { describe, expect, it } from "vitest";
import { loginCodeSms, phoneCodeSms } from "../login-code";
import { noticeSettingsSchema } from "../zod-schemas/application-notices";
import { collectionNoticeSettingsSchema } from "../zod-schemas/collection-notices";
import { smsFormSchema, smsSettingsSchema } from "../zod-schemas/sms";
import { unsupportedSmsCharacters, unsupportedSmsCharactersError } from "./gsm";
import {
  DEFAULT_COLLECTION_NOTICE_TEMPLATES,
  DEFAULT_MESSAGES,
  DEFAULT_NOTICE_TEMPLATES,
} from "./templates";

describe("unsupportedSmsCharacters", () => {
  it("accepts the whole Turkish alphabet, digits and common punctuation", () => {
    expect(
      unsupportedSmsCharacters(
        "AaBbCcÇçDdEeFfGgĞğHhIıİiJjKkLlMmNnOoÖöPpRrSsŞşTtUuÜüVvYyZz 0123456789",
      ),
    ).toEqual([]);
    expect(
      unsupportedSmsCharacters(`.,;:!?'"()-+/%&@#*=<>_{}[]~|^\\€$£\n`),
    ).toEqual([]);
  });

  it("lists each unsupported character once, in order", () => {
    expect(unsupportedSmsCharacters("₺1.250 — hâlâ ₺ “tamam” … 🎉")).toEqual([
      "₺",
      "—",
      "â",
      "“",
      "”",
      "…",
      "🎉",
    ]);
  });
});

describe("unsupportedSmsCharactersError", () => {
  it("is null for text an SMS can carry", () => {
    expect(unsupportedSmsCharactersError("Sayın Ayşe, teşekkürler")).toBeNull();
  });

  it("quotes visible characters and names invisible ones", () => {
    expect(unsupportedSmsCharactersError("₺10 TL\tâ")).toBe(
      `SMS'te kullanılamayan karakter: "₺", görünmeyen karakter (U+00A0), sekme, "â". Telefona "?" olarak gider.`,
    );
  });
});

describe("shipped SMS texts", () => {
  it("use only characters an SMS can carry", () => {
    const texts = [
      ...Object.values(DEFAULT_MESSAGES),
      DEFAULT_NOTICE_TEMPLATES.receivedSms,
      DEFAULT_NOTICE_TEMPLATES.acceptedSms,
      DEFAULT_NOTICE_TEMPLATES.rejectedSms,
      DEFAULT_COLLECTION_NOTICE_TEMPLATES.representativeSms,
      DEFAULT_COLLECTION_NOTICE_TEMPLATES.staffSms,
      loginCodeSms("123456"),
      phoneCodeSms("123456"),
    ];
    for (const text of texts)
      expect(unsupportedSmsCharacters(text)).toEqual([]);
  });
});

describe("SMS schemas", () => {
  const issue = (result: {
    success: boolean;
    error?: { issues: { message: string }[] };
  }) => result.error?.issues.map((i) => i.message) ?? [];

  it("refuse unsupported characters in a manual SMS", () => {
    const result = smsFormSchema.safeParse({ message: "Aidat ₺500" });
    expect(result.success).toBe(false);
    expect(issue(result)).toEqual([
      `SMS'te kullanılamayan karakter: "₺". Telefona "?" olarak gider.`,
    ]);
  });

  it("refuse them in every SMS template but not in emails", () => {
    expect(
      smsSettingsSchema.safeParse({
        autoEnabled: false,
        sendTime: "10:00",
        foundingMessage: "Sayın {ad} — tebrikler",
        birthdayMessage: DEFAULT_MESSAGES.birthday,
      }).success,
    ).toBe(false);
    expect(
      noticeSettingsSchema.safeParse({
        ...DEFAULT_NOTICE_TEMPLATES,
        acceptedSms: "Hoş geldiniz…",
      }).success,
    ).toBe(false);
    expect(
      collectionNoticeSettingsSchema.safeParse({
        ...DEFAULT_COLLECTION_NOTICE_TEMPLATES,
        staffSms: "Yeni tahsilat: ₺{tutar}",
      }).success,
    ).toBe(false);

    const emails = collectionNoticeSettingsSchema.safeParse({
      ...DEFAULT_COLLECTION_NOTICE_TEMPLATES,
      memberEmailSubject: "Ödemeniz alındı — teşekkürler",
      memberEmailBody: "Tutar: ₺{tutar} …",
    });
    expect(emails.success).toBe(true);
  });
});
