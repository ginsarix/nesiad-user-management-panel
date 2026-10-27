import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { seedDefaultAdmin } from "./seed";

it("seeds admin", async () => {
  let id: string | null = null;
  try {
    const { id: userId } = await seedDefaultAdmin();
    id = userId;
  } catch {
    /* ignore */
  }

  const seeded = id
    ? db.select().from(userTable).where(eq(userTable.id, id))
    : false;

  expect(seeded, "admin did not seed").toBeTruthy();
});
