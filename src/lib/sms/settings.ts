import { eq } from "drizzle-orm";
import { db } from "@/db";
import { smsSettingsTable } from "@/db/schema";
import { DEFAULT_MESSAGES } from "./templates";

export type SmsSettings = typeof smsSettingsTable.$inferSelect;

/** The settings row, created with the defaults (automatic SMS on) if missing */
export async function getSmsSettings(): Promise<SmsSettings> {
  const [existing] = await db
    .select()
    .from(smsSettingsTable)
    .where(eq(smsSettingsTable.id, 1));
  if (existing) return existing;

  await db
    .insert(smsSettingsTable)
    .values({
      id: 1,
      foundingMessage: DEFAULT_MESSAGES.founding,
      birthdayMessage: DEFAULT_MESSAGES.birthday,
    })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(smsSettingsTable)
    .where(eq(smsSettingsTable.id, 1));
  return created;
}
