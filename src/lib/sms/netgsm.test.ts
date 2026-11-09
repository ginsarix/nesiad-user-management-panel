import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import {
  decodeSendResponse,
  fakeNetgsmClient,
  netgsmClient,
  realNetgsmClient,
  SEND_ERROR_MESSAGES,
} from "./netgsm";

// vitest.config.ts sets SMS_DRY_RUN=true for every test worker, so a test
// that reaches the unmocked client can't send a real SMS even when the local
// .env (loaded first by dotenv/config) says SMS_DRY_RUN=false
describe("test run dry-run guard", () => {
  it("runs every test in SMS dry run", () => {
    expect(process.env.SMS_DRY_RUN).toBe("true");
    expect(env.SMS_DRY_RUN).toBe(true);
    expect(netgsmClient()).toBe(fakeNetgsmClient);
    expect(netgsmClient().dryRun).toBe(true);
  });
});

describe("decodeSendResponse", () => {
  it("reads the job id from a success", () => {
    expect(
      decodeSendResponse({
        status: 200,
        body: {
          code: "00",
          jobid: "17377215342605050417149344",
          description: "queued",
        },
      }),
    ).toEqual({ ok: true, jobId: "17377215342605050417149344" });
  });

  it.each([
    "20",
    "30",
    "40",
    "50",
    "51",
    "70",
    "80",
    "85",
  ])("turns error %s into its Turkish message", (code) => {
    expect(
      decodeSendResponse({ status: 406, body: { code, description: "x" } }),
    ).toEqual({ ok: false, code, message: SEND_ERROR_MESSAGES[code] });
  });

  it("accepts the code as a number", () => {
    expect(decodeSendResponse({ status: 200, body: { code: 30 } })).toEqual({
      ok: false,
      code: "30",
      message: SEND_ERROR_MESSAGES["30"],
    });
  });

  it.each([
    ["an unknown code", { status: 200, body: { code: "99" } }, "99"],
    ["success without a job id", { status: 200, body: { code: "00" } }, "00"],
    ["a text body", { status: 500, body: "Internal Server Error" }, "HTTP 500"],
    ["an empty body", { status: 502, body: "" }, "HTTP 502"],
  ])("reports %s as unexpected", (_, raw, code) => {
    expect(decodeSendResponse(raw)).toEqual({
      ok: false,
      code,
      message: "NetGSM beklenmeyen bir yanıt verdi",
    });
  });
});

describe("realNetgsmClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the messages with Basic auth, Turkish encoding and no İYS check", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "00", jobid: "123" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const raw = await realNetgsmClient.send([
      { no: "5354068292", msg: "Merhaba" },
    ]);

    expect(raw).toEqual({ status: 200, body: { code: "00", jobid: "123" } });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.netgsm.com.tr/sms/rest/v2/send");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${btoa(`${env.NETGSM_USERNAME}:${env.NETGSM_PASSWORD}`)}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      msgheader: env.NETGSM_HEADER,
      messages: [{ no: "5354068292", msg: "Merhaba" }],
      encoding: "TR",
      iysfilter: "0",
    });
  });

  it("keeps a body that isn't JSON as text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad Gateway", { status: 502 })),
    );

    expect(await realNetgsmClient.send([])).toEqual({
      status: 502,
      body: "Bad Gateway",
    });
  });
});
