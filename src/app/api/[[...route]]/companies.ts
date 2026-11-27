import { zValidator } from "@hono/zod-validator";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { companyTable, memberTable, sectorTable } from "@/db/schema";
import { compareTr } from "@/lib/turkish";
import type { AppEnv } from "./env";
import { idParamSchema, respondWithFirstIssue } from "./validation";

export const companiesRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const companies = await db
      .select({
        id: companyTable.id,
        title: companyTable.title,
        logo: companyTable.logo,
        memberCount: count(memberTable.id),
      })
      .from(companyTable)
      .leftJoin(memberTable, eq(memberTable.companyId, companyTable.id))
      .groupBy(companyTable.id);
    return c.json(companies.sort((a, b) => compareTr(a.title, b.title)));
  })
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const [company] = await db
        .select({
          id: companyTable.id,
          title: companyTable.title,
          logo: companyTable.logo,
          logoOriginal: companyTable.logoOriginal,
          address: companyTable.address,
          phone: companyTable.phone,
          website: companyTable.website,
          companyIntro: companyTable.companyIntro,
          activityDocument: companyTable.activityDocument,
          sectorId: companyTable.sectorId,
          sectorName: sectorTable.name,
          foundingDate: companyTable.foundingDate,
          employeeCount: companyTable.employeeCount,
        })
        .from(companyTable)
        .leftJoin(sectorTable, eq(sectorTable.id, companyTable.sectorId))
        .where(eq(companyTable.id, id));
      if (!company) return c.json({ error: "Firma bulunamadı" }, 404);

      const members = await db
        .select({
          id: memberTable.id,
          firstName: memberTable.firstName,
          lastName: memberTable.lastName,
          status: memberTable.status,
        })
        .from(memberTable)
        .where(eq(memberTable.companyId, id));

      return c.json(
        {
          ...company,
          members: members
            .map((m) => ({
              id: m.id,
              name: `${m.firstName} ${m.lastName}`.trim(),
              status: m.status,
            }))
            .sort((a, b) => compareTr(a.name, b.name)),
        },
        200,
      );
    },
  );
