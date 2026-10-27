import { zValidator } from "@hono/zod-validator";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { db } from "@/db";
import { membersRepresentativesTable, memberTable } from "@/db/schema";
import { createFile } from "@/lib/file-storage";
import { createMemberSchema } from "@/lib/zod-schemas/member";
import { safeNumSchema } from "@/lib/zod-schemas/shared";

export const membersRoute = new Hono()
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        limit: safeNumSchema(z.number().int().positive()),
        skip: safeNumSchema(z.number().int().nonnegative()),
      }),
    ),
    async (c) => {
      const pagination = c.req.valid("query");

      const members = await db
        .select()
        .from(memberTable)
        .offset(pagination.skip)
        .limit(pagination.limit);

      return c.json(members);
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

      if (authorizedRepresentativeIds?.length) {
        await db.transaction(async (tx) => {
          const [{ id: memberId }] = await tx
            .insert(memberTable)
            .values(form)
            .returning();

          const relations = authorizedRepresentativeIds.map((arId) => ({
            authorizedRepresentativeId: arId,
            memberId,
          }));

          await tx.insert(membersRepresentativesTable).values(relations);
        });
      } else {
        await db.insert(memberTable).values(form);
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
        { savedFilename, message: "Üye başarıyla kaydedildi" },
        200,
      );
    },
  );
