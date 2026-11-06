import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLogTable, memberTable, userTable } from "@/db/schema";
import { deleteFile, readStoredFile } from "@/lib/file-storage";
import { sendEmail } from "@/lib/mail";
import { MAX_REQUEST_SIZE } from "@/lib/zod-schemas/member";
import { applicationsRoute } from "./applications";

vi.mock("@/lib/mail", () => ({ sendEmail: vi.fn(async () => {}) }));

// The route sends the panel notification without waiting for it, so a test
// can end while its email is still on the way. Remember each notification so
// the next test can wait for it before looking at `sendEmail`.
const pendingNotifications: Promise<unknown>[] = [];
vi.mock("@/lib/application-emails", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/application-emails")>();
  return {
    ...original,
    notifyPanelUsersOfApplication: (
      ...args: Parameters<typeof original.notifyPanelUsersOfApplication>
    ) => {
      const done = original.notifyPanelUsersOfApplication(...args);
      pendingNotifications.push(done.catch(() => {}));
      return done;
    },
  };
});

// remember every stored file so the tests can check and clean up
const storedFiles: string[] = [];
vi.mock("@/lib/file-storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/file-storage")>();
  return {
    ...original,
    createFile: vi.fn(
      async (params: Parameters<typeof original.createFile>[0]) => {
        const name = await original.createFile(params);
        storedFiles.push(name);
        return name;
      },
    ),
  };
});

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const png = (name = "a.png") => new File([PNG], name, { type: "image/png" });
const pdf = (name = "a.pdf") =>
  new File([PDF], name, { type: "application/pdf" });

const userIds: string[] = [];

const titles: string[] = [];

afterAll(async () => {
  if (titles.length) {
    await db.delete(memberTable).where(inArray(memberTable.title, titles));
  }
  if (userIds.length) {
    await db.delete(userTable).where(inArray(userTable.id, userIds));
  }
  await Promise.all(storedFiles.map(deleteFile));
});

beforeEach(async () => {
  await Promise.all(pendingNotifications.splice(0));
  vi.mocked(sendEmail).mockClear();
});

let counter = 0;
function newTitle() {
  const title = `__test__app ${crypto.randomUUID()}`;
  titles.push(title);
  return title;
}
function newIp() {
  counter += 1;
  return `test-ip-${crypto.randomUUID()}-${counter}`;
}

function fields(title: string, overrides: Record<string, string | File> = {}) {
  return {
    applicantFirstName: "Ayşe",
    applicantLastName: "Yılmaz",
    birthDate: "1990-02-01",
    birthPlace: "Nevşehir",
    nationalId: "10000000146",
    gender: "female",
    education: "Lisans",
    mobilePhone: "0532 123 45 67",
    email: "ayse@example.com",
    title,
    applicantRole: "Başkan",
    employeeCount: "12",
    address: "Nevşehir Merkez",
    phone: "0384 213 00 00",
    website: "ornek.com",
    companyIntro: "Bir. İki. Üç.",
    referenceName: "Mehmet Demir",
    otherAssociations: "",
    logo: png("logo.png"),
    identityDocument: pdf("kimlik.pdf"),
    activityDocument: png("faaliyet.PNG"),
    consentRules: "true",
    consentData: "true",
    ...overrides,
  };
}

function submit(
  values: Record<string, string | File>,
  ip: string | undefined = newIp(),
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.append(key, value);
  return applicationsRoute.request("/", {
    method: "POST",
    body,
    headers: ip ? { "x-real-ip": ip } : {},
  });
}

async function findByTitle(title: string) {
  const [row] = await db
    .select()
    .from(memberTable)
    .where(eq(memberTable.title, title));
  return row;
}

describe("POST /api/applications", () => {
  it("creates a candidate with its files", async () => {
    const title = newTitle();

    const res = await submit(fields(title, { otherAssociations: "  " }));

    expect(res.status).toBe(201);
    const member = await findByTitle(title);
    expect(member).toMatchObject({
      status: "candidate",
      applicantFirstName: "Ayşe",
      applicantLastName: "Yılmaz",
      birthDate: "1990-02-01",
      birthPlace: "Nevşehir",
      nationalId: "10000000146",
      gender: "female",
      education: "Lisans",
      mobilePhone: "0532 123 45 67",
      email: "ayse@example.com",
      applicantRole: "Başkan",
      employeeCount: 12,
      address: "Nevşehir Merkez",
      phone: "0384 213 00 00",
      website: "https://ornek.com",
      referenceName: "Mehmet Demir",
      otherAssociations: null,
    });
    expect(member.consentedAt).toBeInstanceOf(Date);
    for (const file of [
      member.logo,
      member.identityDocument,
      member.activityDocument,
    ]) {
      expect(file).toBeTruthy();
      expect(await readStoredFile(file as string)).not.toBeNull();
    }
  });

  it("writes no audit entry", async () => {
    const title = newTitle();

    await submit(fields(title));

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.entityLabel, title));
    expect(rows).toEqual([]);
  });

  it("doesn't return the record id", async () => {
    const res = await submit(fields(newTitle()));

    expect(Object.keys(await res.json())).toEqual(["message"]);
  });

  it("ignores a status field in the request", async () => {
    const title = newTitle();

    await submit(fields(title, { status: "active" }));

    expect((await findByTitle(title)).status).toBe("candidate");
  });

  it("reports the failing field", async () => {
    const title = newTitle();

    const res = await submit(fields(title, { nationalId: "12345678901" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Geçerli bir TC Kimlik No girin",
      field: "nationalId",
    });
    expect(await findByTitle(title)).toBeUndefined();
  });

  it("refuses a logo that's a PDF and stores nothing", async () => {
    const title = newTitle();
    const before = storedFiles.length;

    const res = await submit(fields(title, { logo: pdf("logo.png") }));

    expect(res.status).toBe(415);
    expect((await res.json()).field).toBe("logo");
    expect(await findByTitle(title)).toBeUndefined();
    expect(storedFiles.length).toBe(before);
  });

  it("removes the stored files when a later upload is refused", async () => {
    const title = newTitle();
    const before = storedFiles.length;
    const fake = new File([Buffer.from("not a document")], "x.pdf", {
      type: "application/pdf",
    });

    const res = await submit(fields(title, { activityDocument: fake }));

    expect(res.status).toBe(415);
    expect((await res.json()).field).toBe("activityDocument");
    const written = storedFiles.slice(before);
    expect(written).toHaveLength(2);
    for (const name of written) expect(await readStoredFile(name)).toBeNull();
    expect(await findByTitle(title)).toBeUndefined();
  });

  it("fails cleanly when the insert fails, without logging personal data", async () => {
    const ip = newIp();
    const before = storedFiles.length;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const spy = vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw new Error("insert ... params: 10000000146, 0532 123 45 67");
    });

    const res = await submit(fields(newTitle()), ip);
    spy.mockRestore();
    const logged = JSON.stringify(log.mock.calls);
    log.mockRestore();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Başvuru kaydedilemedi. Lütfen tekrar deneyin.",
    });
    expect(logged).not.toContain("10000000146");
    expect(logged).not.toContain("0532");
    const written = storedFiles.slice(before);
    expect(written).toHaveLength(3);
    for (const name of written) expect(await readStoredFile(name)).toBeNull();
    // the failure didn't use up the allowance
    for (let i = 0; i < 5; i++) {
      expect((await submit(fields(newTitle()), ip)).status).toBe(201);
    }
  });

  it("refuses control characters in title with the field", async () => {
    for (const title of ["A\u0000B", "A\u0007\u202eB"]) {
      const res = await submit(fields(title));

      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe("title");
    }
  });

  it("saves nothing when the trap field is filled", async () => {
    const title = newTitle();
    const before = storedFiles.length;

    const res = await submit(fields(title, { leaveBlank: "123" }));

    expect(res.status).toBe(201);
    expect(await findByTitle(title)).toBeUndefined();
    expect(storedFiles.length).toBe(before);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses over-limit bodies", async () => {
    const big = new File([new Uint8Array(MAX_REQUEST_SIZE + 1)], "big.png", {
      type: "image/png",
    });

    const res = await submit(fields(newTitle(), { logo: big }));

    expect(res.status).toBe(413);
    expect(await res.json()).toHaveProperty("error");
  });

  it("limits by x-real-ip only after saved submissions", async () => {
    const ip = newIp();
    for (let i = 0; i < 6; i++) {
      const res = await submit(
        fields(newTitle(), { nationalId: "12345678901" }),
        ip,
      );
      expect(res.status).toBe(400);
    }

    for (let i = 0; i < 5; i++) {
      expect((await submit(fields(newTitle()), ip)).status).toBe(201);
    }
    const title = newTitle();
    const limited = await submit(fields(title), ip);

    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatch(/Çok fazla başvuru/);
    expect(await findByTitle(title)).toBeUndefined();

    // no header: not limited
    const unlimited = await submit(fields(newTitle()), "");
    expect(unlimited.status).toBe(201);
  });

  it("doesn't use up the allowance on a refused upload", async () => {
    const ip = newIp();
    for (let i = 0; i < 6; i++) {
      const res = await submit(fields(newTitle(), { logo: pdf("l.png") }), ip);
      expect(res.status).toBe(415);
    }

    for (let i = 0; i < 5; i++) {
      expect((await submit(fields(newTitle()), ip)).status).toBe(201);
    }
  });

  it("holds the limit under a parallel burst", async () => {
    const ip = newIp();
    const burst = Array.from({ length: 7 }, () => newTitle());
    const before = storedFiles.length;

    const responses = await Promise.all(
      burst.map((title) => submit(fields(title), ip)),
    );

    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429, 429]);
    const rows = await db
      .select({ title: memberTable.title })
      .from(memberTable)
      .where(inArray(memberTable.title, burst));
    expect(rows).toHaveLength(5);
    expect(storedFiles.length - before).toBe(15);
  });

  it("still succeeds when the panel email fails", async () => {
    // CI's database starts empty, and with no recipient no email is attempted
    const id = `__test__${crypto.randomUUID()}`;
    userIds.push(id);
    await db.insert(userTable).values({
      id,
      name: "__test__ Panel User",
      email: `${id}@example.com`,
      emailVerified: true,
    });
    vi.mocked(sendEmail).mockRejectedValue(new Error("smtp down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const title = newTitle();

      const res = await submit(fields(title));

      expect(res.status).toBe(201);
      expect(await findByTitle(title)).toBeDefined();
      await vi.waitFor(() => expect(sendEmail).toHaveBeenCalled());
    } finally {
      vi.mocked(sendEmail).mockReset();
      vi.mocked(sendEmail).mockResolvedValue(undefined);
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
      log.mockRestore();
    }
  });

  it("emails only verified, non-banned users", async () => {
    const tag = crypto.randomUUID();
    const users = [
      { key: "verified", emailVerified: true, banned: false },
      { key: "unverified", emailVerified: false, banned: false },
      { key: "banned", emailVerified: true, banned: true },
      { key: "unset", emailVerified: true, banned: null },
    ].map((user) => ({
      ...user,
      id: `__test__${tag}-${user.key}`,
      email: `__test__${tag}-${user.key}@example.com`,
    }));
    userIds.push(...users.map((u) => u.id));
    await db.insert(userTable).values(
      users.map((u) => ({
        id: u.id,
        name: "__test__ Secret Name",
        email: u.email,
        emailVerified: u.emailVerified,
        banned: u.banned,
      })),
    );
    const title = newTitle();

    expect((await submit(fields(title))).status).toBe(201);
    const member = await findByTitle(title);

    const mine = (list: string[]) =>
      vi
        .mocked(sendEmail)
        .mock.calls.map(([mail]) => mail)
        .filter((mail) => list.includes(mail.to));
    await vi.waitFor(() =>
      expect(mine(users.map((u) => u.email))).toHaveLength(2),
    );

    const sent = mine(users.map((u) => u.email));
    expect(sent.map((m) => m.to).sort()).toEqual(
      [users[0].email, users[3].email].sort(),
    );
    // only this test's emails: others' recipients are real panel users
    for (const mail of sent) {
      expect(mail.subject).toBe("Yeni başvuru");
      expect(mail.text).toMatch(new RegExp(`/members/${member.id}$`));
      for (const secret of [title, "Ayşe", "Yılmaz", "10000000146", "kimlik"]) {
        expect(mail.text).not.toContain(secret);
      }
    }
  });
});
