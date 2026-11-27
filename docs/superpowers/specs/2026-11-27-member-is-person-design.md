# Members are people, companies belong to them

Date: 2026-11-27. Status: draft for approval.

## Intent

The association's management corrected what a member is. In their words:

> - Derneğe Şahıslar üye olur (Ahmet, Mehmet gibi)
> - Dolayısıyla Yetkililer artık olmayacak
> - Üyenin sahibi olduğu şirket/firma Üyenin (yani şahısın) içerisinde gözükecek
>
> Artık Üye kavramı şahıs ile ilgili olacak, içerisine şahısın bilgileri ve
> firmasının bilgileri girilecek. Ve bir üye birden fazla şirket/firma'ya bağlı
> olmayacak.

Follow-up answers from management:

- The same company can belong to several members (e.g. partners).
- Someone without a company can be a member.

Today the panel has it the other way round: `member` is a company and people
hang off it as yetkililer (`members_representatives`, many-to-many, with a
per-link görev). Money (Tahsilatlar, Tahakkuk, Taahhütler), Organizasyon
groups, birthday SMS and tahsilat notices all point at the yetkili.

## Goals

- A member is a person: status, Üye Giriş Tarihi, kıdem, the `/uyelik`
  application flow and decisions, personal details, photo.
- A member has zero or one company. A company can have several members.
- Everything that points at a yetkili today points at the member.
- The Yetkililer page, its API and the member ↔ yetkili links are gone.
- Production data converts without losing anything, under the rules agreed
  with management (below).

## Non-goals

- No Firmalar list or page. A company is only ever seen and edited inside a
  member.
- No change to Cariler, Ödemeler, Kasa - Banka, Projeler beyond renamed
  labels.
- No new "non-member payer" concept: management decided the company-less
  yetkililer are members.

## Anti-goals

- Losing or misattributing a tahsilat, tahakkuk, taahhüt or Organizasyon row
  in the conversion.
- A second copy of a person (old yetkili + new member) surviving the
  conversion.
- Dropping the old data in the same deploy that switches the panel over.

## Production data (counts only, read 2026-11-27)

- 114 members, all Aktif. 113 have exactly 1 yetkili, 1 has 2.
- 122 yetkililer, all Aktif. 115 are linked to exactly 1 member, 7 to none,
  none to 2+.
- Of the 7 unlinked: 6 have tahsilatlar, 1 has nothing. None have tahakkuk,
  taahhüt or Organizasyon rows.
- All 114 members' applicant name (Başvuran Adı/Soyadı) matches their linked
  yetkili's name, folded the Turkish way.
- No duplicate yetkili names.
- One Ünvan is used by 2 members (ANADOLU OSGB, one yetkili each).

## Conversion rules (agreed with management)

- Every yetkili becomes a member (122 members after the conversion).
- The 7 yetkililer without a member become members with no company.
- The member with 2 yetkililer becomes 2 members pointing to one company.
- The two ANADOLU OSGB members become ATİLLA and VELİ, both pointing to one
  ANADOLU OSGB company: the two company records merge. Per field, a value
  present in only one copy is kept; when both have different values, staff
  choose (a counts-only query lists which fields differ, before the
  migration is written).

## Approaches

1. **Keep `member` as the person, add `company`** (picked). The 114 member
   rows keep their ids and URLs and gain the yetkili's personal fields; the
   company columns move to a new `company` table with `member.company_id`.
   8 new member rows for the yetkililer that don't map onto an existing one.
   Money and Organizasyon rows are re-pointed from yetkili to member through
   a mapping. Status/application/decision/SMS code already lives on
   `member` and stays put.
2. **Turn `authorized_representative` into the member, old `member` into
   `company`.** Money rows don't move, but status, Üye Giriş Tarihi, all
   `/uyelik` applicant fields and the Ret Notu move instead, every member URL
   changes, and the Yetkililer pages are renamed into Üyeler while the
   member pages become a company section. More churn for the same result.

Picked 1: the most complex logic (applications, decisions, SMS) stays where
it is, and re-pointing the money rows is verifiable with exact before/after
counts and sums per person.

## Data model

### `company` (new)

Moved from `member`: `title` (Ünvan), `title_key` (Turkish fold for lookup,
**not unique**: two separate firms may share a name), `logo`,
`logo_original`, `address`, `phone`, `sector_id`, `founding_date`,
`employee_count`, `website`, `company_intro`, `activity_document`.
`created_at`, `updated_at`.

### `member` (now the person)

- Keeps: `id`, `status`, `member_login_date`, `rejection_note`,
  `consented_at`, the person-side applicant fields (`birth_place`,
  `national_id`, `education`, `other_associations`, `gender`,
  `reference_name`, `identity_document`), timestamps.
- Name: `first_name`, `last_name` (both required), renamed from
  `applicant_first_name` / `applicant_last_name`. *Builder's call, see below.*
- Merged from the yetkili: `birth_date` (from `date_of_birth`),
  `mobile_phone` (from `phone`), `email`, `photo`, `notes`,
  `po_positive_card_no`.
- `company_id` → `company.id`, nullable, `on delete set null`.
- `company_role` (görev at the company), from `members_representatives.role`,
  falling back to `applicant_role`.
- The yetkili's `active` flag isn't carried over: all 122 are Aktif, and
  `status` already covers it.

### Re-pointed to `member`

`collection.representative_id`, `accrual.representative_id`,
`project_pledge.representative_id`, and `representative_id` in the five
Organizasyon `*_member` tables become `member_id` → `member.id`, keeping
their current `on delete` behavior (restrict for money, cascade for
Organizasyon).

`sms_send.contact_id`: `birthday` rows are remapped to the new member id,
`founding` rows to the new company id, so a same-day re-run can't send a
celebration twice.

## Migration, deploy 1 (switch over, keep the old data)

One migration, one transaction, SQL written by hand into the generated file:

1. Create `company`. Insert one company per member, remembering
   member → company in a temp mapping table.
2. Merge the ANADOLU OSGB pair: the rule is "members whose folded Ünvan
   matches exactly share one company"; on production that's only this pair.
   The kept values follow the staff decision from the field-diff check.
3. Add the person columns to `member` and fill them from each member's
   linked yetkili (113 + the first of the 2-yetkili member, picked by lowest
   yetkili id). Mapping yetkili → member in a temp table.
4. Insert 8 new members: the second yetkili of the 2-yetkili member
   (company = that company, status and Üye Giriş Tarihi copied from the
   first) and the 7 unlinked yetkililer (no company, Aktif, no Üye Giriş
   Tarihi). Name split for these: last word is Soyadı, the rest Adı.
5. Re-point every money and Organizasyon row and `sms_send` through the
   mappings.
6. Rewrite `{yetkili}` to `{uye}` in the stored tahsilat notice templates.
7. Leave `authorized_representative`, `members_representatives` and the old
   company columns on `member` in place, unused, untouched by the code. They
   stay in `schema.ts` (marked deprecated) so `db:generate` doesn't drop
   them.
8. Checks inside the migration that abort it if they fail: member count =
   old member count + 8; every yetkili has a mapped member; per-person
   counts and `sum(amount)` of tahsilatlar, tahakkuk and taahhüt equal
   before and after; Organizasyon row counts equal.

Field conflicts when merging yetkili into member (e.g. different email on
both): the yetkili's value wins when it's filled, because staff have been
editing yetkililer in the panel. A counts-only query, run on production
before the migration is finalized, shows how many conflicts there are per
field, so staff can look at them if there are any.

The audit log is not rewritten: old `representative` entries stay as
history with their labels. The migration itself writes one system audit
entry summarizing the conversion (counts only).

## Panel changes, deploy 1

- **Üyeler list**: rows are people. Columns: Ad Soyad (with
  `RepresentativeAvatar` photo), Firma (logo + Ünvan), Görev, Sektör, Cep
  Telefonu, E-posta, Üye Giriş Tarihi, Kıdem, Doğum Tarihi, Durum… The
  "Sütunlar" toggle keeps working; the saved column cookie for this table
  gets a new table id so old choices don't hide new columns.
- **Üye form**: Kişi Bilgileri section (yetkili form fields + the person-side
  application fields), then a Firma section: none / existing / new, like the
  tahsilat form's Proje section. "Existing" is a `SearchCombobox` over
  companies; its fields are editable in place, with a warning when the
  company has other members ("Bu firma 2 üyede kullanılıyor, değişiklik
  hepsinde görünür"). Organizasyonlar section moves here from the yetkili
  form.
- **Üye details**: person, company (with its other members linked),
  Tahsilatlar, Taahhütler, Tahakkuk rows, Organizasyon groups.
- **Removed**: Yetkililer sidebar item, pages, API, fetches, form schemas.
  `/representatives/:id` redirects to the matching member (via a kept
  yetkili→member id mapping) so old links and bookmarks still land.
- **Pickers** (Tahsilat, Taahhüt, Tahakkuk, Organizasyon): pick an Aktif
  member instead of an Aktif yetkili; labels "Yetkili" → "Üye".
- **Sektörler**: a sector's count is its Aktif members (through their
  company).
- **SMS**: birthday SMS go to members; founding-date SMS go once per company
  that has at least one Aktif member, to the company phone, `{firma}` the
  Ünvan. Manuel tab picks members only.
- **Tahsilat notices**: to the member; `{uye}` replaces `{yetkili}`.
- **`/uyelik`**: the applicant becomes an Aday member with a new company
  (if they filled company details). Staff can switch it to an existing
  company in the form, e.g. a partner of an existing member's firm.
- **Genel Bakış**: "Bu yıl tahsilatı olmayan aktif yetkililer" becomes
  "…aktif üyeler".
- **Deletes**: deleting a member keeps the 409 rules the yetkili had
  (tahsilatlar, taahhütler, tahakkuk). When the last member of a company is
  deleted or moved away, the company is deleted too (audited).
- **Audit**: member create/update/delete record person and company fields;
  company field changes made from a member's form are audited on the member
  entry and list the company. Labels in `audit-labels.ts`.
- **Release notes**: one Değiştirildi entry for the new member model, one
  Silindi for the Yetkililer page.

## Deploy 2 (drop the old data), scheduled

A separate pull request, opened right after deploy 1 is live:

- Removes the deprecated tables and columns from `schema.ts`, plus the
  generated drop migration: `authorized_representative`,
  `members_representatives`, and the old company columns on `member`. The
  yetkili→member id mapping used by the redirect is kept (its own small
  table), so it isn't dropped.
- No release notes (staff see nothing).
- Deletes the scheduler workflow below.

**Scheduler**: `.github/workflows/scheduled-cleanup.yml` lands on `main` with
deploy 1.

- `schedule` cron for one date and time (a week after deploy 1, 07:00
  Istanbul = 04:00 UTC), plus `workflow_dispatch` for a manual run.
- Steps: check today is the target date (cron fields repeat yearly), find the
  cleanup PR by its branch, require it to be open, not draft, up to date with
  `main`, and with passing checks. Otherwise fail with a message saying what
  to fix; GitHub emails a failed scheduled run, so a blocked cleanup turns
  into a reminder.
- Then `gh pr merge` and `gh workflow run deploy.yml --ref main`. A merge
  made with the workflow's `GITHUB_TOKEN` doesn't trigger `push` workflows,
  so the deploy is started explicitly (`deploy.yml` already has
  `workflow_dispatch`). Permissions: `contents`, `pull-requests`, `actions`:
  write.
- To stop it: disable the workflow in the Actions tab, or close or draft the
  PR.
- `main` has no branch protection, so the token can merge.

## Decided, and by whom

- Members are people; a company can have several members; a member needs no
  company; the conversion rules above: management.
- Approach 1 and the two-step rollout with a scheduled second deploy: the
  user.

## My calls (correct any)

- Ad and Soyad as two fields (the application already has them).
- The yetkili's value wins in a field conflict.
- The second person of the 2-yetkili company gets the first one's status and
  Üye Giriş Tarihi.
- Company-less members are Aktif with no Üye Giriş Tarihi.
- Founding-date SMS once per company, not once per member.
- A company with no members left is deleted.
- `{yetkili}` becomes `{uye}` in templates.
- `/representatives/:id` redirects to the member.

## Left to the builder

- Exact column order and defaults in the Üyeler list.
- How the Firma section lays out the company fields.
- Splitting this into commits and tests; test records follow the existing
  `__test__` rules.
