// Run with `pnpm cron:sms` next to `pnpm dev`: does locally what the Plesk
// scheduled task does in production, once a minute instead of every 5
import { env } from "@/lib/env";

const INTERVAL_MS = 60_000;

async function tick() {
  const time = new Date().toLocaleTimeString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/cron/sms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    });
    console.log(time, res.status, await res.text());
  } catch (error) {
    console.log(time, "server unreachable:", (error as Error).message);
  }
}

if (!env.CRON_SECRET) {
  console.error("Set CRON_SECRET in .env (32+ characters)");
  process.exit(1);
}
void tick();
setInterval(tick, INTERVAL_MS);
