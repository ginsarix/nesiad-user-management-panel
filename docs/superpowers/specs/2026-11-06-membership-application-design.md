# Public membership application: design

Status: draft for review, 2026-11-06.

Decisions marked **(staff)** came from the user or the association's management during design. Decisions marked **(my call)** are the designer's defaults. Everything else is left to the builder.

## Why

NESİAD takes membership applications through an old standalone PHP form at `https://nesiad.org.tr/kayit/form.php`, separate from this panel. Management wants applications to arrive directly in the panel, be reviewed there, and be answered automatically.

## What gets built

1. A public, unauthenticated five-step form at `https://yonetim.nesiad.org.tr/uyelik`, rebuilt in the panel's style rather than copied.
2. Member status with four values instead of a boolean: `active` (Aktif), `passive` (Pasif), `candidate` (Aday), `rejected` (Reddedildi).
3. The old form's fields on the member model.
4. A staff review flow: Aday appear in a filter, staff read the application and its documents, then accept or reject it.
5. Automatic email and SMS to the applicant on acceptance or rejection, using staff-editable templates.
6. An automatic email to every panel user when an application arrives.

## Goals

- An applicant can finish the form on a phone without ever losing what they entered while moving between steps.
- Aday and Reddedildi records never appear among real members by default, never get celebration or manual SMS, and can't be linked to yetkililer.
- Staff never send an applicant a notice by accident.
- Existing production members keep their Aktif/Pasif state.

## Non-goals

- Payment or dues handling.
- A per-applicant rejection reason. Everyone gets the same template text **(staff)**.
- A button to resend a failed notice. Staff contact the applicant themselves.
- Saving drafts, resuming later, or surviving a page refresh.
- An applicant-facing way to check application status.
- Detecting duplicate applications.
- Automatic deletion of applicant data: there is no retention limit **(staff)**.
- Creating a yetkili from an application. Yetkililer stay separate, and staff add one by hand if they want one **(staff)**.
- Importing applications from the old system.
- Changing the old site. Pointing `nesiad.org.tr/kayit/form.php` at the new page happens outside this repository, once the new page is live.

## Anti-goals

The work has failed, even if it technically functions, if any of these happen:

- Going back or forward in the form loses entered data or chosen files.
- A failed email or SMS undoes or blocks a staff decision, or fails an applicant's submission.
- An uploaded identity document or a TC number is reachable without logging in.
- An applicant's form data ends up in the append-only audit log.
- An ordinary member edit changes an application's outcome or sends a notice.

## Member status

`member.active` is replaced by a `status` text column typed with `$type`, following `smsSendTable.status`, with a check constraint on the four values **(my call)**. Database default: `active`. Yetkililer keep their `active` boolean **(my call)**.

### Allowed changes

| From | To | Where | Dialog | Notice |
| --- | --- | --- | --- | --- |
| Aday | Aktif | Kabul Et | Üye Giriş Tarihi (required, defaults to today), Sektör (optional) | Accepted email + SMS |
| Aday | Pasif | Pasif olarak ekle | Same fields as Kabul Et **(my call)** | None |
| Aday | Reddedildi | Reddet | Confirmation only | Rejected email + SMS |
| Reddedildi | Aday | Tekrar Aday yap | None, one click | None |
| Aktif | Pasif | Existing button | None, as today | None |
| Pasif | Aktif | Existing button | None, as today | None |

The API refuses every other change, including Reddedildi → Aktif. A wrongly rejected applicant goes back to Aday and is then accepted normally, which sends the accepted notice.

Only the dedicated decision actions can move a record out of Aday or Reddedildi. The general member `PATCH` accepts only Aktif ↔ Pasif, and staff-created members can only be Aktif or Pasif. The Düzenle form shows its Aktif checkbox only for Aktif and Pasif members **(staff-approved mockup)**.

### Where status matters

- **Member list:** the filter offers Aktif üyeler (default), Pasif üyeler, Adaylar, Reddedilenler and Tüm üyeler. Adaylar shows the number waiting. Under Adaylar and Reddedilenler the table shows Ünvan, Başvuran, Telefon and Başvuru Tarihi (`createdAt`). `?status=` in the URL extends to the new values.
- **Tags:** Aday and Reddedildi get tags alongside the existing Pasif tag. Aktif has no tag.
- **SMS:** automatic and manual SMS use `status = 'active'` only, which matches today's `active = true`. See `src/lib/sms/load-celebrations.ts` and `sms.ts`. They keep reading `member.phone` and never fall back to the applicant's mobile **(staff)**, so a member whose İş Telefonu is a landline gets no SMS until staff add a mobile or a yetkili.
- **Sector counts:** count `status IN ('active', 'passive')`.
- **Yetkili form:** the member picker lists Aktif and Pasif only, still labelling Pasif. The API also refuses linking to an Aday or Reddedildi member. The member page hides "Yetkili ekle" for them.
- **Audit:** `formatAudit.active` becomes a status formatter. Old audit rows hold display strings and need no change.

## New member fields

All new columns are nullable, because existing and staff-created members won't have them **(my call)**. Only the public form makes them required.

| Old form | Stored as |
| --- | --- |
| Firma Adı | existing `title` |
| İş Adresi | existing `address` |
| İş Telefon | existing `phone` |
| Firma Logo | existing `logo`, images only (old form also allowed PDF) **(staff)** |
| Ad, Soyad | two text columns |
| Firmadaki göreviniz ve ünvanınız | text |
| İstihdam Sayısı | integer, zero or more **(my call)** |
| Web Siteniz | text, `https://` added when no scheme is typed; only `http` and `https` accepted **(my call)** |
| E-Posta | text, validated as an email |
| Cep Telefon | text, validated as a Turkish mobile with the rules in `src/lib/sms/recipients.ts` **(my call)** |
| Doğum Tarihi - Yeri | split into a `date` column and a text column **(staff)** |
| TC Kimlik Numarası | text, 11 digits with a checksum check **(my call)** |
| Eğitim Durumu | free text, as on the old form **(staff)** |
| Bağlı Bulunduğunuz Diğer Dernek - Kulüpler | text, the only optional field |
| Firma tanıtım yazısı | text. The "en az 3 cümle" wording stays as a hint and isn't enforced by counting sentences **(my call)** |
| Cinsiyet | stored as `male` / `female`, shown as Erkek / Kadın **(my call)** |
| NESİAD Üyesi Referansınız | text |
| Kimlik Belgesi | stored filename, PDF, PNG or JPG **(staff)** |
| Faaliyet Belgesi veya Sicil Gazetesi | stored filename, PDF, PNG or JPG **(staff)** |
| Both Onay checkboxes | one timestamp recording when both were accepted **(my call)** |

The form doesn't collect Üye Giriş Tarihi, Sektör or Kuruluş Tarihi, which is why accepting asks for the first two. An applicant's birth date never triggers a birthday SMS **(my call)**: celebrations stay with yetkililer and founding dates.

Column names are left to the builder.

## Public page: `/uyelik`

Five steps **(staff)**: Kişisel, Firma, Dernek, Belgeler, Onay. It sits in its own route group, because the `(auth)` layout's `max-w-sm` is too narrow. It uses the same logo, navy top border and colours, and shows the association's phone and email as the old form did. Add it to `PUBLIC_PATHS` in `src/proxy.ts`.

- **Kişisel:** Ad, Soyad, Doğum Tarihi, Doğum Yeri, TC Kimlik No, Cinsiyet, Eğitim Durumu, Cep Telefonu, E-posta.
- **Firma:** Firma Adı, Göreviniz ve Ünvanınız, İstihdam Sayısı, İş Adresi, İş Telefonu, Web Sitesi, Firma Tanıtım Yazısı.
- **Dernek:** Referans, Diğer Dernek ve Kulüpler.
- **Belgeler:** Firma Logosu, Kimlik Belgesi, Faaliyet Belgesi veya Sicil Gazetesi.
- **Onay:** the two checkboxes, with the old form's wording and its link to `https://www.nesiad.org.tr/dosya/Uyelik_Formu.pdf`. The submit button reads "Ön Üyelik Başvurusunu Yap".

Hard requirement **(staff)**: one shared form state across all steps, including `File` objects, so Geri and Devam Et never lose anything. Returning to Belgeler shows the chosen file names with a way to replace them.

- Devam Et validates only the current step. Geri validates nothing.
- If the server rejects a field on submit, the form jumps to that field's step and shows the error.
- A refresh clears the form **(my call)**: browsers can't restore chosen files, and TC numbers shouldn't sit in browser storage. The page warns before leaving once something has been entered.
- Success replaces the form with a "Başvurunuz alındı" screen saying the applicant will hear back by email and SMS.

## Public submit endpoint

A Hono route mounted before `.use(requireSession)`, like `/cron`. It is the only new unauthenticated API, and it can only create an Aday.

- **Validation:** every field is validated on the server, with sensible maximum lengths, since these values reach SMS text, email text and staff screens. The builder picks the limits.
- **Uploads:** at most 5 MB each **(my call; the old form said 2 MB, too small for phone photos)**. Type is checked by content with `file-type`, not by name or declared type. The logo must be PNG or JPG; documents may also be PDF. Stored files are removed if the database write fails, following the logo pattern in `members.ts`.
- **Spam:** an in-memory limit of 5 submissions per IP per hour, keyed by `x-real-ip` **(my call)**. It fits the single standalone server process and resets on restart. No IP is present locally or in tests, so a missing header skips the limit. A hidden trap field makes the endpoint report success without saving anything. No third-party captcha, partly because the association's notice says data isn't transferred abroad.
- **Duplicates:** always accepted **(my call)**. Refusing would tell the public whether a TC number has already applied, and reapplying after a rejection is legitimate.
- **Audit:** a submission writes no audit entry **(staff)**. This is a deliberate exception to the "every mutation is audited" rule, and `CLAUDE.md` should say so.
- **New-application email (staff):** sent after commit to every verified, non-banned panel user. It says only "Yeni başvuru" and links to the member page, with no name, company, TC number or documents **(my call)**. Failures are logged and never reach the applicant.

## Staff review

The list and dialogs follow the approved mockups.

The member page for an Aday shows the buttons Kabul Et, Reddet, Pasif olarak ekle, Düzenle and Sil. A Reddedildi member shows Tekrar Aday yap, Düzenle and Sil. Applicant details appear in three sections: Başvuran, Firma and Belgeler. Sections with no data don't appear on older members.

**Dialogs:** each names the email address and mobile number that will receive the notice, so staff can see exactly what happens before confirming. The reject dialog says the record stays under Reddedilenler.

**TC number:** the member detail and list responses never contain it. The page shows it masked with a Göster control that fetches it from a dedicated endpoint **(my call)**. The list response also leaves out document filenames.

**Documents:** Görüntüle opens the file through the authenticated `/api/files/:filename` route. That route needs a PDF content type and must not let browsers keep documents in a long-lived cache. Also delete its stale "TODO: require a logged-in panel user" comment: the route already sits behind `requireSession`.

**Düzenle form:** includes all new fields, including replacing either document, but none are required for staff.

**Sil:** also deletes both document files, as it already does for the logo. No retention job exists **(staff)**, so Sil is how an applicant's deletion request gets honoured.

## Notices

Decided by staff: moving Aday → Aktif or Aday → Reddedildi sends both an email and an SMS. Nothing else sends a notice, and the templates are editable.

**Order:** the status change and its audit entry commit first. Notices go out after commit, so a failure can't undo a decision. The API response reports each channel as sent, failed or skipped, and the UI warns if either didn't go out. A missing or invalid email or mobile, possible after a staff edit, counts as skipped.

**Sending:** SMS goes through `netgsmClient()`, so dry-run mode applies. Email goes through `sendEmail` as plain text **(my call)**. Production mail doesn't leave Türkiye **(staff)**, so the existing SMTP setup stays.

**Logging (my call):** notices don't use `sms_send`. Its unique key `(kind, contact_id, celebration_date)` exists for celebrations and would block a second notice on the same day after a Tekrar Aday yap. Each decision instead writes an audit entry recording the outcome per channel. Add `application_accept`, `application_reject` and notice labels to `audit-labels.ts`. As with today's manual SMS, an unanswered NetGSM request counts as "may have gone" and is not retried.

**Templates:** two SMS templates and two emails (subject and body), for accepted and rejected. The placeholders are `{ad}` (the applicant's full name) and `{firma}` (the company). They use the existing `fillTemplate` and unknown-placeholder checks, generalised beyond `{ad}` and `{yil}`, and ship with Turkish default text.

**Storage (my call):** a new single-row table, created the same way as `sms_settings`. This avoids adding required columns to a table that already has a production row, and an email template doesn't belong in a table named for SMS.

**Editing:** on the SMS page's Ayarlar tab with live preview, under separate headings. Saving writes an audit entry. The automatic-SMS on/off switch only controls celebrations and doesn't affect these notices **(my call)**.

## Audit log and personal data

The log is append-only and kept forever, so anything written to it can't be deleted later. The association's notice promises that data is deleted or anonymised once no longer needed, and Sil has to be able to honour that.

- **Submissions:** no audit entry at all **(staff)**.
- **New applicant fields** (everything in the New member fields table except the reused `title`, `address`, `phone` and `logo`): their values are never written to `details` or `changes` on any create, update or delete **(staff)**.
- **Staff edits to those fields:** record only the field's label, with "•••" for both values, so the trail shows that someone changed it **(my call)**.
- **Decisions and deletes:** still audited as usual, using the company name as the label and today's company fields. Notice entries record each channel's outcome but not the email address, mobile number or message text **(my call)**.

## Production data

**This migration changes every existing member row. Point this out again in the summary of the change, per `CLAUDE.md`.**

- **Touches:** `member.active` on all rows is converted to `status` and then dropped: `true` → `active`, `false` → `passive`. No information is lost.
- **Shape:** the generated SQL is edited by hand so it adds `status` (`NOT NULL DEFAULT 'active'`), runs the `UPDATE`, then drops `active`. Drizzle's output alone would lose the data.
- **Verification:** `db:push` on development doesn't run this SQL, so it must be tested against a scratch database with existing `active = true` and `active = false` rows.
- **Timing:** the migration runs seconds before the new code goes live, so old code would fail on the missing `active` column in that window. Deploy when nobody is using the panel (`docs/deploy.md`).
- **Harmless:** the new nullable columns and new templates table touch no existing data.

## Deployment

Three 5 MB uploads make a request of about 16 MB, so the Hono `bodyLimit` must allow that. Production responses show LiteSpeed in the path (`x-litespeed-cache`), and its default request limit is 500 MB according to the user's findings. Responses also report `server: gws`, which is unexplained, so after the first deploy submit one real application with large files to confirm nothing in front rejects it. `src/proxy.ts`'s matcher excludes `/api`, so Next's proxy body limit doesn't apply.

The spam limit depends on `x-real-ip`. Production login audit entries already show an IP address (checked 2026-11-06), so the header is reaching the app.

Update `CLAUDE.md` domain notes with the status values and the public route.

## Left to the builder

Column and endpoint names, template default wording, TC checksum implementation, how the wizard's form state is structured, per-field limits, how the Adaylar columns interact with the saved column-visibility cookie, and how notices are kept from delaying the applicant's response.

Existing conventions apply: `CLAUDE.md`, real-database tests named `__test__…`, and `pnpm db:push` + `pnpm db:generate` for schema changes.
