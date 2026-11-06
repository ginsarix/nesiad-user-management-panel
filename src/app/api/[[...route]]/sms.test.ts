import { and, eq, gt, inArray, max } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  authorizedRepresentativeTable,
  memberTable,
} from "@/db/schema";
import type { NetgsmClient } from "@/lib/sms/netgsm";
import { smsRoute } from "./sms";

// Tests never reach NetGSM, whatever SMS_DRY_RUN says; a test may swap in
// another fake for one send
const netgsm = vi.hoisted(() => ({
  client: null as NetgsmClient | null,
}));
vi.mock("@/lib/sms/netgsm", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/sms/netgsm")>();
  return {
    ...mod,
    netgsmClient: () => netgsm.client ?? mod.fakeNetgsmClient,
  };
});

afterEach(() => {
  netgsm.client = null;
});

const createdMemberIds: number[] = [];
const createdRepresentativeIds: number[] = [];

afterAll(async () => {
  if (createdMemberIds.length) {
    await db
      .delete(memberTable)
      .where(inArray(memberTable.id, createdMemberIds));
  }
  if (createdRepresentativeIds.length) {
    await db
      .delete(authorizedRepresentativeTable)
      .where(
        inArray(authorizedRepresentativeTable.id, createdRepresentativeIds),
      );
  }
});

async function createMember(
  phone: string | null,
  extra: Partial<typeof memberTable.$inferInsert> = {},
) {
  const [member] = await db
    .insert(memberTable)
    .values({ title: "__test__ SMS Üyesi", phone, ...extra })
    .returning({ id: memberTable.id });
  createdMemberIds.push(member.id);
  return member.id;
}

async function createRepresentative(
  phone: string | null,
  extra: Partial<typeof authorizedRepresentativeTable.$inferInsert> = {},
) {
  const [representative] = await db
    .insert(authorizedRepresentativeTable)
    .values({ name: "__test__ SMS Yetkilisi", phone, ...extra })
    .returning({ id: authorizedRepresentativeTable.id });
  createdRepresentativeIds.push(representative.id);
  return representative.id;
}

function send(body: unknown) {
  return smsRoute.request("/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sms/send", () => {
  it("sends to the picked member and yetkili and writes the audit row", async () => {
    const memberId = await createMember("0 (535) 406 82 92");
    const representativeId = await createRepresentative("0532 000 00 01");

    const res = await send({
      message: "__test__ Toplantı yarın 10:00'da",
      memberIds: [memberId],
      representativeIds: [representativeId],
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ dryRun: true, recipientCount: 2 });
    expect(body.jobId).toMatch(/^FAKE-/);

    const [audit] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "sms"),
          eq(auditLogTable.entityId, body.jobId),
        ),
      );
    expect(audit.action).toBe("send");
    expect(audit.details).toContainEqual({
      label: "Alıcı sayısı",
      value: "2",
    });
  });

  it("refuses when nobody picked has a phone", async () => {
    const memberId = await createMember(null);

    const res = await send({
      message: "__test__ Telefonsuz",
      memberIds: [memberId],
      representativeIds: [],
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Seçilenler arasında geçerli cep telefonu olan yok",
    });
  });

  it("shows NetGSM's error and writes no audit row when NetGSM refuses", async () => {
    const memberId = await createMember("0532 000 00 02");
    netgsm.client = {
      dryRun: false,
      send: async () => ({ status: 406, body: { code: "40" } }),
    };
    const message = `__test__ Reddedilen ${Date.now()}`;

    const res = await send({
      message,
      memberIds: [memberId],
      representativeIds: [],
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error:
        "Mesaj başlığı (gönderici adı) NetGSM'de tanımlı değil (NetGSM 40)",
    });
    const audits = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "sms"),
          eq(auditLogTable.entityLabel, message),
        ),
      );
    expect(audits).toEqual([]);
  });

  it("warns that the SMS may have gone when NetGSM doesn't answer", async () => {
    const memberId = await createMember("0532 000 00 03");
    netgsm.client = {
      dryRun: false,
      send: async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
    };

    const res = await send({
      message: "__test__ Zaman aşımı",
      memberIds: [memberId],
      representativeIds: [],
    });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("SMS gitmiş olabilir");
  });

  it("requires a recipient", async () => {
    const res = await send({
      message: "__test__ Boş",
      memberIds: [],
      representativeIds: [],
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "En az bir alıcı seçin" });
  });
});

describe("GET /api/sms/celebrations", () => {
  it("lists active members' founding dates and yetkililer's birthdays", async () => {
    const foundedId = await createMember("0532 000 00 11", {
      foundingDate: "2012-02-29",
    });
    const passiveId = await createMember("0532 000 00 12", {
      foundingDate: "2012-02-29",
      status: "passive",
    });
    const candidateId = await createMember("0532 000 00 14", {
      foundingDate: "2012-02-29",
      status: "candidate",
    });
    const rejectedId = await createMember("0532 000 00 15", {
      foundingDate: "2012-02-29",
      status: "rejected",
    });
    const otherDayId = await createMember("0532 000 00 13", {
      foundingDate: "2012-03-01",
    });
    const bornId = await createRepresentative("0535 000 00 11", {
      dateOfBirth: "1980-02-28",
    });

    const res = await smsRoute.request("/celebrations?date=2027-02-28");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.date).toBe("2027-02-28");
    const ours = body.celebrations.filter(
      (c: { contact: { kind: string; id: number } }) =>
        c.contact.kind === "member"
          ? [
              foundedId,
              passiveId,
              candidateId,
              rejectedId,
              otherDayId,
            ].includes(c.contact.id)
          : c.contact.id === bornId,
    );
    expect(ours).toEqual([
      {
        kind: "founding",
        contact: {
          kind: "member",
          id: foundedId,
          name: "__test__ SMS Üyesi",
          phone: "0532 000 00 11",
        },
        date: "2012-02-29",
        years: 15,
        phone: { ok: true, phone: "5320000011" },
      },
      {
        kind: "birthday",
        contact: {
          kind: "representative",
          id: bornId,
          name: "__test__ SMS Yetkilisi",
          phone: "0535 000 00 11",
        },
        date: "1980-02-28",
        years: 47,
        phone: { ok: true, phone: "5350000011" },
      },
    ]);
  });

  it.each([
    "",
    "2027-02-30",
    "28.02.2027",
  ])("refuses the date %j", async (date) => {
    const res = await smsRoute.request(`/celebrations?date=${date}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Geçerli bir tarih girin" });
  });
});

describe("GET /api/sms/contacts", () => {
  it("lists active members only, not passive, candidate or rejected ones", async () => {
    const activeId = await createMember("0532 000 00 21");
    const ids = [
      activeId,
      await createMember("0532 000 00 22", { status: "passive" }),
      await createMember("0532 000 00 23", { status: "candidate" }),
      await createMember("0532 000 00 24", { status: "rejected" }),
    ];

    const { contacts } = (await (
      await smsRoute.request("/contacts")
    ).json()) as {
      contacts: { kind: string; id: number }[];
    };
    const ours = contacts.filter(
      (c) => c.kind === "member" && ids.includes(c.id),
    );
    expect(ours.map((c) => c.id)).toEqual([activeId]);
  });
});

describe("/api/sms/settings", () => {
  function put(body: unknown) {
    return smsRoute.request("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("saves the settings and logs what changed", async () => {
    // the one settings row is shared with the dev panel: put it back after
    const original = await (await smsRoute.request("/settings")).json();
    const [{ maxId }] = await db
      .select({ maxId: max(auditLogTable.id) })
      .from(auditLogTable);
    try {
      const values = {
        ...original,
        sendTime: original.sendTime === "07:45" ? "07:46" : "07:45",
        birthdayMessage: "__test__ {ad}, iyi ki doğdunuz",
      };
      const res = await put(values);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(values);

      const [audit] = await db
        .select()
        .from(auditLogTable)
        .where(
          and(
            gt(auditLogTable.id, maxId ?? 0),
            eq(auditLogTable.action, "settings_update"),
          ),
        );
      expect(audit.changes).toEqual([
        {
          label: "Gönderim saati",
          from: original.sendTime,
          to: values.sendTime,
        },
        {
          label: "Doğum günü mesajı",
          from: original.birthdayMessage,
          to: values.birthdayMessage,
        },
      ]);
    } finally {
      await put(original);
      await db
        .delete(auditLogTable)
        .where(
          and(
            gt(auditLogTable.id, maxId ?? 0),
            eq(auditLogTable.action, "settings_update"),
          ),
        );
    }
  });

  it.each([
    [{ sendTime: "24:00" }, "Saati ss:dd olarak girin"],
    [
      { foundingMessage: "Sayın {isim}" },
      "Tanınmayan alan: {isim}. Kullanılabilenler: {ad}, {yil}",
    ],
    [{ birthdayMessage: "  " }, "Mesaj yazın"],
  ])("refuses %j", async (override, error) => {
    const res = await put({
      autoEnabled: false,
      sendTime: "09:00",
      foundingMessage: "{ad}",
      birthdayMessage: "{ad}",
      ...override,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});

describe("/api/sms/notice-settings", () => {
  function put(body: unknown) {
    return smsRoute.request("/notice-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function cleanAudit(maxId: number | null) {
    await db
      .delete(auditLogTable)
      .where(
        and(
          gt(auditLogTable.id, maxId ?? 0),
          eq(auditLogTable.action, "notice_settings_update"),
        ),
      );
  }

  it("creates the notice settings with the defaults", async () => {
    const res = await smsRoute.request("/notice-settings");
    expect(res.status).toBe(200);
    const body = await res.json();
    // another test (or staff) may have edited them; the keys are what matters
    expect(Object.keys(body).sort()).toEqual([
      "acceptedEmailBody",
      "acceptedEmailSubject",
      "acceptedSms",
      "rejectedEmailBody",
      "rejectedEmailSubject",
      "rejectedSms",
    ]);
    expect(body.acceptedSms).toContain("{ad}");
  });

  it("refuses an unknown placeholder", async () => {
    const original = await (await smsRoute.request("/notice-settings")).json();
    const res = await put({ ...original, acceptedSms: "Sayın {ad} {yil}" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Tanınmayan alan: {yil}. Kullanılabilenler: {ad}, {firma}",
    });
  });

  it("audits a template change", async () => {
    const original = await (await smsRoute.request("/notice-settings")).json();
    const [{ maxId }] = await db
      .select({ maxId: max(auditLogTable.id) })
      .from(auditLogTable);
    try {
      const values = { ...original, rejectedSms: "__test__ {ad} {firma}" };
      const res = await put(values);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(values);

      const [audit] = await db
        .select()
        .from(auditLogTable)
        .where(
          and(
            gt(auditLogTable.id, maxId ?? 0),
            eq(auditLogTable.action, "notice_settings_update"),
          ),
        );
      expect(audit.changes).toEqual([
        {
          label: "Red SMS'i",
          from: original.rejectedSms,
          to: values.rejectedSms,
        },
      ]);
    } finally {
      await put(original);
      await cleanAudit(maxId);
    }
  });

  it("doesn't affect the celebration settings", async () => {
    const celebration = await (await smsRoute.request("/settings")).json();
    const original = await (await smsRoute.request("/notice-settings")).json();
    const [{ maxId }] = await db
      .select({ maxId: max(auditLogTable.id) })
      .from(auditLogTable);
    try {
      await put({ ...original, acceptedSms: "__test__ {ad}" });
      expect(await (await smsRoute.request("/settings")).json()).toEqual(
        celebration,
      );
    } finally {
      await put(original);
      await cleanAudit(maxId);
    }
  });
});
