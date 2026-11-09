import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverLoginCode, loginCodeSms, phoneCodeSms } from "./login-code";
import type { NetgsmClient } from "./sms/netgsm";
import { fakeNetgsmClient, netgsmClient } from "./sms/netgsm";

const mail = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/mail", () => mail);
vi.mock("@/lib/sms/netgsm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms/netgsm")>()),
  netgsmClient: vi.fn(),
}));

const user = { name: "Ayşe", email: "ayse@example.com", phone: "5550000000" };
const base = { user, code: "123456", emailOnly: false };

function realClient(answer: () => Promise<{ status: number; body: unknown }>) {
  const send = vi.fn(answer);
  const client: NetgsmClient = { dryRun: false, send };
  vi.mocked(netgsmClient).mockReturnValue(client);
  return send;
}
const ok = async () => ({ status: 200, body: { code: "00", jobid: "1" } });

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  mail.sendEmail.mockReset();
  vi.mocked(netgsmClient).mockReset();
  errorSpy.mockRestore();
});

function expectEmailWithCode() {
  expect(mail.sendEmail).toHaveBeenCalledTimes(1);
  const mailArg = mail.sendEmail.mock.calls[0][0];
  expect(mailArg.to).toBe(user.email);
  expect(mailArg.subject).toBe("Dernek Üye Paneli Giriş Kodu");
  expect(mailArg.text).toContain("123456");
}

function expectCodeNotLogged() {
  expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("123456");
}

describe("deliverLoginCode", () => {
  it("sends by SMS when the number works", async () => {
    const send = realClient(ok);
    expect(await deliverLoginCode(base)).toBe("sms");
    expect(send).toHaveBeenCalledWith([
      { no: "5550000000", msg: loginCodeSms("123456") },
    ]);
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it("sends by email only when asked", async () => {
    const send = realClient(ok);
    expect(await deliverLoginCode({ ...base, emailOnly: true })).toBe("email");
    expect(send).not.toHaveBeenCalled();
    expectEmailWithCode();
  });

  it("falls back to email without a phone", async () => {
    realClient(ok);
    expect(
      await deliverLoginCode({ ...base, user: { ...user, phone: null } }),
    ).toBe("email_fallback");
    expectEmailWithCode();
  });

  it("falls back to email in dry run", async () => {
    const send = vi.spyOn(fakeNetgsmClient, "send");
    vi.mocked(netgsmClient).mockReturnValue(fakeNetgsmClient);
    expect(await deliverLoginCode(base)).toBe("email_fallback");
    expect(send).not.toHaveBeenCalled();
    expectEmailWithCode();
    send.mockRestore();
  });

  it("falls back to email when NetGSM throws", async () => {
    realClient(async () => {
      throw new Error("timeout");
    });
    expect(await deliverLoginCode(base)).toBe("email_fallback");
    expectEmailWithCode();
    expect(errorSpy).toHaveBeenCalled();
    expectCodeNotLogged();
  });

  it("falls back to email on a NetGSM error code", async () => {
    realClient(async () => ({ status: 200, body: { code: "30" } }));
    expect(await deliverLoginCode(base)).toBe("email_fallback");
    expectEmailWithCode();
    expect(errorSpy).toHaveBeenCalled();
    expectCodeNotLogged();
  });

  it("throws when the email also fails", async () => {
    mail.sendEmail.mockRejectedValue(new Error("smtp down"));
    await expect(
      deliverLoginCode({ ...base, emailOnly: true }),
    ).rejects.toThrow("smtp down");
  });
});

describe("sms copy", () => {
  it("uses the exact texts", () => {
    expect(loginCodeSms("123456")).toBe(
      "Dernek Üye Paneli giriş kodunuz: 123456. Kod 5 dakika geçerlidir.",
    );
    expect(phoneCodeSms("123456")).toBe(
      "Dernek Üye Paneli telefon doğrulama kodunuz: 123456. Kod 5 dakika geçerlidir.",
    );
  });
});
