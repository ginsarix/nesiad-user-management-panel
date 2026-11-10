import { zValidator } from "@hono/zod-validator";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import writeXlsxFile from "write-excel-file/node";
import { z } from "zod";
import { db } from "@/db";
import { counterpartyTable, paymentTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { compareTr, foldTr } from "@/lib/turkish";
import { counterpartySchema } from "@/lib/zod-schemas/counterparty";
import {
  FOREIGN_KEY_VIOLATION,
  pgErrorCode,
  UNIQUE_VIOLATION,
} from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import { amountCell, header, xlsxResponse } from "./excel";
import { sumOfAmounts } from "./payment-queries";
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

/** null when a concurrent payment made the count unknown */
function hasPaymentsError(paymentCount: number | null) {
  return paymentCount
    ? `Bu cariye ait ${paymentCount} ödeme var. Önce ödemeleri silin.`
    : "Bu cariye ait ödemeler var. Önce ödemeleri silin.";
}

function withTitleKey<T extends { title: string }>(values: T) {
  return { ...values, titleKey: values.title.toLocaleLowerCase("tr") };
}

/** Every cari with its payment count and total paid, sorted by Ünvan */
async function selectCounterparties() {
  const counterparties = await db
    .select({
      ...counterpartyColumns,
      paymentCount: count(paymentTable.id),
      totalPaid: sumOfAmounts(),
    })
    .from(counterpartyTable)
    .leftJoin(
      paymentTable,
      eq(paymentTable.counterpartyId, counterpartyTable.id),
    )
    .groupBy(counterpartyTable.id);

  return counterparties.sort((a, b) => compareTr(a.title, b.title));
}

const COLUMN_WIDTHS = [32, 14, 14, 40, 16, 28, 16];

export const counterpartiesRoute = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await selectCounterparties()))
  // before "/:id", which would take "export" for an id. `q` filters by
  // Ünvan the same way the list's search does
  .get(
    "/export",
    zValidator("query", z.object({ q: z.string().optional() })),
    async (c) => {
      const needle = foldTr(c.req.valid("query").q?.trim() ?? "");
      const counterparties = (await selectCounterparties()).filter(
        (counterparty) => foldTr(counterparty.title).includes(needle),
      );

      const buffer = await writeXlsxFile(
        [
          [
            "Ünvan",
            "Şehir",
            "İlçe",
            "Adres",
            "Telefon",
            "E-posta",
            "Toplam Ödenen",
          ].map(header),
          ...counterparties.map((counterparty) => [
            counterparty.title,
            counterparty.city,
            counterparty.district,
            counterparty.address,
            counterparty.phone,
            counterparty.email,
            amountCell(counterparty.totalPaid),
          ]),
        ],
        {
          sheet: "Cariler",
          stickyRowsCount: 1,
          columns: COLUMN_WIDTHS.map((width) => ({ width })),
        },
      ).toBuffer();
      return xlsxResponse(c, buffer, "cariler");
    },
  )
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

      const paymentCount = await db.$count(
        paymentTable,
        eq(paymentTable.counterpartyId, id),
      );
      return c.json({ ...counterparty, paymentCount }, 200);
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

      const result = await db
        .transaction(async (tx) => {
          // payments keep their cari: refuse while it has any
          const paymentCount = await tx.$count(
            paymentTable,
            eq(paymentTable.counterpartyId, id),
          );
          if (paymentCount > 0) return { paymentCount };

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
          return { paymentCount: 0 };
        })
        .catch((error) => {
          // a payment added between the count and the delete
          if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
            return { paymentCount: null };
          }
          throw error;
        });

      if (!result) return c.json({ error: NOT_FOUND_ERROR }, 404);
      if (result.paymentCount !== 0) {
        return c.json({ error: hasPaymentsError(result.paymentCount) }, 409);
      }

      return c.json({ message: "Cari silindi" }, 200);
    },
  );
