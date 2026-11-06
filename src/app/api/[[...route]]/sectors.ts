import { zValidator } from "@hono/zod-validator";
import { and, count, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { memberTable, sectorTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { change } from "@/lib/audit-diff";
import { compareTr } from "@/lib/turkish";
import { sectorSchema } from "@/lib/zod-schemas/sector";
import { pgErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const DUPLICATE_NAME_ERROR = "Bu isimde bir sektör zaten var";

function sectorValues({ name }: { name: string }) {
  return { name, nameKey: name.toLocaleLowerCase("tr") };
}

export const sectorsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const sectors = await db
      .select({
        id: sectorTable.id,
        name: sectorTable.name,
        memberCount: count(memberTable.id),
      })
      .from(sectorTable)
      .leftJoin(
        memberTable,
        and(
          eq(memberTable.sectorId, sectorTable.id),
          inArray(memberTable.status, ["active", "passive"]),
        ),
      )
      .groupBy(sectorTable.id);

    return c.json(sectors.toSorted((a, b) => compareTr(a.name, b.name)));
  })
  .post(
    "/",
    zValidator("json", sectorSchema, respondWithFirstIssue),
    async (c) => {
      try {
        const id = await db.transaction(async (tx) => {
          const [sector] = await tx
            .insert(sectorTable)
            .values(sectorValues(c.req.valid("json")))
            .returning();

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: "sector",
            entityId: sector.id,
            entityLabel: sector.name,
            details: [{ label: "Sektör Adı", value: sector.name }],
          });
          return sector.id;
        });

        return c.json({ id, message: "Sektör eklendi" }, 201);
      } catch (error) {
        if (pgErrorCode(error) === UNIQUE_VIOLATION) {
          return c.json({ error: DUPLICATE_NAME_ERROR }, 409);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", sectorSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      try {
        const found = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ name: sectorTable.name })
            .from(sectorTable)
            .where(eq(sectorTable.id, id));
          if (!existing) return false;

          const { name } = c.req.valid("json");
          await tx
            .update(sectorTable)
            .set(sectorValues({ name }))
            .where(eq(sectorTable.id, id));

          const changes = change("Sektör Adı", existing.name, name);
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "sector",
              entityId: id,
              entityLabel: name,
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: "Sektör bulunamadı" }, 404);

        return c.json({ id, message: "Sektör güncellendi" }, 200);
      } catch (error) {
        if (pgErrorCode(error) === UNIQUE_VIOLATION) {
          return c.json({ error: DUPLICATE_NAME_ERROR }, 409);
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
        const [sector] = await tx
          .select({ name: sectorTable.name })
          .from(sectorTable)
          .where(eq(sectorTable.id, id));
        if (!sector) return null;

        // the foreign key clears the sector of its members; name them now
        const members = await tx
          .select({ title: memberTable.title })
          .from(memberTable)
          .where(eq(memberTable.sectorId, id));

        await tx.delete(sectorTable).where(eq(sectorTable.id, id));
        await recordAudit(tx, {
          actor: actorOf(c),
          action: "delete",
          entityType: "sector",
          entityId: id,
          entityLabel: sector.name,
          details: [
            { label: "Sektör Adı", value: sector.name },
            {
              label: "Sektörü boşaltılan üyeler",
              value:
                members
                  .map((m) => m.title)
                  .sort(compareTr)
                  .join(", ") || "—",
            },
          ],
        });
        return sector;
      });

      if (!deleted) return c.json({ error: "Sektör bulunamadı" }, 404);

      return c.json({ message: "Sektör silindi" }, 200);
    },
  );
