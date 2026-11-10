import { eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionNoticeSettingsTable } from "@/db/schema";
import { DEFAULT_COLLECTION_NOTICE_TEMPLATES } from "./sms/templates";

export type CollectionNoticeSettings =
  typeof collectionNoticeSettingsTable.$inferSelect;

/** The templates row, created with the default texts if missing */
export async function getCollectionNoticeSettings(): Promise<CollectionNoticeSettings> {
  const [existing] = await db
    .select()
    .from(collectionNoticeSettingsTable)
    .where(eq(collectionNoticeSettingsTable.id, 1));
  if (existing) return existing;

  await db
    .insert(collectionNoticeSettingsTable)
    .values({ id: 1, ...DEFAULT_COLLECTION_NOTICE_TEMPLATES })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(collectionNoticeSettingsTable)
    .where(eq(collectionNoticeSettingsTable.id, 1));
  return created;
}
