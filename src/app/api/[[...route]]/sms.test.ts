import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  auditLogTable,
  authorizedRepresentativeTable,
  memberTable,
} from "@/db/schema";
import { smsRoute } from "./sms";

// Tests never reach NetGSM, whatever SMS_DRY_RUN says
vi.mock("@/lib/sms/netgsm", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/sms/netgsm")>();
  return { ...mod, netgsmClient: () => mod.fakeNetgsmClient };
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

async function createMember(phone: string | null) {
  const [member] = await db
    .insert(memberTable)
    .values({ title: "__test__ SMS Üyesi", phone })
    .returning({ id: memberTable.id });
  createdMemberIds.push(member.id);
  return member.id;
}

async function createRepresentative(phone: string | null) {
  const [representative] = await db
    .insert(authorizedRepresentativeTable)
    .values({ name: "__test__ SMS Yetkilisi", phone })
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
