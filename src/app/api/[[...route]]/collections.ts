import { zValidator } from "@hono/zod-validator";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import {
  collectionTable,
  memberTable,
  parameterTable,
  projectTable,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { parseCollectionFilters } from "@/lib/collection-filters";
import { isoToDisplay } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { projectLabel } from "@/lib/projects";
import { collectionSchema } from "@/lib/zod-schemas/collection";
import {
  type CollectionRow,
  selectCollection,
  selectCollections,
} from "./collection-queries";
import { type AppEnv, actorOf } from "./env";
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

// all optional text; parseCollectionFilters drops anything invalid
const filtersQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  member: z.string().optional(),
  category: z.string().optional(),
  method: z.string().optional(),
  project: z.string().optional(),
});

export const collectionsRoute = new Hono<AppEnv>()
  .get("/", zValidator("query", filtersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const filters = parseCollectionFilters({
      get: (name) => query[name as keyof typeof query] ?? null,
    });
    return c.json(await selectCollections(filters));
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
