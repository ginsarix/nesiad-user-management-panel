// The member conversion migrations (member_person_convert and
// member_person_constraints) run on production with no undo, so they are
// tested on throwaway databases: one migrated up to just before them, given
// yetkili/member fixtures, then migrated the rest of the way; and one
// migrated from empty, as CI does. Never touches the development database.
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool, types } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(process.cwd(), "drizzle");
const CONVERSION = /_member_person_(convert|constraints)$/;

// biome-ignore lint/style/noNonNullAssertion: pnpm test preloads .env
const serverUrl = process.env.DATABASE_URL!;
const scratchNames: string[] = [];
const pools: Pool[] = [];
let migrationsBefore: string;

function scratchName() {
  const name = `nesiad_conv_${randomBytes(6).toString("hex")}`;
  scratchNames.push(name);
  return name;
}

async function onServer(statement: string) {
  const client = new Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

async function createScratch() {
  const name = scratchName();
  await onServer(`create database "${name}"`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({
    connectionString: url.toString(),
    max: 1,
    // dates as the "yyyy-mm-dd" strings stored, not JS Dates
    types: {
      getTypeParser: ((oid: number, format?: "text" | "binary") =>
        oid === types.builtins.DATE
          ? (value: string) => value
          : types.getTypeParser(oid, format)) as typeof types.getTypeParser,
    },
  });
  pools.push(pool);
  return pool;
}

async function migrateFrom(pool: Pool, folder: string) {
  await migrate(drizzle({ client: pool }), { migrationsFolder: folder });
}

let pool: Pool;
// fixture ids, filled in beforeAll
const id = {} as Record<
  | "m1"
  | "m2"
  | "m3"
  | "m4"
  | "a1"
  | "b1"
  | "b2"
  | "u1"
  | "m5"
  | "c1"
  | "p1"
  | "category"
  | "cashAccount"
  | "project"
  | "role"
  | "board",
  number
>;
const before = {} as Record<"representatives" | "links", number>;

async function one<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T> {
  const { rows } = await pool.query(query, params);
  expect(rows).toHaveLength(1);
  return rows[0] as T;
}

async function insertId(query: string, params: unknown[] = []) {
  const row = await one<{ id: number }>(`${query} returning id`, params);
  return row.id;
}

beforeAll(async () => {
  migrationsBefore = mkdtempSync(join(tmpdir(), "nesiad-conv-"));
  for (const folder of readdirSync(MIGRATIONS)) {
    if (!CONVERSION.test(folder)) {
      cpSync(join(MIGRATIONS, folder), join(migrationsBefore, folder), {
        recursive: true,
      });
    }
  }

  pool = await createScratch();
  await migrateFrom(pool, migrationsBefore);

  id.category = await insertId(
    `insert into parameter (kind, name, name_key) values ('collection_category', 'Aidat', 'aidat')`,
  );
  id.role = await insertId(
    `insert into parameter (kind, name, name_key) values ('association_role', 'Üye', 'üye')`,
  );
  id.cashAccount = await insertId(
    `insert into cash_account (name, name_key) values ('Kasa', 'kasa')`,
  );
  id.project = await insertId(
    `insert into project (name, number, number_key) values ('Okul', 'P-1', 'p-1')`,
  );
  id.board = await insertId(
    `insert into management_board (name, name_key) values ('Yönetim', 'yönetim')`,
  );

  // one yetkili
  id.m1 = await insertId(
    `insert into member (title, member_login_date) values ('Acme', '2010-01-01')`,
  );
  id.a1 = await insertId(
    `insert into authorized_representative (name, email, phone, photo, notes, po_positive_card_no, date_of_birth)
     values ('Ali  Veli Kaya', 'a@x', '5551112233', 'p.jpg', 'not', 'PO-1', '1980-05-06')`,
  );
  await pool.query(
    `insert into members_representatives (member_id, authorized_representative_id, role) values ($1, $2, 'Genel Müdür')`,
    [id.m1, id.a1],
  );

  // two yetkililer
  id.m2 = await insertId(
    `insert into member (title, member_login_date, email, company_role) values ('Beta', '2015-03-01', 'm2@x', 'Ortak')`,
  );
  id.b1 = await insertId(
    `insert into authorized_representative (name) values ('Bora')`,
  );
  id.b2 = await insertId(
    `insert into authorized_representative (name, email) values ('Banu Er', 'banu@x')`,
  );
  await pool.query(
    `insert into members_representatives (member_id, authorized_representative_id, role)
     values ($1, $2, null), ($1, $3, 'Muhasebe')`,
    [id.m2, id.b1, id.b2],
  );

  // the same Ünvan twice, one yetkili each
  id.m3 = await insertId(
    `insert into member (title, logo) values ('ANADOLU OSGB', 'a.png')`,
  );
  id.m4 = await insertId(
    `insert into member (title, logo, address) values ('Anadolu Osgb', 'b.png', 'Nevşehir')`,
  );
  const atilla = await insertId(
    `insert into authorized_representative (name) values ('Atilla Demir')`,
  );
  const veli = await insertId(
    `insert into authorized_representative (name) values ('Veli Çelik')`,
  );
  await pool.query(
    `insert into members_representatives (member_id, authorized_representative_id)
     values ($1, $2), ($3, $4)`,
    [id.m3, atilla, id.m4, veli],
  );

  // an /uyelik applicant: keeps the name they typed
  id.m5 = await insertId(
    `insert into member (title, status, first_name, last_name)
     values ('Gama', 'candidate', 'Ayşe', 'Yılmaz')`,
  );
  id.c1 = await insertId(
    `insert into authorized_representative (name) values ('Ayse Yilmaz Kara')`,
  );
  await pool.query(
    `insert into members_representatives (member_id, authorized_representative_id) values ($1, $2)`,
    [id.m5, id.c1],
  );

  // no member, not active
  id.p1 = await insertId(
    `insert into authorized_representative (name, active) values ('Pasif Kişi', false)`,
  );

  // no member
  id.u1 = await insertId(
    `insert into authorized_representative (name, phone) values ('Ufuk', '5554443322')`,
  );
  for (const amount of ["100.00", "50.50"]) {
    await pool.query(
      `insert into collection (representative_id, category_id, cash_account_id, amount, date)
       values ($1, $2, $3, $4, '2026-01-10')`,
      [id.u1, id.category, id.cashAccount, amount],
    );
  }

  // B2's other rows
  await pool.query(
    `insert into accrual (representative_id, category_id, amount, position) values ($1, $2, '300.00', 0)`,
    [id.b2, id.category],
  );
  await pool.query(
    `insert into project_pledge (project_id, representative_id, quantity, amount, position)
     values ($1, $2, 3, '25.25', 0)`,
    [id.project, id.b2],
  );
  await pool.query(
    `insert into management_board_member (group_id, representative_id, role_id, position)
     values ($1, $2, $3, 0)`,
    [id.board, id.b2, id.role],
  );

  await pool.query(
    `insert into sms_send (kind, contact_id, contact_name, celebration_date, years, phone, message)
     values ('birthday', $1, 'Ufuk', '2026-05-05', 40, '5554443322', 'İyi ki doğdun'),
            ('founding', $2, 'Acme', '2026-05-05', 10, '5551112233', 'Kutlu olsun')`,
    [id.u1, id.m1],
  );
  await pool.query(
    `insert into collection_notice_settings
       (id, representative_sms, representative_email_subject, representative_email_body,
        staff_sms, staff_email_subject, staff_email_body)
     values (1, 'Sayın {yetkili}, {tutar} alındı', 'Tahsilat', 'Sayın {yetkili}',
             '{yetkili}: {tutar}', 'Yeni tahsilat', '{yetkili} {yetkili}')
     on conflict (id) do update set representative_sms = excluded.representative_sms,
       representative_email_subject = excluded.representative_email_subject,
       representative_email_body = excluded.representative_email_body,
       staff_sms = excluded.staff_sms,
       staff_email_subject = excluded.staff_email_subject,
       staff_email_body = excluded.staff_email_body`,
  );

  before.representatives = Number(
    (
      await one<{ n: string }>(
        `select count(*) n from authorized_representative`,
      )
    ).n,
  );
  before.links = Number(
    (await one<{ n: string }>(`select count(*) n from members_representatives`))
      .n,
  );

  await migrateFrom(pool, MIGRATIONS);
}, 120_000);

afterAll(async () => {
  for (const p of pools) await p.end().catch(() => {});
  for (const name of scratchNames) {
    await onServer(`drop database if exists "${name}" with (force)`);
  }
  if (migrationsBefore) {
    rmSync(migrationsBefore, { recursive: true, force: true });
  }
}, 60_000);

async function memberFor(representativeId: number) {
  return one(
    `select m.* from member m
     join representative_member_map map on map.member_id = m.id
     where map.representative_id = $1`,
    [representativeId],
  );
}

describe("member conversion migration", () => {
  it("one yetkili → member keeps id and gains the yetkili's fields", async () => {
    const m1 = await memberFor(id.a1);
    expect(m1).toMatchObject({
      id: id.m1,
      first_name: "Ali Veli",
      last_name: "Kaya",
      email: "a@x",
      mobile_phone: "5551112233",
      photo: "p.jpg",
      notes: "not",
      po_positive_card_no: "PO-1",
      company_role: "Genel Müdür",
      status: "active",
    });
    const company = await one(
      `select c.title, c.title_key from company c where c.id = $1`,
      [m1.company_id],
    );
    expect(company).toEqual({ title: "Acme", title_key: "acme" });
  });

  it("member with two yetkililer → two members sharing one company", async () => {
    const first = await memberFor(id.b1);
    const second = await memberFor(id.b2);
    expect(first).toMatchObject({
      id: id.m2,
      first_name: "Bora",
      last_name: "",
      // the yetkili has no email: the member's stays
      email: "m2@x",
      // the link has no görev: the member's stays
      company_role: "Ortak",
    });
    expect(second.id).not.toBe(id.m2);
    expect(second).toMatchObject({
      company_id: first.company_id,
      member_login_date: "2015-03-01",
      status: "active",
      first_name: "Banu",
      last_name: "Er",
      email: "banu@x",
      company_role: "Muhasebe",
    });
    expect(first.company_id).not.toBeNull();
  });

  it("same Ünvan → one company", async () => {
    const rows = (
      await pool.query(
        `select m.id, m.company_id, c.logo, c.address, c.title
         from member m join company c on c.id = m.company_id
         where m.id = any($1) order by m.id`,
        [[id.m3, id.m4]],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].company_id).toBe(rows[1].company_id);
    expect(id.m3).toBeLessThan(id.m4);
    expect(rows[0]).toMatchObject({
      title: "ANADOLU OSGB",
      logo: "a.png",
      address: "Nevşehir",
    });
    const companies = await one<{ n: string }>(
      `select count(*) n from company where title_key = 'anadolu osgb'`,
    );
    expect(companies.n).toBe("1");
  });

  it("unlinked yetkili with tahsilat → member without company, tahsilat follows", async () => {
    const u1 = await memberFor(id.u1);
    expect(u1).toMatchObject({
      first_name: "Ufuk",
      last_name: "",
      mobile_phone: "5554443322",
      company_id: null,
      member_login_date: null,
      status: "active",
    });
    const collections = await one(
      `select count(*)::int n, sum(amount)::text total from collection where member_id = $1`,
      [u1.id],
    );
    expect(collections).toEqual({ n: 2, total: "150.50" });
  });

  it("an applicant's own name is kept", async () => {
    const m5 = await memberFor(id.c1);
    expect(m5).toMatchObject({
      id: id.m5,
      first_name: "Ayşe",
      last_name: "Yılmaz",
      status: "candidate",
    });
  });

  it("an inactive yetkili without a member becomes a Pasif member", async () => {
    const p1 = await memberFor(id.p1);
    expect(p1).toMatchObject({
      first_name: "Pasif",
      last_name: "Kişi",
      status: "passive",
      company_id: null,
    });
  });

  it("accrual, pledge and Organizasyon rows follow their yetkili", async () => {
    const b2 = await memberFor(id.b2);
    for (const table of [
      "accrual",
      "project_pledge",
      "management_board_member",
    ]) {
      // the scratch database holds one row of each
      const row = await one<{ member_id: number }>(
        `select member_id from ${table}`,
      );
      expect(row.member_id, table).toBe(b2.id);
    }
  });

  it("drops the old yetkili columns and requires the new ones", async () => {
    const { rows } = await pool.query(
      `select table_name, column_name, is_nullable from information_schema.columns
       where table_schema = 'public'
         and ((column_name in ('representative_id', 'member_id')
               and table_name in ('collection', 'accrual', 'project_pledge',
                 'management_board_member', 'committee_member',
                 'disciplinary_board_member', 'supervisory_board_member',
                 'honorary_board_member'))
           or (table_name = 'member' and column_name in ('first_name', 'last_name')))
       order by table_name, column_name`,
    );
    expect(rows.filter((r) => r.column_name === "representative_id")).toEqual(
      [],
    );
    expect(rows).toHaveLength(10);
    for (const row of rows)
      expect(row, row.table_name).toMatchObject({ is_nullable: "NO" });
  });

  it("sms_send ids remapped", async () => {
    const u1 = await memberFor(id.u1);
    const m1 = await memberFor(id.a1);
    const rows = (
      await pool.query(`select kind, contact_id from sms_send order by kind`)
    ).rows;
    expect(rows).toEqual([
      { kind: "birthday", contact_id: u1.id },
      { kind: "founding", contact_id: m1.company_id },
    ]);
  });

  it("templates use {uye}", async () => {
    const settings = await one(
      `select representative_sms, representative_email_subject, representative_email_body,
              staff_sms, staff_email_subject, staff_email_body
       from collection_notice_settings`,
    );
    expect(settings).toEqual({
      representative_sms: "Sayın {uye}, {tutar} alındı",
      representative_email_subject: "Tahsilat",
      representative_email_body: "Sayın {uye}",
      staff_sms: "{uye}: {tutar}",
      staff_email_subject: "Yeni tahsilat",
      staff_email_body: "{uye} {uye}",
    });
  });

  it("legacy data is left in place", async () => {
    const representatives = await one<{ n: string }>(
      `select count(*) n from authorized_representative`,
    );
    const links = await one<{ n: string }>(
      `select count(*) n from members_representatives`,
    );
    expect(Number(representatives.n)).toBe(before.representatives);
    expect(Number(links.n)).toBe(before.links);
    const m1 = await one(
      `select title, member_login_date from member where id = $1`,
      [id.m1],
    );
    expect(m1).toEqual({ title: "Acme", member_login_date: "2010-01-01" });
  });

  it("writes one conversion audit entry with counts", async () => {
    const entry = await one<{
      actor_id: string | null;
      entity_type: string;
      entity_label: string;
      details: { label: string; value: string }[];
    }>(
      `select actor_id, entity_type, entity_label, details from audit_log where action = 'conversion'`,
    );
    expect(entry).toMatchObject({
      actor_id: null,
      entity_type: "member",
      entity_label: "Yetkililer üyelere dönüştürüldü",
    });
    const counts = Object.fromEntries(
      entry.details.map((d) => [d.label, d.value]),
    );
    // 5 members kept; B2, U1 and P1 added; Acme, Beta, ANADOLU OSGB and Gama
    // created, one merged
    expect(counts).toMatchObject({
      "Korunan üyeler": "5",
      "Eklenen üyeler": "3",
      "Oluşturulan firmalar": "4",
      "Birleştirilen firmalar": "1",
      Tahsilatlar: "2",
      Tahakkuk: "1",
      Taahhütler: "1",
      Yönetim: "1",
    });
  });

  it("works on an empty database", async () => {
    const empty = await createScratch();
    await migrateFrom(empty, MIGRATIONS);
    const { rows } = await empty.query(`select count(*)::int n from member`);
    expect(rows).toEqual([{ n: 0 }]);
    // nothing was converted, so nothing to record
    const audit = await empty.query(
      `select count(*)::int n from audit_log where action = 'conversion'`,
    );
    expect(audit.rows).toEqual([{ n: 0 }]);
  }, 120_000);

  it("a failed check rolls the whole conversion back", async () => {
    const broken = await createScratch();
    await migrateFrom(broken, migrationsBefore);
    const { rows } = await broken.query(
      `insert into member (title) values ('X'), ('Y') returning id`,
    );
    const {
      rows: [shared],
    } = await broken.query(
      `insert into authorized_representative (name) values ('İki Üyeli') returning id`,
    );
    await broken.query(
      `insert into members_representatives (member_id, authorized_representative_id)
       values ($1, $3), ($2, $3)`,
      [rows[0].id, rows[1].id, shared.id],
    );

    // drizzle wraps the database error; its cause carries the message
    const error = await migrateFrom(broken, MIGRATIONS).then(
      () => "migrated",
      (e: Error & { cause?: Error }) => e.cause?.message ?? e.message,
    );
    expect(error).toMatch(/linked to more than one member/);

    const applied = await broken.query(
      `select name from drizzle.__drizzle_migrations where name ~ '_member_person_(convert|constraints)$'`,
    );
    expect(applied.rows).toEqual([]);
    const companies = await broken.query(`select count(*)::int n from company`);
    expect(companies.rows).toEqual([{ n: 0 }]);
  }, 120_000);
});
