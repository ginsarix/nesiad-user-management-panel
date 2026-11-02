# SMS via NetGSM

**Feature:** manual SMS to members and yetkililer · automatic SMS on a member's founding date · automatic SMS on a yetkili's birthday · a setting for the time of day each automatic SMS goes out.

**Finish line:**
1. `pnpm test --run sms` is green, and no test calls NetGSM.
2. A manual SMS from `/sms` arrives on your phone. Denetim Kayıtları shows it with the job id.
3. "Simüle tarih" 2027-02-28 lists the exact people who celebrate that day, including 29 Şubat birthdays.
4. With the send time set to 2 minutes from now, the automatic SMS arrives once. A server restart does not send it again.

**Decisions:** NetGSM `iysfilter: "0"` (informational). Founding-date SMS goes to the member's own phone (skipped when it is not a mobile). Ayarlar holds the send time and the editable message text (placeholders like `{ad}`, `{yil}`) for each celebration. No NetGSM `startdate`: a daily job reads current data at send time and sends right away.

## Level 0: Setup and playground
Build: `/sms` with tabs Manuel, Otomatik, and Ayarlar. A fake NetGSM client returns `FAKE-…` job ids. An `sms_send` table logs each send. Otomatik has a "Simüle tarih" picker. Locked parts say "Locked. Build Level N to unlock."
Done check: on Manuel, press Gönder → toast with job id `FAKE-…`.

## Level 1: Phone numbers
Build: `normalizePhone(raw)` → `"5XXXXXXXXX"` (10-digit mobile) or `null`.
Done check: `"0 (535) 406 82 92"` → `"5354068292"`. `"0384 213 11 11"` → `null`.

## Level 2: Manual recipients
Build: from the selected members and yetkililer, keep valid phones and remove duplicate numbers. Count what you skipped and why.
Done check: fixed data → `7 alıcı · 2 telefonsuz · 1 geçersiz · 1 tekrar`.

## Level 3: Real send
Build: turn NetGSM's response into `{ ok: true, jobId }` or `{ ok: false, code, message }` (codes 20–85, in Turkish).
Done check: one manual SMS to your own phone arrives, and the audit row shows the job id.

## Level 4: Who celebrates today
Build: `celebrationsOn(date, members, yetkililer)` → who gets an SMS that day, and the year count ("12. kuruluş yıl dönümü"). You choose the 29 Şubat rule.
Done check: "Simüle tarih" 2027-02-28 and 2028-02-29 list the exact expected people.

## Level 5: Send on time, exactly once
Build: decide if a daily job is due now (Europe/Istanbul), with catch-up after downtime and no double sends.
Design choice at this level: Plesk scheduled task that calls an endpoint, or a timer inside the Next server.
Done check: finish line step 4.

## Going further (optional)
SMS part counter checked against NetGSM `/length` · editable message templates · delivery reports · send history page.
