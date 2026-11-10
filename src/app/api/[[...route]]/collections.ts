import { zValidator } from "@hono/zod-validator";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import writeXlsxFile from "write-excel-file/node";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import {
  collectionTable,
  memberTable,
  parameterTable,
  projectTable,
} from "@/db/schema";
import { type AuditActor, recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { parseCollectionFilters } from "@/lib/collection-filters";
import {
  type OutcomeCounts,
  sendCollectionNotices,
} from "@/lib/collection-notices";
import { isoToDisplay } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { NOTICE_OUTCOME_LABELS } from "@/lib/notice-outcome";
import { projectLabel } from "@/lib/projects";
import { netgsmClient } from "@/lib/sms/netgsm";
import { collectionSchema } from "@/lib/zod-schemas/collection";
import {
  type CollectionRow,
  selectCollection,
  selectCollections,
} from "./collection-queries";
import { type AppEnv, actorOf } from "./env";
import { amountCell, dateCell, header, xlsxResponse } from "./excel";
import {
  DUPLICATE_NUMBER_ERROR,
  insertProject,
  isDuplicateNumber,
} from "./projects";
import {
  idParamSchema,
  respondWithFirstField,
  respondWithFirstIssue,
} from "./validation";

const NOT_FOUND_ERROR = "Tahsilat bulunamadı";

const collectionAuditSpec: AuditSpec = {
  member: { label: "Üye", format: formatAudit.text },
  amount: { label: "Tutar", format: formatAudit.text },
  date: { label: "Tarih", format: formatAudit.date },
  category: { label: "Tahsilat Türü", format: formatAudit.text },
  method: { label: "Tahsilat Tipi", format: formatAudit.text },
  project: { label: "Proje", format: formatAudit.text },
  note: { label: "Not", format: formatAudit.text },
};

/** The tahsilat as the audit log shows it: names, not ids */
type CollectionRecord = {
  member: string;
  amount: string;
  date: string;
  category: string;
  method: string;
  project: string | null;
  note: string | null;
};

function auditRecord(record: CollectionRecord) {
  return { ...record, amount: formatAmount(record.amount) };
}

/** "Üye ünvanı · ₺1.250,00 · 10.11.2026" */
function auditLabel({ member, amount, date }: CollectionRecord) {
  return `${member} · ${formatAmount(amount)} · ${isoToDisplay(date)}`;
}

function recordOf(row: CollectionRow): CollectionRecord {
  return {
    member: row.memberTitle,
    amount: row.amount,
    date: row.date,
    category: row.categoryName,
    method: row.methodName,
    project:
      row.projectName && row.projectNumber
        ? projectLabel({ name: row.projectName, number: row.projectNumber })
        : null,
    note: row.note,
  };
}

/** A refusal about one input: 400 with its message and field */
class CollectionInputError extends Error {
  constructor(
    message: string,
    readonly field: string,
    readonly status: 400 | 409 = 400,
  ) {
    super(message);
  }
}

type Values = z.output<typeof collectionSchema>;

/**
 * Checks the member, parameters and proje, creating the proje when asked.
 * A new tahsilat needs an Aktif member and proje; an edit may keep the
 * ones it already has. Returns the project id and the names to audit.
 */
async function resolveReferences(
  tx: Transaction,
  values: Values,
  actor: ReturnType<typeof actorOf>,
  existing: CollectionRow | null,
) {
  const [member] = await tx
    .select({ title: memberTable.title, status: memberTable.status })
    .from(memberTable)
    .where(eq(memberTable.id, values.memberId));
  if (!member) {
    throw new CollectionInputError("Seçilen üye bulunamadı", "memberId");
  }
  if (member.status !== "active" && existing?.memberId !== values.memberId) {
    throw new CollectionInputError("Seçilen üye aktif değil", "memberId");
  }

  const parameters = await tx
    .select({
      id: parameterTable.id,
      kind: parameterTable.kind,
      name: parameterTable.name,
    })
    .from(parameterTable)
    .where(inArray(parameterTable.id, [values.categoryId, values.methodId]));
  const category = parameters.find(
    (p) => p.id === values.categoryId && p.kind === "collection_category",
  );
  if (!category) {
    throw new CollectionInputError(
      "Geçerli bir tahsilat türü seçin",
      "categoryId",
    );
  }
  const method = parameters.find(
    (p) => p.id === values.methodId && p.kind === "collection_method",
  );
  if (!method) {
    throw new CollectionInputError(
      "Geçerli bir tahsilat tipi seçin",
      "methodId",
    );
  }

  let project: { id: number; name: string; number: string } | null = null;
  if (values.project.mode === "existing") {
    const id = values.project.id;
    const [found] = await tx
      .select()
      .from(projectTable)
      .where(eq(projectTable.id, id));
    if (!found) {
      throw new CollectionInputError("Seçilen proje bulunamadı", "project.id");
    }
    if (!found.active && existing?.projectId !== id) {
      throw new CollectionInputError("Seçilen proje aktif değil", "project.id");
    }
    project = found;
  } else if (values.project.mode === "new") {
    const { mode: _, ...fields } = values.project;
    try {
      // last, so nothing after it can fail; any error rolls this back too
      project = await insertProject(tx, fields, actor);
    } catch (error) {
      if (isDuplicateNumber(error)) {
        throw new CollectionInputError(
          DUPLICATE_NUMBER_ERROR,
          "project.number",
          409,
        );
      }
      throw error;
    }
  }

  const record: CollectionRecord = {
    member: member.title,
    amount: values.amount,
    date: values.date,
    category: category.name,
    method: method.name,
    project: project ? projectLabel(project) : null,
    note: values.note,
  };
  return { projectId: project?.id ?? null, record };
}

function columnsOf(values: Values, projectId: number | null) {
  const { project: _, ...fields } = values;
  return { ...fields, projectId };
}

/** "2 gönderildi, 1 adres yok"; "—" when there was no one to send to */
function countsText(counts: OutcomeCounts) {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(
      ([outcome, n]) =>
        `${n} ${NOTICE_OUTCOME_LABELS[outcome as keyof OutcomeCounts].toLocaleLowerCase("tr")}`,
    );
  return parts.join(", ") || "—";
}

/**
 * Emails and texts the member and the other panel users about a new
 * tahsilat, then records the outcomes (never addresses, numbers or text).
 * Runs after the response; a failure here never undoes the tahsilat.
 */
async function notifyCollectionCreated(id: number, actor: AuditActor) {
  try {
    const collection = await selectCollection(id);
    if (!collection) return;
    const result = await sendCollectionNotices(collection, actor?.id ?? null);
    await recordAudit(db, {
      actor,
      action: "collection_notice",
      entityType: "collection",
      entityId: id,
      entityLabel: auditLabel(recordOf(collection)),
      details: [
        {
          label: "Üye e-posta",
          value: NOTICE_OUTCOME_LABELS[result.member.email],
        },
        { label: "Üye SMS", value: NOTICE_OUTCOME_LABELS[result.member.sms] },
        {
          label: "Panel kullanıcıları e-posta",
          value: countsText(result.staff.email),
        },
        {
          label: "Panel kullanıcıları SMS",
          value: countsText(result.staff.sms),
        },
        ...(netgsmClient().dryRun
          ? [{ label: "Mod", value: "Deneme (SMS gönderilmedi)" }]
          : []),
      ],
    });
  } catch (error) {
    console.error(
      "Collection notices failed",
      error instanceof Error ? error.name : "unknown",
    );
  }
}

// all optional text; parseCollectionFilters drops anything invalid
const filtersQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  member: z.string().optional(),
  category: z.string().optional(),
  method: z.string().optional(),
  project: z.string().optional(),
});

const COLUMN_WIDTHS = [12, 32, 14, 20, 16, 32, 40];

/** The Tahsilatlar list as an .xlsx: the rows, a blank row, the total */
async function collectionsWorkbook({
  collections,
  total,
}: Awaited<ReturnType<typeof selectCollections>>) {
  return writeXlsxFile(
    [
      [
        "Tarih",
        "Üye",
        "Tutar",
        "Tahsilat Türü",
        "Tahsilat Tipi",
        "Proje",
        "Not",
      ].map(header),
      ...collections.map((collection) => [
        dateCell(collection.date),
        collection.memberTitle,
        amountCell(collection.amount),
        collection.categoryName,
        collection.methodName,
        recordOf(collection).project,
        collection.note,
      ]),
      [],
      [header("Toplam"), null, { ...amountCell(total), fontWeight: "bold" }],
    ],
    {
      sheet: "Tahsilatlar",
      stickyRowsCount: 1,
      columns: COLUMN_WIDTHS.map((width) => ({ width })),
    },
  ).toBuffer();
}

function filtersOf(query: z.output<typeof filtersQuerySchema>) {
  return parseCollectionFilters({
    get: (name) => query[name as keyof typeof query] ?? null,
  });
}

export const collectionsRoute = new Hono<AppEnv>()
  .get("/", zValidator("query", filtersQuerySchema), async (c) =>
    c.json(await selectCollections(filtersOf(c.req.valid("query")))),
  )
  // before "/:id", which would take "export" for an id
  .get("/export", zValidator("query", filtersQuerySchema), async (c) => {
    const result = await selectCollections(filtersOf(c.req.valid("query")));
    return xlsxResponse(c, await collectionsWorkbook(result), "tahsilatlar");
  })
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const collection = await selectCollection(c.req.valid("param").id);
      if (!collection) return c.json({ error: NOT_FOUND_ERROR }, 404);
      return c.json(collection, 200);
    },
  )
  .post(
    "/",
    zValidator("json", collectionSchema, respondWithFirstField),
    async (c) => {
      const values = c.req.valid("json");
      try {
        const saved = await db.transaction(async (tx) => {
          const { projectId, record } = await resolveReferences(
            tx,
            values,
            actorOf(c),
            null,
          );
          const [collection] = await tx
            .insert(collectionTable)
            .values(columnsOf(values, projectId))
            .returning({ id: collectionTable.id });

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: "collection",
            entityId: collection.id,
            entityLabel: auditLabel(record),
            details: describeFields(collectionAuditSpec, auditRecord(record)),
          });
          return { id: collection.id, projectId };
        });

        // not awaited: the save doesn't wait for (or depend on) the notices
        void notifyCollectionCreated(saved.id, actorOf(c));

        return c.json({ ...saved, message: "Tahsilat kaydedildi" }, 201);
      } catch (error) {
        if (error instanceof CollectionInputError) {
          return c.json(
            { error: error.message, field: error.field },
            error.status,
          );
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", collectionSchema, respondWithFirstField),
    async (c) => {
      const { id } = c.req.valid("param");
      const values = c.req.valid("json");

      try {
        const found = await db.transaction(async (tx) => {
          const existing = await selectCollection(id, tx);
          if (!existing) return false;

          const { projectId, record } = await resolveReferences(
            tx,
            values,
            actorOf(c),
            existing,
          );
          await tx
            .update(collectionTable)
            .set(columnsOf(values, projectId))
            .where(eq(collectionTable.id, id));

          const changes = diffFields(
            collectionAuditSpec,
            auditRecord(recordOf(existing)),
            auditRecord(record),
          );
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "collection",
              entityId: id,
              entityLabel: auditLabel(record),
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: NOT_FOUND_ERROR }, 404);

        return c.json({ id, message: "Tahsilat güncellendi" }, 200);
      } catch (error) {
        if (error instanceof CollectionInputError) {
          return c.json(
            { error: error.message, field: error.field },
            error.status,
          );
        }
        throw error;
      }
    },
  )
  .delete(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const deleted = await db.transaction(async (tx) => {
        const existing = await selectCollection(id, tx);
        if (!existing) return false;

        await tx.delete(collectionTable).where(eq(collectionTable.id, id));
        const record = recordOf(existing);
        await recordAudit(tx, {
          actor: actorOf(c),
          action: "delete",
          entityType: "collection",
          entityId: id,
          entityLabel: auditLabel(record),
          details: describeFields(collectionAuditSpec, auditRecord(record)),
        });
        return true;
      });

      if (!deleted) return c.json({ error: NOT_FOUND_ERROR }, 404);

      return c.json({ message: "Tahsilat silindi" }, 200);
    },
  );
