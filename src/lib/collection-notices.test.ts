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
import { authorizedRepresentativeTable, userTable } from "@/db/schema";
import { getCollectionNoticeSettings } from "./collection-notice-settings";
import { sendCollectionNotices } from "./collection-notices";
import type { NetgsmClient } from "./sms/netgsm";
import { fillTemplate } from "./sms/templates";

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
const representativeIds: number[] = [];

async function insertUser(key: string, phone: string, banned = false) {
  const id = `__test__${key}-${suffix}`;
  await db.insert(userTable).values({
    id,
    name: `__test__ ${key}`,
    email: `__test__${key}-${suffix}@example.com`,
    emailVerified: true,
    phone,
    banned,
  });
  userIds.push(id);
  return id;
}

let actor: string;
let representative: number;

beforeAll(async () => {
  actor = await insertUser("kaydeden", "+905320000001");
  await insertUser("diger", "+905320000002");
  await insertUser("engelli", "+905320000003", true);
  const [row] = await db
    .insert(authorizedRepresentativeTable)
    .values({
      name: `__test__ Yetkili ${suffix}`,
      email: `__test__yetkili-${suffix}@example.com`,
      phone: "0532 000 00 09",
    })
    .returning({ id: authorizedRepresentativeTable.id });
  representative = row.id;
  representativeIds.push(representative);
});

afterEach(() => {
  sentSms.length = 0;
  mail.sendEmail.mockReset();
  mail.sendEmail.mockResolvedValue(undefined);
});

afterAll(async () => {
  await db.delete(userTable).where(inArray(userTable.id, userIds));
  await db
    .delete(authorizedRepresentativeTable)
    .where(inArray(authorizedRepresentativeTable.id, representativeIds));
});

function collection(overrides: Record<string, unknown> = {}) {
  return {
    representativeId: representative,
    representativeName: `__test__ Yetkili ${suffix}`,
    amount: "1250.50",
    date: "2026-11-01",
    categoryName: "Aidat",
    methodName: "Kart",
    projectName: null,
    projectNumber: null,
    ...overrides,
  };
}

const emailsTo = (address: string) =>
  mail.sendEmail.mock.calls.filter(([message]) => message.to === address);

describe("sendCollectionNotices", () => {
  it("sends the yetkili's email and SMS from the yetkili templates", async () => {
    const settings = await getCollectionNoticeSettings();
    const values = {
      yetkili: `__test__ Yetkili ${suffix}`,
      tutar: "1.250,50 TL",
      tarih: "01.11.2026",
      tur: "Aidat",
      tip: "Kart",
      proje: "-",
    };

    const result = await sendCollectionNotices(collection(), actor);

    expect(result.representative).toEqual({ email: "sent", sms: "sent" });
    expect(emailsTo(`__test__yetkili-${suffix}@example.com`)).toEqual([
      [
        {
          to: `__test__yetkili-${suffix}@example.com`,
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
      yetkili: `__test__ Yetkili ${suffix}`,
      tutar: "1.250,50 TL",
      tarih: "01.11.2026",
      tur: "Aidat",
      tip: "Kart",
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

  it("skips the yetkili's channels without an address or a mobile number", async () => {
    const [bare] = await db
      .insert(authorizedRepresentativeTable)
      .values({
        name: `__test__ Adressiz ${suffix}`,
        // a landline can't take an SMS
        phone: "0384 213 11 11",
      })
      .returning({ id: authorizedRepresentativeTable.id });
    representativeIds.push(bare.id);

    const result = await sendCollectionNotices(
      collection({
        representativeId: bare.id,
        representativeName: `__test__ Adressiz ${suffix}`,
      }),
      actor,
    );
    expect(result.representative).toEqual({
      email: "skipped",
      sms: "skipped",
    });
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
