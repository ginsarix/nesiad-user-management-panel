import { afterEach, describe, expect, it, vi } from "vitest";
import { getApplicationNoticeSettings } from "./application-notice-settings";
import { sendApplicationNotices } from "./application-notices";
import type { NetgsmClient } from "./sms/netgsm";
import { fillTemplate } from "./sms/templates";
import { SMS_MAX_LENGTH } from "./zod-schemas/sms";

const mail = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/mail", () => mail);

const netgsm = vi.hoisted(() => ({ client: null as NetgsmClient | null }));
vi.mock("@/lib/sms/netgsm", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/sms/netgsm")>();
  return { ...mod, netgsmClient: () => netgsm.client ?? mod.fakeNetgsmClient };
});

const applicant = {
  title: "__test__ Bildirim A.Ş.",
  applicantFirstName: "Ayşe",
  applicantLastName: "Yılmaz",
  email: "ayse@example.com",
  mobilePhone: "0532 111 22 33",
};

const sent: { no: string; msg: string }[] = [];

function fakeClient(
  answer: () => Promise<{ status: number; body: unknown }>,
): NetgsmClient {
  return {
    dryRun: false,
    send: async (messages) => {
      sent.push(...messages);
      return answer();
    },
  };
}
const okAnswer = async () => ({
  status: 200,
  body: { code: "00", jobid: "123" },
});

afterEach(() => {
  netgsm.client = null;
  sent.length = 0;
  mail.sendEmail.mockReset();
  vi.useRealTimers();
});

describe("sendApplicationNotices", () => {
  it("sends both from the right templates", async () => {
    netgsm.client = fakeClient(okAnswer);
    mail.sendEmail.mockResolvedValue(undefined);
    const settings = await getApplicationNoticeSettings();
    const values = { ad: "Ayşe Yılmaz", firma: applicant.title };

    const accepted = await sendApplicationNotices("accepted", applicant);
    expect(accepted).toEqual({ email: "sent", sms: "sent" });
    expect(mail.sendEmail).toHaveBeenLastCalledWith({
      to: "ayse@example.com",
      subject: fillTemplate(settings.acceptedEmailSubject, values),
      text: fillTemplate(settings.acceptedEmailBody, values),
    });
    expect(sent.at(-1)).toEqual({
      no: "5321112233",
      msg: fillTemplate(settings.acceptedSms, values),
    });

    await sendApplicationNotices("rejected", applicant);
    expect(mail.sendEmail).toHaveBeenLastCalledWith({
      to: "ayse@example.com",
      subject: fillTemplate(settings.rejectedEmailSubject, values),
      text: fillTemplate(settings.rejectedEmailBody, values),
    });
    expect(sent.at(-1)?.msg).toBe(fillTemplate(settings.rejectedSms, values));

    await sendApplicationNotices("received", applicant);
    expect(mail.sendEmail).toHaveBeenLastCalledWith({
      to: "ayse@example.com",
      subject: fillTemplate(settings.receivedEmailSubject, values),
      text: fillTemplate(settings.receivedEmailBody, values),
    });
    expect(sent.at(-1)?.msg).toBe(fillTemplate(settings.receivedSms, values));
  });

  it("skips a missing or invalid address", async () => {
    netgsm.client = fakeClient(okAnswer);
    mail.sendEmail.mockResolvedValue(undefined);

    expect(
      await sendApplicationNotices("accepted", { ...applicant, email: null }),
    ).toEqual({ email: "skipped", sms: "sent" });
    expect(
      await sendApplicationNotices("accepted", { ...applicant, email: "nope" }),
    ).toEqual({ email: "skipped", sms: "sent" });
    expect(mail.sendEmail).not.toHaveBeenCalled();
    sent.length = 0;

    expect(
      await sendApplicationNotices("accepted", {
        ...applicant,
        mobilePhone: "0384 111 11 11",
      }),
    ).toEqual({ email: "sent", sms: "skipped" });
    expect(
      await sendApplicationNotices("accepted", {
        ...applicant,
        mobilePhone: null,
      }),
    ).toEqual({ email: "sent", sms: "skipped" });
    expect(sent).toHaveLength(0);
  });

  it("logs NetGSM's job id, and no number or text, when the SMS is accepted", async () => {
    netgsm.client = fakeClient(okAnswer);
    mail.sendEmail.mockResolvedValue(undefined);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await sendApplicationNotices("received", applicant);

      expect(log).toHaveBeenCalledWith(
        "Application notice SMS (received) accepted by NetGSM, job:",
        "123",
      );
      const logged = JSON.stringify(log.mock.calls);
      for (const secret of ["5321112233", "Ayşe", applicant.title]) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      log.mockRestore();
    }
  });

  it("reports a failed email without throwing", async () => {
    netgsm.client = fakeClient(okAnswer);
    mail.sendEmail.mockRejectedValue(new Error("smtp down"));
    expect(await sendApplicationNotices("accepted", applicant)).toEqual({
      email: "failed",
      sms: "sent",
    });
  });

  it("reports a NetGSM refusal as failed", async () => {
    netgsm.client = fakeClient(async () => ({
      status: 406,
      body: { code: "40" },
    }));
    mail.sendEmail.mockResolvedValue(undefined);
    expect(await sendApplicationNotices("accepted", applicant)).toEqual({
      email: "sent",
      sms: "failed",
    });
  });

  it("reports no NetGSM answer as unknown", async () => {
    netgsm.client = fakeClient(async () => {
      throw new Error("timeout");
    });
    mail.sendEmail.mockResolvedValue(undefined);
    expect(await sendApplicationNotices("accepted", applicant)).toEqual({
      email: "sent",
      sms: "unknown",
    });
  });

  it("falls back to the company name when both names are blank", async () => {
    netgsm.client = fakeClient(okAnswer);
    mail.sendEmail.mockResolvedValue(undefined);
    const settings = await getApplicationNoticeSettings();
    const values = { ad: applicant.title, firma: applicant.title };

    await sendApplicationNotices("accepted", {
      ...applicant,
      applicantFirstName: null,
      applicantLastName: "  ",
    });

    expect(sent[0].msg).toBe(fillTemplate(settings.acceptedSms, values));
    expect(mail.sendEmail.mock.calls[0][0].text).toBe(
      fillTemplate(settings.acceptedEmailBody, values),
    );
  });

  it("logs no address, number or message text when sending fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const leaky = Object.assign(
        new Error("550 rejected ayse@example.com 5321112233"),
        {
          code: "EENVELOPE",
          responseCode: 550,
          rejected: ["ayse@example.com"],
          response: "550 no such user ayse@example.com",
        },
      );
      mail.sendEmail.mockRejectedValue(leaky);
      const settings = await getApplicationNoticeSettings();
      const text = fillTemplate(settings.acceptedSms, {
        ad: "Ayşe Yılmaz",
        firma: applicant.title,
      });

      // NetGSM unreachable, with an error that echoes the request
      netgsm.client = fakeClient(async () => {
        throw Object.assign(new Error(`failed for 5321112233: ${text}`), {
          code: "ETIMEDOUT",
        });
      });
      await sendApplicationNotices("accepted", applicant);
      // NetGSM refuses
      netgsm.client = fakeClient(async () => ({
        status: 406,
        body: { code: "40", echo: `5321112233 ${text}` },
      }));
      await sendApplicationNotices("accepted", applicant);

      expect(log).toHaveBeenCalled();
      const logged = JSON.stringify(
        log.mock.calls.flat().map((a) => (a instanceof Error ? a.message : a)),
      );
      expect(logged).toContain("EENVELOPE");
      for (const secret of [
        "ayse@example.com",
        "5321112233",
        "0532",
        "Ayşe",
        text.slice(0, 30),
      ]) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      log.mockRestore();
    }
  });

  it("fails an SMS longer than the limit without calling NetGSM", async () => {
    netgsm.client = fakeClient(okAnswer);
    mail.sendEmail.mockResolvedValue(undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const longName = "A".repeat(SMS_MAX_LENGTH);
      expect(
        await sendApplicationNotices("accepted", {
          ...applicant,
          applicantFirstName: longName,
        }),
      ).toEqual({ email: "sent", sms: "failed" });
      expect(sent).toHaveLength(0);
      // the reason is logged, the text isn't
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain("Application notice SMS (accepted) not sent");
      expect(logged).not.toContain(longName.slice(0, 20));
    } finally {
      log.mockRestore();
    }
  });

  it("counts a hanging email as failed after 30 seconds, with nothing left unhandled", async () => {
    netgsm.client = fakeClient(okAnswer);
    let rejectLate: (error: Error) => void = () => {};
    mail.sendEmail.mockReturnValue(
      new Promise((_, reject) => {
        rejectLate = reject;
      }),
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = sendApplicationNotices("accepted", applicant);
    // the templates come from the database first; the timer starts after
    while (mail.sendEmail.mock.calls.length === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ email: "failed", sms: "sent" });

    rejectLate(new Error("late smtp error"));
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
