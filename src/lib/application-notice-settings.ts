import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationNoticeSettingsTable } from "@/db/schema";
import { DEFAULT_NOTICE_TEMPLATES } from "./sms/templates";

export type ApplicationNoticeSettings =
  typeof applicationNoticeSettingsTable.$inferSelect;

/** The templates row, created with the default texts if missing */
export async function getApplicationNoticeSettings(): Promise<ApplicationNoticeSettings> {
  const [existing] = await db
    .select()
    .from(applicationNoticeSettingsTable)
    .where(eq(applicationNoticeSettingsTable.id, 1));
  if (existing) return existing;

  await db
    .insert(applicationNoticeSettingsTable)
    .values({ id: 1, ...DEFAULT_NOTICE_TEMPLATES })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(applicationNoticeSettingsTable)
    .where(eq(applicationNoticeSettingsTable.id, 1));
  return created;
}
