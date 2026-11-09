import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";

const generic429 =
  "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.";

describe("authErrorMessage", () => {
  it("explains the resend cooldown instead of the generic 429 message", () => {
    const message = authErrorMessage({
      code: "LOGIN_CODE_RESEND_TOO_SOON",
      status: 429,
    });
    expect(message).toBe("Yeni kod istemek için bir dakika bekleyin.");
    expect(message).not.toBe(generic429);
  });

  it("explains the account lock instead of the generic 429 message", () => {
    const message = authErrorMessage({
      code: "ACCOUNT_TEMPORARILY_LOCKED",
      status: 429,
    });
    expect(message).toMatch(/15 dakika/);
    expect(message).not.toBe(generic429);
  });

  it("tells the person to start again when the pending login is gone", () => {
    expect(
      authErrorMessage({ code: "INVALID_TWO_FACTOR_COOKIE", status: 401 }),
    ).toMatch(/^Giriş süresi doldu/);
  });

  it("keeps the generic message for other 429s", () => {
    expect(authErrorMessage({ status: 429 })).toBe(generic429);
  });
});
