import { describe, expect, it } from "vitest";
import { noticeWarning } from "./notice-outcome";

describe("noticeWarning", () => {
  it("returns null when nothing went wrong", () => {
    expect(noticeWarning(null)).toBeNull();
    expect(noticeWarning({ email: "sent", sms: "sent" })).toBeNull();
  });

  it("warns about each channel that didn't go out", () => {
    expect(noticeWarning({ email: "failed", sms: "sent" })).toContain(
      "E-posta gönderilemedi",
    );
    expect(noticeWarning({ email: "sent", sms: "skipped" })).toContain(
      "cep telefonu",
    );
    expect(noticeWarning({ email: "sent", sms: "unknown" })).toContain(
      "NetGSM",
    );
    expect(noticeWarning({ email: "skipped", sms: "failed" })).toContain(
      "SMS gönderilemedi",
    );
  });
});
