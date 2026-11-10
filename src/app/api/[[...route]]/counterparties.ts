import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { counterpartyTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { compareTr } from "@/lib/turkish";
import { counterpartySchema } from "@/lib/zod-schemas/counterparty";
import { pgErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import {
  idParamSchema,
  respondWithFirstField,
  respondWithFirstIssue,
} from "./validation";

const NOT_FOUND_ERROR = "Cari bulunamadı";
const DUPLICATE_TITLE = {
  error: "Bu ünvanla bir cari zaten var",
  field: "title",
};

const counterpartyAuditSpec: AuditSpec = {
  title: { label: "Ünvan", format: formatAudit.text },
  city: { label: "Şehir", format: formatAudit.text },
  district: { label: "İlçe", format: formatAudit.text },
  address: { label: "Adres", format: formatAudit.text },
  phone: { label: "Telefon", format: formatAudit.text },
  email: { label: "E-posta", format: formatAudit.text },
};

const counterpartyColumns = {
  id: counterpartyTable.id,
  title: counterpartyTable.title,
  city: counterpartyTable.city,
  district: counterpartyTable.district,
  address: counterpartyTable.address,
  phone: counterpartyTable.phone,
  email: counterpartyTable.email,
};

function withTitleKey<T extends { title: string }>(values: T) {
  return { ...values, titleKey: values.title.toLocaleLowerCase("tr") };
}

export const counterpartiesRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const counterparties = await db
      .select(counterpartyColumns)
      .from(counterpartyTable);

    return c.json(
      counterparties
        .map((counterparty) => ({
          ...counterparty,
          paymentCount: 0,
          totalPaid: "0.00",
        }))
        .sort((a, b) => compareTr(a.title, b.title)),
    );
  })
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const [counterparty] = await db
        .select(counterpartyColumns)
        .from(counterpartyTable)
        .where(eq(counterpartyTable.id, id));

      if (!counterparty) return c.json({ error: NOT_FOUND_ERROR }, 404);

      return c.json({ ...counterparty, paymentCount: 0 }, 200);
    },
  )
  .post(
    "/",
    zValidator("json", counterpartySchema, respondWithFirstField),
    async (c) => {
      try {
        const id = await db.transaction(async (tx) => {
          const [counterparty] = await tx
            .insert(counterpartyTable)
            .values(withTitleKey(c.req.valid("json")))
            .returning();

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: "counterparty",
            entityId: counterparty.id,
            entityLabel: counterparty.title,
            details: describeFields(counterpartyAuditSpec, counterparty),
          });
          return counterparty.id;
        });

        return c.json({ id, message: "Cari kaydedildi" }, 201);
      } catch (error) {
        if (pgErrorCode(error) === UNIQUE_VIOLATION) {
          return c.json(DUPLICATE_TITLE, 409);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", counterpartySchema, respondWithFirstField),
    async (c) => {
      const { id } = c.req.valid("param");
      const fields = c.req.valid("json");

      try {
        const found = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(counterpartyTable)
            .where(eq(counterpartyTable.id, id));
          if (!existing) return false;

          await tx
            .update(counterpartyTable)
            .set(withTitleKey(fields))
            .where(eq(counterpartyTable.id, id));

          const changes = diffFields(counterpartyAuditSpec, existing, fields);
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "counterparty",
              entityId: id,
              entityLabel: fields.title,
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: NOT_FOUND_ERROR }, 404);

        return c.json({ id, message: "Cari güncellendi" }, 200);
      } catch (error) {
        if (pgErrorCode(error) === UNIQUE_VIOLATION) {
          return c.json(DUPLICATE_TITLE, 409);
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
        const [counterparty] = await tx
          .delete(counterpartyTable)
          .where(eq(counterpartyTable.id, id))
          .returning();
        if (!counterparty) return null;

        await recordAudit(tx, {
          actor: actorOf(c),
          action: "delete",
          entityType: "counterparty",
          entityId: id,
          entityLabel: counterparty.title,
          details: describeFields(counterpartyAuditSpec, counterparty),
        });
        return counterparty;
      });

      if (!deleted) return c.json({ error: NOT_FOUND_ERROR }, 404);

      return c.json({ message: "Cari silindi" }, 200);
    },
  );
