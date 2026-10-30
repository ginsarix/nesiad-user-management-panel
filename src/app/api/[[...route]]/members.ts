import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { db } from "@/db";
import {
  authorizedRepresentativeTable,
  membersRepresentativesTable,
  memberTable,
} from "@/db/schema";
import { createFile } from "@/lib/file-storage";
import { createMemberSchema } from "@/lib/zod-schemas/member";
import { safeNumSchema } from "@/lib/zod-schemas/shared";

/** Representatives joined to their member, optionally for a single member */
function selectRepresentatives(memberId?: number) {
  return db
    .select({
      memberId: membersRepresentativesTable.memberId,
      id: authorizedRepresentativeTable.id,
      name: authorizedRepresentativeTable.name,
      dateOfBirth: authorizedRepresentativeTable.dateOfBirth,
    })
    .from(membersRepresentativesTable)
    .innerJoin(
      authorizedRepresentativeTable,
      eq(
        membersRepresentativesTable.authorizedRepresentativeId,
        authorizedRepresentativeTable.id,
      ),
    )
    .where(
      memberId === undefined
        ? undefined
        : eq(membersRepresentativesTable.memberId, memberId),
    )
    .orderBy(asc(authorizedRepresentativeTable.name));
}

type MemberRepresentative = Omit<
  Awaited<ReturnType<typeof selectRepresentatives>>[number],
  "memberId"
>;

export const membersRoute = new Hono()
  .get("/", async (c) => {
    const [members, representatives] = await Promise.all([
      db.select().from(memberTable),
      selectRepresentatives(),
    ]);

    const representativesByMember = new Map<number, MemberRepresentative[]>();
    for (const { memberId, ...representative } of representatives) {
      const list = representativesByMember.get(memberId) ?? [];
      list.push(representative);
      representativesByMember.set(memberId, list);
    }

    return c.json(
      members.map((member) => ({
        ...member,
        representatives: representativesByMember.get(member.id) ?? [],
      })),
    );
  })
  .get(
    "/:id",
    zValidator(
      "param",
      z.object({ id: safeNumSchema(z.number().int().positive()) }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");

      const [member] = await db
        .select()
        .from(memberTable)
        .where(eq(memberTable.id, id));

      if (!member) return c.json({ error: "Üye bulunamadı" }, 404);

      const representatives = (await selectRepresentatives(id)).map(
        ({ memberId: _, ...representative }) => representative,
      );

      return c.json({ ...member, representatives }, 200);
    },
  )
  .post(
    "/",
    bodyLimit({
      maxSize: 25 * 1024 * 1024, // 25 MiB
      onError: (c) => {
        return c.text("Dosya 25 MB'dan küçük olmalıdır", 413);
      },
    }),
    zValidator("form", createMemberSchema),
    async (c) => {
      const { logo, authorizedRepresentativeIds, ...form } =
        c.req.valid("form");

      let createdMember: Pick<
        typeof memberTable.$inferSelect,
        "id" | "createdAt" | "updatedAt"
      >;

      const memberInsertReturnColumns = {
        id: memberTable.id,
        createdAt: memberTable.createdAt,
        updatedAt: memberTable.updatedAt,
      };

      if (authorizedRepresentativeIds?.length) {
        createdMember = await db.transaction(async (tx) => {
          const [member] = await tx
            .insert(memberTable)
            .values(form)
            .returning(memberInsertReturnColumns);

          const relations = authorizedRepresentativeIds.map((arId) => ({
            authorizedRepresentativeId: arId,
            memberId: member.id,
          }));

          await tx
            .insert(membersRepresentativesTable)
            .values(relations)
            .returning();
          return member;
        });
      } else {
        [createdMember] = await db
          .insert(memberTable)
          .values(form)
          .returning(memberInsertReturnColumns);
      }

      let savedFilename: string | undefined;

      if (logo) {
        const buf = await logo.arrayBuffer();
        const detectedFileType = await fileTypeFromBuffer(buf);
        if (!detectedFileType || !detectedFileType.mime.startsWith("image/")) {
          return c.json({ error: "Sadece resim dosyaları kabul edilir." }, 415);
        }

        savedFilename = await createFile({
          buffer: Buffer.from(buf),
          filename: logo.name,
          ext: detectedFileType.ext,
        });
      }

      return c.json(
        { createdMember, savedFilename, message: "Üye başarıyla kaydedildi" },
        200,
      );
    },
  );
