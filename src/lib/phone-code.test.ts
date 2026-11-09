import { and, eq, like } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { verificationTable } from "@/db/schema";
import { phoneCodeSms } from "./login-code";
import { checkPhoneCode, issuePhoneCode } from "./phone-code";
import {
  type NetgsmClient,
  type NetgsmRawResponse,
  netgsmClient,
} from "./sms/netgsm";

// Without this mock a local SMS_DRY_RUN=false sends real SMS
vi.mock("@/lib/sms/netgsm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms/netgsm")>()),
  netgsmClient: vi.fn(),
}));

/** Every test gets its own admin session, so their codes never meet */
const SESSION_PREFIX = `__test__${crypto.randomUUID()}`;
let sessionCount = 0;
const newSessionId = () => `${SESSION_PREFIX}-${++sessionCount}`;

afterAll(async () => {
  await db
    .delete(verificationTable)
    .where(like(verificationTable.identifier, `phone-code:${SESSION_PREFIX}%`));
});

afterEach(() => {
  vi.mocked(netgsmClient).mockReset();
  vi.restoreAllMocks();
});

const ok = async (): Promise<NetgsmRawResponse> => ({
  status: 200,
  body: { code: "00", jobid: "1" },
});

/** A non-dry-run client whose sent messages the test can read */
function fakeClient(answer: () => Promise<NetgsmRawResponse> = ok) {
  const send = vi.fn<NetgsmClient["send"]>(answer);
  vi.mocked(netgsmClient).mockReturnValue({ dryRun: false, send });
  return send;
}

function sentCode(send: ReturnType<typeof fakeClient>) {
  const code = send.mock.calls
    .map(([messages]) => messages[0]?.msg.match(/kodunuz: (\d{6})/)?.[1])
    .findLast(Boolean);
  if (!code) throw new Error("No phone code was sent");
  return code;
}

const otherCode = (code: string) => (code === "000000" ? "111111" : "000000");

describe("issuePhoneCode / checkPhoneCode", () => {
  it("sends the code to the number and accepts it once", async () => {
    const send = fakeClient();
    const sessionId = newSessionId();

    expect(await issuePhoneCode(sessionId, "5550000001")).toEqual({
      ok: true,
    });
    const code = sentCode(send);
    expect(send).toHaveBeenCalledWith([
      { no: "5550000001", msg: phoneCodeSms(code) },
    ]);

    expect(await checkPhoneCode(sessionId, "5550000001", code)).toBe("ok");
    // consumed
    expect(await checkPhoneCode(sessionId, "5550000001", code)).toBe("expired");
  });

  it("stores only a hash of the code", async () => {
    const send = fakeClient();
    const sessionId = newSessionId();
    await issuePhoneCode(sessionId, "5550000001");
    const [row] = await db
      .select()
      .from(verificationTable)
      .where(
        eq(verificationTable.identifier, `phone-code:${sessionId}:5550000001`),
      );
    expect(row.value).toMatch(/^[0-9a-f]{64}:0$/);
    expect(row.value).not.toContain(sentCode(send));
  });

  it("gives up on a code after 5 wrong tries", async () => {
    const send = fakeClient();
    const sessionId = newSessionId();
    await issuePhoneCode(sessionId, "5550000001");
    const code = sentCode(send);

    for (let i = 0; i < 5; i++) {
      expect(
        await checkPhoneCode(sessionId, "5550000001", otherCode(code)),
      ).toBe("wrong");
    }
    expect(await checkPhoneCode(sessionId, "5550000001", code)).toBe(
      "too_many",
    );
  });

  it("refuses a second code within a minute", async () => {
    const send = fakeClient();
    const sessionId = newSessionId();
    await issuePhoneCode(sessionId, "5550000001");

    expect(await issuePhoneCode(sessionId, "5550000001")).toEqual({
      ok: false,
      reason: "too_soon",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("only accepts the code for the number it was sent to", async () => {
    const send = fakeClient();
    const sessionId = newSessionId();
    await issuePhoneCode(sessionId, "5550000001");

    expect(await checkPhoneCode(sessionId, "5550000002", sentCode(send))).toBe(
      "expired",
    );
  });

  it("only accepts the code in the session that asked for it", async () => {
    const send = fakeClient();
    const sessionId = newSessionId();
    await issuePhoneCode(sessionId, "5550000001");

    expect(
      await checkPhoneCode(newSessionId(), "5550000001", sentCode(send)),
    ).toBe("expired");
  });

  it("allows a new code a minute after the last one, which replaces it", async () => {
    const send = fakeClient();
    const sessionId = newSessionId();
    await issuePhoneCode(sessionId, "5550000001");
    const first = sentCode(send);

    // never fake Date here: better-auth deletes every expired row it sees
    await db
      .update(verificationTable)
      .set({ createdAt: new Date(Date.now() - 61_000) })
      .where(
        eq(verificationTable.identifier, `phone-code:${sessionId}:5550000001`),
      );

    expect(await issuePhoneCode(sessionId, "5550000001")).toEqual({
      ok: true,
    });
    const second = sentCode(send);
    expect(send).toHaveBeenCalledTimes(2);
    if (first !== second) {
      expect(await checkPhoneCode(sessionId, "5550000001", first)).toBe(
        "wrong",
      );
    }
    expect(await checkPhoneCode(sessionId, "5550000001", second)).toBe("ok");
  });

  it("treats a run-out code as absent", async () => {
    const send = fakeClient();
    const sessionId = newSessionId();
    await issuePhoneCode(sessionId, "5550000001");
    await db
      .update(verificationTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        eq(verificationTable.identifier, `phone-code:${sessionId}:5550000001`),
      );

    expect(await checkPhoneCode(sessionId, "5550000001", sentCode(send))).toBe(
      "expired",
    );
  });

  it("reports NetGSM's error and drops the unsent code", async () => {
    fakeClient(async () => ({ status: 200, body: { code: "30" } }));
    const sessionId = newSessionId();

    const result = await issuePhoneCode(sessionId, "5550000001");
    expect(result).toMatchObject({ ok: false, reason: "sms_failed" });
    expect(result.ok === false && result.message).toContain("NetGSM");

    const rows = await db
      .select()
      .from(verificationTable)
      .where(
        and(
          eq(
            verificationTable.identifier,
            `phone-code:${sessionId}:5550000001`,
          ),
        ),
      );
    expect(rows).toEqual([]);
    // no wait after a failed send
    fakeClient();
    expect(await issuePhoneCode(sessionId, "5550000001")).toEqual({
      ok: true,
    });
  });

  it("reports an unreachable NetGSM without logging the code", async () => {
    const send = fakeClient(async () => {
      throw new Error("timeout");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sessionId = newSessionId();

    expect(await issuePhoneCode(sessionId, "5550000001")).toMatchObject({
      ok: false,
      reason: "sms_failed",
    });
    const code = send.mock.calls[0][0][0].msg.match(/(\d{6})/)?.[1];
    expect(code).toBeTruthy();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(code);
  });

  it("prints the code instead of sending it in dry run", async () => {
    const send = vi.fn<NetgsmClient["send"]>(ok);
    vi.mocked(netgsmClient).mockReturnValue({ dryRun: true, send });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const sessionId = newSessionId();

    expect(await issuePhoneCode(sessionId, "5550000001")).toEqual({
      ok: true,
    });
    expect(send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    const [prefix, masked, code] = info.mock.calls[0];
    expect(prefix).toBe("DRY RUN phone code for");
    expect(masked).toBe("••• ••• 00 01");
    expect(await checkPhoneCode(sessionId, "5550000001", String(code))).toBe(
      "ok",
    );
  });
});
