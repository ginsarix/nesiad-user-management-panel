import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db } from "@/db";
import {
  authorizedRepresentativeTable,
  membersRepresentativesTable,
  memberTable,
} from "@/db/schema";
import { createFile, deleteFile } from "@/lib/file-storage";
import {
  createMemberSchema,
  MAX_LOGO_SIZE,
  updateMemberSchema,
} from "@/lib/zod-schemas/member";
import { idParamSchema, respondWithFirstIssue } from "./validation";

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

/**
 * Stores an uploaded logo after checking its actual contents are an image.
 * Resolves to null when the file is not an image.
 */
async function saveLogo(logo: File) {
  const buffer = await logo.arrayBuffer();
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType?.mime.startsWith("image/")) return null;

  return await createFile({
    buffer: Buffer.from(buffer),
    filename: logo.name,
    ext: fileType.ext,
  });
}

const logoBodyLimit = bodyLimit({
  // the logo plus some room for the text fields
  maxSize: MAX_LOGO_SIZE + 1024 * 1024,
  onError: (c) => c.json({ error: "Logo 5 MB'dan küçük olmalıdır" }, 413),
});

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
    zValidator("param", idParamSchema, respondWithFirstIssue),
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
    logoBodyLimit,
    zValidator("form", createMemberSchema, respondWithFirstIssue),
    async (c) => {
      const { logo, ...fields } = c.req.valid("form");

      const logoFilename = logo ? await saveLogo(logo) : null;
      if (logo && !logoFilename) {
        return c.json({ error: "Sadece resim dosyaları kabul edilir" }, 415);
      }

      try {
        const [member] = await db
          .insert(memberTable)
          .values({ ...fields, logo: logoFilename })
          .returning({ id: memberTable.id });

        return c.json(
          { id: member.id, message: "Üye başarıyla kaydedildi" },
          201,
        );
      } catch (error) {
        if (logoFilename) await deleteFile(logoFilename);
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    logoBodyLimit,
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("form", updateMemberSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const { logo, removeLogo, ...fields } = c.req.valid("form");

      const [existing] = await db
        .select({ logo: memberTable.logo })
        .from(memberTable)
        .where(eq(memberTable.id, id));

      if (!existing) return c.json({ error: "Üye bulunamadı" }, 404);

      // undefined keeps the current logo, null removes it
      let newLogo: string | null | undefined;
      if (logo) {
        newLogo = await saveLogo(logo);
        if (!newLogo) {
          return c.json({ error: "Sadece resim dosyaları kabul edilir" }, 415);
        }
      } else if (removeLogo) {
        newLogo = null;
      }

      try {
        await db
          .update(memberTable)
          .set({ ...fields, ...(newLogo !== undefined && { logo: newLogo }) })
          .where(eq(memberTable.id, id));
      } catch (error) {
        if (newLogo) await deleteFile(newLogo);
        throw error;
      }

      if (newLogo !== undefined && existing.logo) {
        await deleteFile(existing.logo);
      }

      return c.json({ id, message: "Üye güncellendi" }, 200);
    },
  )
  .delete(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const [deleted] = await db
        .delete(memberTable)
        .where(eq(memberTable.id, id))
        .returning({ logo: memberTable.logo });

      if (!deleted) return c.json({ error: "Üye bulunamadı" }, 404);

      if (deleted.logo) await deleteFile(deleted.logo);

      return c.json({ message: "Üye silindi" }, 200);
    },
  );
