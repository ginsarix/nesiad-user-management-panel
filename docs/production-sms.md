# SMS in production

What the production server needs before the SMS page (`/sms`) sends real SMS, and how to check it works. Development is covered at the end.

## 1. Database

The SMS feature adds two tables: `sms_send` (one row per automatic SMS) and `sms_settings` (the Ayarlar tab). The deploy creates them with the other migrations ([deploy.md](deploy.md), section 4).

Automatic SMS starts **off**: nothing is sent until someone ticks the switch on SMS → Ayarlar.

## 2. Environment variables

Set these in the Plesk Node.js app's environment, next to the existing ones:

| Variable | Value |
| --- | --- |
| `NETGSM_USERNAME` | NetGSM API user |
| `NETGSM_PASSWORD` | its password |
| `NETGSM_HEADER` | the registered sender name (mesaj başlığı) |
| `SMS_DRY_RUN` | `false`. **Required**: when unset it defaults to `true`, and no SMS ever leaves |
| `CRON_SECRET` | 32+ random characters, e.g. from `openssl rand -hex 32`. Without it the cron endpoint refuses every call |

Restart the app after changing them.

> **Dry run looks like success.** With `SMS_DRY_RUN` on, sends get a `FAKE-…` job id, the Otomatik tab says "Gönderildi" and Denetim Kayıtları says "Mod: Deneme". The Ayarlar tab shows a red warning while dry run is on. Automatic SMS recorded in dry run are **not** sent again that day after dry run is turned off.

## 3. NetGSM IP restriction

If NetGSM restricts API access by IP (Abonelik İşlemleri → API işlemleri), add the production server's outgoing IP. Otherwise every send fails with NetGSM error **30**.

## 4. Plesk scheduled task

The automatic SMS job runs only when this endpoint is called; there is no timer inside the app, because Plesk can stop an idle Node app.

In Plesk: **Websites & Domains → Scheduled Tasks → Add Task**

- **Task type:** Run a command. ("Fetch a URL" can't send the POST and header this needs.)
- **Command** (replace the secret and host):

  ```bash
  curl -fsS -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<panel-host>/api/cron/sms
  ```

- **Run:** Cron style, `*/5 * * * *` (every 5 minutes).
- **Notify:** on errors only. `-f` makes curl fail on an HTTP error, so a wrong secret (401) or a missing secret (503) shows up as a failed task.

Each call prints what happened, so the task log stays readable:

| Response | Meaning |
| --- | --- |
| `{"status":"disabled"}` | Automatic SMS is switched off in Ayarlar |
| `{"status":"not_due",…}` | Before today's send time |
| `{"status":"nothing_to_send",…}` | Nobody celebrating today, or they all got theirs already |
| `{"status":"sent","count":N,"jobId":"…"}` | Sent N SMS |
| `{"status":"failed",…,"error":"…"}` | NetGSM refused; the error says why (e.g. code 30, 40, 80) |
| `{"status":"unknown",…}` | NetGSM didn't answer; the SMS may have gone |
| `{"error":"Yetkisiz"}` (401) | Wrong or missing secret in the command |
| `{"error":"CRON_SECRET tanımlı değil"}` (503) | `CRON_SECRET` isn't set in the app's environment |

### How sending works

- From the send time until midnight (Türkiye time), each call sends to whoever celebrates today and hasn't had their SMS yet. If the server was down at the send time, the next call that day catches up. A missed day is skipped; nothing is sent a day late.
- Each person gets at most one SMS per celebration per day, even after a restart or when two calls overlap.
- Sends that fail (`failed`), get no answer (`unknown`), or are cut off by a restart mid-send (`pending`) are **never retried**. They show in red on the Otomatik tab, for staff to follow up by hand.
- People celebrating today are read at send time, so edits made the same day count.

## 5. Check it works

1. Run the task once by hand (Plesk → the task → **Run Now**) and look for a JSON answer such as `{"status":"disabled"}`, not an error.
2. Send one manual SMS from SMS → Manuel to your own phone. It should arrive, and Denetim Kayıtları should show the NetGSM job number without a "Deneme" line.
3. Turn on automatic SMS in Ayarlar and set the send time. On a day someone celebrates, the Otomatik tab shows "Gönderildi HH:MM · NetGSM iş no …" next to each person, and Denetim Kayıtları shows "Kutlama SMS'i gönderildi".

## Development

- `pnpm cron:sms` does what the Plesk task does, once a minute, against `NEXT_PUBLIC_APP_URL`. Run it next to `pnpm dev`; it needs `CRON_SECRET` in `.env`.
- Keep `SMS_DRY_RUN` unset (dry run) unless you mean to spend credit.
- To make the job send again for today after a test, clear today's rows (development only):

  ```sql
  delete from sms_send where celebration_date = current_date;
  ```

## Login and verification codes

Login codes and the codes that verify a panel user's number go through the same NetGSM account and header as every other SMS, and each one spends credit. If the credit runs out (or NetGSM fails), login codes go by email instead. Number verification codes have no email fallback, so creating a panel user or changing a number fails until the credit is topped up. With `SMS_DRY_RUN` on, login codes go by email and number codes are printed to the log with a `DRY RUN` prefix.
