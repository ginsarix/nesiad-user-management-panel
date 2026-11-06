import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mail";

/**
 * Tells every verified, non-banned panel user that an application arrived.
 * The mail has no name, company, TC number or document: only a link to the
 * member page, which is behind the login. One failed mail never stops the
 * others; failures are logged.
 */
export async function notifyPanelUsersOfApplication(memberId: number) {
  const users = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(
      sql`${eq(userTable.emailVerified, true)} AND ${userTable.banned} IS NOT TRUE`,
    );

  const link = `${env.NEXT_PUBLIC_APP_URL}/members/${memberId}`;
  const results = await Promise.allSettled(
    users.map((user) =>
      sendEmail({
        to: user.email,
        subject: "Yeni başvuru",
        text: `Yeni başvuru\n\n${link}`,
      }),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Application notice email failed", result.reason);
    }
  }
}
