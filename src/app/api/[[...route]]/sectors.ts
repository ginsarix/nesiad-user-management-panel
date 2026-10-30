import { zValidator } from "@hono/zod-validator";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { memberTable, sectorTable } from "@/db/schema";
import { compareTr } from "@/lib/turkish";
import { sectorSchema } from "@/lib/zod-schemas/sector";
import { pgErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const DUPLICATE_NAME_ERROR = "Bu isimde bir sektör zaten var";

function sectorValues({ name }: { name: string }) {
  return { name, nameKey: name.toLocaleLowerCase("tr") };
}

export const sectorsRoute = new Hono()
  .get("/", async (c) => {
    const sectors = await db
      .select({
        id: sectorTable.id,
        name: sectorTable.name,
        memberCount: count(memberTable.id),
      })
      .from(sectorTable)
      .leftJoin(memberTable, eq(memberTable.sectorId, sectorTable.id))
      .groupBy(sectorTable.id);

    return c.json(sectors.toSorted((a, b) => compareTr(a.name, b.name)));
  })
  .post(
    "/",
    zValidator("json", sectorSchema, respondWithFirstIssue),
    async (c) => {
      try {
        const [sector] = await db
          .insert(sectorTable)
          .values(sectorValues(c.req.valid("json")))
          .returning({ id: sectorTable.id });

        return c.json({ id: sector.id, message: "Sektör eklendi" }, 201);
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
        const [updated] = await db
          .update(sectorTable)
          .set(sectorValues(c.req.valid("json")))
          .where(eq(sectorTable.id, id))
          .returning({ id: sectorTable.id });

        if (!updated) return c.json({ error: "Sektör bulunamadı" }, 404);

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

      // the foreign key clears the sector of its members
      const [deleted] = await db
        .delete(sectorTable)
        .where(eq(sectorTable.id, id))
        .returning({ id: sectorTable.id });

      if (!deleted) return c.json({ error: "Sektör bulunamadı" }, 404);

      return c.json({ message: "Sektör silindi" }, 200);
    },
  );
