import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { env } from "@/lib/env";
import { runAutoSms } from "@/lib/sms/auto-send";

function matches(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the Plesk scheduled task every few minutes, without a session:
 * `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" …/api/cron/sms`.
 * Mounted before the session check in app.ts.
 */
export const cronRoute = new Hono().post("/sms", async (c) => {
  if (!env.CRON_SECRET) {
    return c.json({ error: "CRON_SECRET tanımlı değil" }, 503);
  }
  const header = c.req.header("authorization") ?? "";
  if (!matches(header, `Bearer ${env.CRON_SECRET}`)) {
    return c.json({ error: "Yetkisiz" }, 401);
  }

  try {
    return c.json(await runAutoSms());
  } catch (error) {
    console.error("Automatic SMS run failed", error);
    return c.json({ error: "Otomatik SMS çalıştırılamadı" }, 500);
  }
});
