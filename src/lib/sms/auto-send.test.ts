import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLogTable, smsSendTable } from "@/db/schema";
import { runAutoSms } from "./auto-send";
import type { Celebration } from "./celebrations";
import { fakeNetgsmClient, type NetgsmClient } from "./netgsm";
import type { SmsSettings } from "./settings";
import { DEFAULT_MESSAGES } from "./templates";

// 2099-06-15 10:00 in Istanbul; far enough out to never meet real sends
const NOW = new Date("2099-06-15T07:00:00Z");
const DATE = "2099-06-15";

const settings: SmsSettings = {
  id: 1,
  autoEnabled: true,
  sendTime: "09:00",
  foundingMessage: DEFAULT_MESSAGES.founding,
  birthdayMessage: "{ad}, {yil}. yaş gününüz kutlu olsun",
  updatedAt: new Date(),
};

// sms_send has no foreign keys; negative ids can't meet real contacts
let nextId = -990_000;
const usedIds: number[] = [];

afterAll(async () => {
  await db.delete(smsSendTable).where(inArray(smsSendTable.contactId, usedIds));
});

function birthday(phone: string | null): Celebration {
  const id = nextId--;
  usedIds.push(id);
  return {
    kind: "birthday",
    contact: {
      kind: "representative",
      id,
      name: `__test__ Oto Yetkili ${-id}`,
      phone,
    },
    date: "1980-06-15",
    years: 119,
    phone: phone
      ? { ok: true, phone: phone.replace(/\D/g, "").slice(-10) }
      : { ok: false, reason: "no_phone" },
  };
}

/** A client that records what it was asked to send */
function recordingClient(answer: NetgsmClient["send"] = fakeNetgsmClient.send) {
  const sent: { no: string; msg: string }[][] = [];
  const client: NetgsmClient = {
    dryRun: true,
    send: async (messages) => {
      sent.push(messages);
      return answer(messages);
    },
  };
  return { client, sent };
}

async function rowsOf(celebrations: Celebration[]) {
  return db
    .select()
    .from(smsSendTable)
    .where(
      inArray(
        smsSendTable.contactId,
        celebrations.map((c) => c.contact.id),
      ),
    );
}

describe("runAutoSms", () => {
  it("sends each celebration once, even when run again (a restart)", async () => {
    const people = [birthday("0532 000 00 21"), birthday("0532 000 00 22")];
    const { client, sent } = recordingClient();
    const deps = { settings, client, loadCelebrations: async () => people };

    const first = await runAutoSms(NOW, deps);
    const second = await runAutoSms(new Date(NOW.getTime() + 5 * 60_000), deps);

    expect(first).toMatchObject({ status: "sent", date: DATE, count: 2 });
    expect(second).toEqual({
      status: "nothing_to_send",
      date: DATE,
      celebrations: 2,
    });
    expect(sent).toEqual([
      [
        {
          no: "5320000021",
          msg: `${people[0].contact.name}, 119. yaş gününüz kutlu olsun`,
        },
        {
          no: "5320000022",
          msg: `${people[1].contact.name}, 119. yaş gününüz kutlu olsun`,
        },
      ],
    ]);

    const rows = await rowsOf(people);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        kind: "birthday",
        celebrationDate: DATE,
        years: 119,
        status: "sent",
        jobId: first.status === "sent" ? first.jobId : null,
      });
      expect(row.sentAt).toBeInstanceOf(Date);
    }

    const [audit] = await db
      .select()
      .from(auditLogTable)
      .where(
        inArray(auditLogTable.entityId, [
          first.status === "sent" ? first.jobId : "",
        ]),
      );
    expect(audit).toMatchObject({ action: "auto_send", actorId: null });
  });

  it("sends once when two runs overlap", async () => {
    const people = [birthday("0532 000 00 23"), birthday("0532 000 00 24")];
    const { client, sent } = recordingClient();
    const deps = { settings, client, loadCelebrations: async () => people };

    const results = await Promise.all([
      runAutoSms(NOW, deps),
      runAutoSms(NOW, deps),
    ]);

    expect(sent.flat()).toHaveLength(2);
    expect(results.map((r) => r.status).sort()).toEqual([
      "nothing_to_send",
      "sent",
    ]);
  });

  it("sends someone added later the same day, and only them", async () => {
    const early = birthday("0532 000 00 25");
    const late = birthday("0532 000 00 26");
    const { client, sent } = recordingClient();

    await runAutoSms(NOW, {
      settings,
      client,
      loadCelebrations: async () => [early],
    });
    await runAutoSms(NOW, {
      settings,
      client,
      loadCelebrations: async () => [early, late],
    });

    expect(sent.map((batch) => batch.map((m) => m.no))).toEqual([
      ["5320000025"],
      ["5320000026"],
    ]);
  });

  it("skips people without a mobile", async () => {
    const people = [birthday(null)];
    const { client, sent } = recordingClient();

    expect(
      await runAutoSms(NOW, {
        settings,
        client,
        loadCelebrations: async () => people,
      }),
    ).toEqual({ status: "nothing_to_send", date: DATE, celebrations: 1 });
    expect(sent).toEqual([]);
    expect(await rowsOf(people)).toEqual([]);
  });

  it("does nothing before the send time or when turned off", async () => {
    const people = [birthday("0532 000 00 27")];
    const { client, sent } = recordingClient();
    const loadCelebrations = vi.fn(async () => people);

    expect(
      await runAutoSms(NOW, {
        settings: { ...settings, sendTime: "10:01" },
        client,
        loadCelebrations,
      }),
    ).toEqual({ status: "not_due", date: DATE, sendTime: "10:01" });
    expect(
      await runAutoSms(NOW, {
        settings: { ...settings, autoEnabled: false },
        client,
        loadCelebrations,
      }),
    ).toEqual({ status: "disabled" });

    expect(loadCelebrations).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("marks a refused send as failed and doesn't retry it", async () => {
    const people = [birthday("0532 000 00 28")];
    const { client, sent } = recordingClient(async () => ({
      status: 406,
      body: { code: "80" },
    }));
    const deps = { settings, client, loadCelebrations: async () => people };

    expect(await runAutoSms(NOW, deps)).toEqual({
      status: "failed",
      date: DATE,
      count: 1,
      error: "NetGSM gönderim sınırı aşıldı (NetGSM 80)",
    });
    expect(await runAutoSms(NOW, deps)).toMatchObject({
      status: "nothing_to_send",
    });
    expect(sent).toHaveLength(1);
    expect(await rowsOf(people)).toMatchObject([
      {
        status: "failed",
        jobId: null,
        error: "NetGSM gönderim sınırı aşıldı (NetGSM 80)",
      },
    ]);
  });

  it("marks a send without an answer as unknown and doesn't retry it", async () => {
    const people = [birthday("0532 000 00 29")];
    const { client, sent } = recordingClient(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const deps = { settings, client, loadCelebrations: async () => people };

    expect(await runAutoSms(NOW, deps)).toMatchObject({
      status: "unknown",
      count: 1,
    });
    expect(await runAutoSms(NOW, deps)).toMatchObject({
      status: "nothing_to_send",
    });
    expect(sent).toHaveLength(1);
    expect(await rowsOf(people)).toMatchObject([{ status: "unknown" }]);
  });
});
