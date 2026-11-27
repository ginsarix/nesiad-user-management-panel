import { inArray } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { memberTable, userTable } from "@/db/schema";
import { getCollectionNoticeSettings } from "./collection-notice-settings";
import { sendCollectionNotices } from "./collection-notices";
import type { NetgsmClient } from "./sms/netgsm";
import {
  COLLECTION_NOTICE_PLACEHOLDERS,
  DEFAULT_COLLECTION_NOTICE_TEMPLATES,
  fillTemplate,
} from "./sms/templates";

const mail = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/mail", () => mail);

// every SMS this file sends, captured instead of reaching NetGSM
const sentSms: { no: string; msg: string }[] = [];
vi.mock("@/lib/sms/netgsm", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./sms/netgsm")>();
  const client: NetgsmClient = {
    dryRun: true,
    async send(messages) {
      sentSms.push(...messages);
      return mod.fakeNetgsmClient.send(messages);
    },
  };
  return { ...mod, netgsmClient: () => client };
});

const suffix = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];
const memberIds: number[] = [];
const memberName = `__test__ Ali Üye ${suffix}`;

async function insertUser(
  key: string,
  phone: string,
  banned = false,
  prefs: { collectionSms?: boolean; collectionEmail?: boolean } = {},
) {
  const id = `__test__${key}-${suffix}`;
  await db.insert(userTable).values({
    id,
    name: `__test__ ${key}`,
    email: `__test__${key}-${suffix}@example.com`,
    emailVerified: true,
    phone,
    banned,
    ...prefs,
  });
  userIds.push(id);
  return id;
}

let actor: string;
let member: number;

beforeAll(async () => {
  actor = await insertUser("kaydeden", "+905320000001");
  await insertUser("diger", "+905320000002");
  await insertUser("engelli", "+905320000003", true);
  await insertUser("smsKapali", "+905320000004", false, {
    collectionSms: false,
  });
  await insertUser("epostaKapali", "+905320000005", false, {
    collectionEmail: false,
  });
  await insertUser("ikisiKapali", "+905320000006", false, {
    collectionSms: false,
    collectionEmail: false,
  });
  const [row] = await db
    .insert(memberTable)
    .values({
      firstName: "__test__ Ali",
      lastName: `Üye ${suffix}`,
      email: `__test__uye-${suffix}@example.com`,
      mobilePhone: "0532 000 00 09",
    })
    .returning({ id: memberTable.id });
  member = row.id;
  memberIds.push(member);
});

afterEach(() => {
  sentSms.length = 0;
  mail.sendEmail.mockReset();
  mail.sendEmail.mockResolvedValue(undefined);
});

afterAll(async () => {
  await db.delete(userTable).where(inArray(userTable.id, userIds));
  await db.delete(memberTable).where(inArray(memberTable.id, memberIds));
});

function collection(overrides: Record<string, unknown> = {}) {
  return {
    memberId: member,
    memberName,
    amount: "1250.50",
    date: "2026-11-01",
    categoryName: "Aidat",
    cashAccountName: "Merkez Kasa",
    projectName: null,
    projectNumber: null,
    ...overrides,
  };
}

const emailsTo = (address: string) =>
  mail.sendEmail.mock.calls.filter(([message]) => message.to === address);

describe("sendCollectionNotices", () => {
  it("sends the member's email and SMS from the member templates", async () => {
    const settings = await getCollectionNoticeSettings();
    const values = {
      uye: memberName,
      tutar: "1.250,50 TL",
      tarih: "01.11.2026",
      tur: "Aidat",
      kasa: "Merkez Kasa",
      proje: "-",
    };

    const result = await sendCollectionNotices(collection(), actor);

    expect(result.member).toEqual({ email: "sent", sms: "sent" });
    expect(emailsTo(`__test__uye-${suffix}@example.com`)).toEqual([
      [
        {
          to: `__test__uye-${suffix}@example.com`,
          subject: fillTemplate(settings.representativeEmailSubject, values),
          text: fillTemplate(settings.representativeEmailBody, values),
        },
      ],
    ]);
    expect(sentSms).toContainEqual({
      no: "5320000009",
      msg: fillTemplate(settings.representativeSms, values),
    });
  });

  it("notifies active panel users but not the recorder or disabled accounts", async () => {
    const settings = await getCollectionNoticeSettings();
    await sendCollectionNotices(
      collection({ projectName: "Kreş", projectNumber: "PR-7" }),
      actor,
    );

    const staffValues = {
      uye: memberName,
      tutar: "1.250,50 TL",
      tarih: "01.11.2026",
      tur: "Aidat",
      kasa: "Merkez Kasa",
      proje: "Kreş (PR-7)",
    };
    expect(emailsTo(`__test__diger-${suffix}@example.com`)).toEqual([
      [
        {
          to: `__test__diger-${suffix}@example.com`,
          subject: fillTemplate(settings.staffEmailSubject, staffValues),
          text: fillTemplate(settings.staffEmailBody, staffValues),
        },
      ],
    ]);
    expect(sentSms).toContainEqual({
      no: "5320000002",
      msg: fillTemplate(settings.staffSms, staffValues),
    });

    expect(emailsTo(`__test__kaydeden-${suffix}@example.com`)).toEqual([]);
    expect(emailsTo(`__test__engelli-${suffix}@example.com`)).toEqual([]);
    expect(sentSms.some((sms) => sms.no === "5320000001")).toBe(false);
    expect(sentSms.some((sms) => sms.no === "5320000003")).toBe(false);
  });

  it("leaves each panel user out of the channels they turned off", async () => {
    await sendCollectionNotices(collection(), actor);

    expect(emailsTo(`__test__smsKapali-${suffix}@example.com`)).toHaveLength(1);
    expect(sentSms.some((sms) => sms.no === "5320000004")).toBe(false);

    expect(emailsTo(`__test__epostaKapali-${suffix}@example.com`)).toEqual([]);
    expect(sentSms.some((sms) => sms.no === "5320000005")).toBe(true);

    expect(emailsTo(`__test__ikisiKapali-${suffix}@example.com`)).toEqual([]);
    expect(sentSms.some((sms) => sms.no === "5320000006")).toBe(false);

    // the existing rules still hold
    expect(emailsTo(`__test__engelli-${suffix}@example.com`)).toEqual([]);
    expect(sentSms.some((sms) => sms.no === "5320000001")).toBe(false);
  });

  it("skips the member's channels without an address or a mobile number", async () => {
    const [bare] = await db
      .insert(memberTable)
      .values({
        firstName: `__test__ Adressiz ${suffix}`,
        lastName: "",
        // a landline can't take an SMS
        mobilePhone: "0384 213 11 11",
      })
      .returning({ id: memberTable.id });
    memberIds.push(bare.id);

    const result = await sendCollectionNotices(
      collection({
        memberId: bare.id,
        memberName: `__test__ Adressiz ${suffix}`,
      }),
      actor,
    );
    expect(result.member).toEqual({
      email: "skipped",
      sms: "skipped",
    });
  });

  it("tahsilat notice fills {uye}", async () => {
    expect(Object.keys(COLLECTION_NOTICE_PLACEHOLDERS)).toContain("uye");
    expect(Object.keys(COLLECTION_NOTICE_PLACEHOLDERS)).not.toContain(
      "yetkili",
    );
    for (const template of Object.values(DEFAULT_COLLECTION_NOTICE_TEMPLATES)) {
      expect(template).not.toContain("{yetkili}");
    }
    expect(DEFAULT_COLLECTION_NOTICE_TEMPLATES.staffEmailBody).toContain(
      "Üye: {uye}",
    );

    // the stored texts were moved to {uye} by the conversion
    const settings = await getCollectionNoticeSettings();
    await sendCollectionNotices(collection(), actor);
    const sms = sentSms.find((message) => message.no === "5320000009");
    expect(sms?.msg).toBe(
      fillTemplate(settings.representativeSms, {
        uye: memberName,
        tutar: "1.250,50 TL",
        tarih: "01.11.2026",
        tur: "Aidat",
        kasa: "Merkez Kasa",
        proje: "-",
      }),
    );
    expect(sms?.msg).not.toContain("{uye}");
    if (settings.representativeSms.includes("{uye}")) {
      expect(sms?.msg).toContain(memberName);
    }
  });

  it("counts each panel-user outcome", async () => {
    // one panel user's email fails
    mail.sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === `__test__diger-${suffix}@example.com`) throw new Error("x");
    });
    const result = await sendCollectionNotices(collection(), actor);
    expect(result.staff.email.failed).toBeGreaterThanOrEqual(1);
    expect(result.staff.sms.sent).toBeGreaterThanOrEqual(1);
  });
});
