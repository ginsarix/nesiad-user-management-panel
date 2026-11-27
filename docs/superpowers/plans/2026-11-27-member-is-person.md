# Members Are People Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the panel's member from a company into a person who has zero or one company, fold yetkililer into members, and convert production data without losing anything; drop the old data in a second, scheduled deploy.

**Architecture:** `member` stays the table with status, applications and decisions and gains the yetkili's personal fields; a new `company` table takes the company columns, `member.company_id` points to it. Three migrations in deploy 1 (additive → hand-written conversion → constraints) re-point Tahsilat, Tahakkuk, Taahhüt and Organizasyon rows to members through a kept `representative_member_map`. The old tables and columns stay unused until a cleanup PR, merged by a one-shot scheduled GitHub workflow, drops them.

**Tech Stack:** Next.js 16 App Router, Hono RPC, drizzle-orm 1.0.0-rc.5 / drizzle-kit, Postgres, zod, react-hook-form, TanStack Query + Table v9, shadcn base-nova on Base UI, vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-27-member-is-person-design.md`

## Global Constraints

- UI text Turkish; code, comments, commits English. pnpm only.
- Load the `drizzle` skill (`pnpm-drizzle-kit-drizzle`) before touching `src/db/schema.ts`, `drizzle/`, or running drizzle-kit.
- Never edit or delete an existing migration in `drizzle/`. New ones only.
- Deploy 1 must leave `authorized_representative`, `members_representatives` and the legacy company columns on `member` (`title`, `logo`, `logo_original`, `address`, `phone`, `sector_id`, `founding_date`, `employee_count`, `website`, `company_intro`, `activity_document`) in the database with their data. Only the cleanup PR (Task 17) drops them.
- `representative_member_map` is kept forever (old-link redirect, audit history lookups).
- Every Hono mutation writes `recordAudit(tx, …)` in the same transaction with `actorOf(c)`; updates use `diffFields` / `change`; creates/deletes store the whole record.
- Applicant-side fields keep today's redaction (`diffRedacted`, "•••"): national id, birth place, education, gender, reference, other associations, identity document, consent, Ret Notu. Name, E-posta, Cep Telefonu, Doğum Tarihi, Notlar, PO card and photo are logged plainly as yetkili fields were. (Confirmed by the user 2026-11-27.)
- Money travels as strings; sums in Postgres or `sumAmounts` (BigInt kuruş), never JS number addition.
- Turkish-aware matching uses `foldTr` (TS) or the SQL fold `regexp_replace(lower(translate(trim(x), 'İIıŞşĞğÜüÖöÇçÂâÎîÛû', 'iiiSsGgUuOoCcAaIiUu')), '\s+', ' ', 'g')`.
- Forms: react-hook-form + zodResolver. Tables: TanStack Table v9 API. Base UI `render` props, not `asChild`.
- Pages prefetch with `queryClient.query` + `HydrationBoundary`; mutations invalidate `["members"]`, `["member", id]`, `["companies"]`, `["sectors"]`, `["collections"]`, `["accruals"]`, `["projects"]`, `["organizations", …]`, `["dashboard"]` wherever the changed data shows.
- Test records are named `__test__…` and removed in `afterAll`; never assert whole-table counts. Tests creating tahsilatlar through the route mock `@/lib/mail`.
- UI words: "Üye" replaces "Yetkili" everywhere staff see it; "Firma" is the company section; "Görev" is `company_role`.

## Review Focus

1. Editing a shared company's fields from member A changes what member B shows; the form warns first and the audit entry on A names the company. Test in Task 4 (`updates shared company fields for every member of it`).
2. Moving a member off a company that others still use must keep that company; moving the last member off deletes it and its logo file. Tests in Task 3 (`deleteCompanyIfOrphaned keeps a company that still has members`, `…deletes an orphaned company and its files`).
3. An `/uyelik` applicant whose company name matches an existing company gets a new company, never an automatic merge. Test in Task 5 (`application with an existing Ünvan creates a separate company`).
4. Aday/Reddedildi/Pasif members never appear in the tahsilat, taahhüt, tahakkuk or Organizasyon pickers for new rows, and a POST naming one is refused; an edit keeps a member that has since become Pasif. Tests in Task 6 and Task 7.
5. A member with tahsilatlar, taahhütler or tahakkuk rows can't be deleted (409 with counts); Organizasyon rows go with the member and are named in the audit entry. Test in Task 4 (`refuses to delete a member with tahsilat, taahhüt or tahakkuk rows`).

---

## File map

- `src/db/schema.ts` — `companyTable`, `representativeMemberMapTable`, member person columns, legacy columns, `memberId` on money/Organizasyon tables.
- `drizzle/<ts>_member_person_add/`, `drizzle/<ts>_member_person_convert/`, `drizzle/<ts>_member_person_constraints/` — deploy 1 migrations.
- `src/db/member-conversion.test.ts` — runs the real migrations on a scratch database with fixtures.
- `src/lib/zod-schemas/company.ts` (new), `member.ts`, `application.ts`, `collection.ts`, `accrual.ts`, `project.ts`, `organization.ts`, `sms.ts`, `collection-notices.ts`.
- `src/app/api/[[...route]]/companies.ts` (new), `company-writes.ts` (new), `members.ts`, `member-organizations.ts` (renamed from `representative-organizations.ts`), `member-rows.ts` (renamed from `representative-rows.ts`), `applications.ts`, `collections.ts`, `collection-queries.ts`, `accruals.ts`, `pledge-queries.ts`, `projects.ts`, `organizations.ts`, `organization-queries.ts`, `dashboard.ts`, `sms.ts`, `sectors.ts`, `app.ts`. Delete `representatives.ts` and its test.
- `src/lib/fetches/member.ts`, `company.ts` (new); delete `representative.ts`.
- `src/lib/member-records.ts` (renamed from `representative-records.ts`), `collection-notices.ts`, `sms/*`, `audit-labels.ts`, `audit-filters.ts`, `collection-filters.ts`, `nav.ts`, `release-notes.ts`.
- `src/components/use-member-items.ts` (renamed from `use-representative-items.ts`), `representative-avatar.tsx` → `member-avatar.tsx`, `collections-section.tsx`, `pledges-editor.tsx`.
- `src/app/(panel)/members/**` (rewritten), `src/app/(panel)/representatives/**` (replaced by redirects), pickers in `collections`, `projects`, `accruals`, `organization`.
- `.github/workflows/scheduled-cleanup.yml` (new).
- `CLAUDE.md` domain notes, `docs/could-have.md` if anything is deferred.

---

### Task 0: Pre-flight on production (user, before Task 2 is merged)

- [ ] **Step 1:** The user runs `prod-conflicts.sql` (counts only, given in chat) on production and pastes the output.
- [ ] **Step 2:** If any "member vs yetkili differ" count is non-zero, note it in the spec's conversion section: the yetkili value wins, staff review those members after deploy. ANADOLU OSGB field differences are resolved by the conversion rule in Task 2 (lower member id's value wins) and staff correct in the panel after deploy; list the differing field names in the release-day checklist (Task 15).

### Task 1: Schema, additive migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/<generated>_member_person_add/` (rename the generated folder suffix to `member_person_add`)

**Interfaces:**
- Produces:
  - `companyTable` (`company`): `id` identity pk; `title text not null`; `titleKey text not null` (`title_key`, fold of title, indexed, **not unique**); `logo`, `logoOriginal` (`logo_original`), `address`, `phone`, `website`, `companyIntro` (`company_intro`), `activityDocument` (`activity_document`) text; `sectorId` (`sector_id` → `sector.id` on delete set null); `foundingDate` (`founding_date` date string); `employeeCount` (`employee_count` int); `createdAt`, `updatedAt`.
  - `representativeMemberMapTable` (`representative_member_map`): `representativeId` int pk (no FK, outlives the yetkili table), `memberId` int not null → `member.id` on delete cascade.
  - On `memberTable`: renames `applicantFirstName`→`firstName` (`first_name`), `applicantLastName`→`lastName` (`last_name`), `applicantRole`→`companyRole` (`company_role`); new nullable `photo`, `notes`, `poPositiveCardNo` (`po_positive_card_no`), `companyId` (`company_id` → `company.id` on delete set null, indexed). Existing `birthDate`, `mobilePhone`, `email` stay.
  - Legacy member columns get TS names `legacyTitle` (`title`, now nullable), `legacyLogo`, `legacyLogoOriginal`, `legacyAddress`, `legacyPhone`, `legacySectorId`, `legacyFoundingDate`, `legacyEmployeeCount`, `legacyWebsite`, `legacyCompanyIntro`, `legacyActivityDocument`, each with a `/** @deprecated dropped by the cleanup PR */` comment.
  - Nullable `memberId` (`member_id`, int, no FK yet) added to `collection`, `accrual`, `project_pledge` and the five `*_member` Organizasyon tables, next to the still-present `representativeId`.

- [ ] **Step 1:** Edit `schema.ts` as above. Keep `authorizedRepresentativeTable` and `membersRepresentativesTable` unchanged, marked `@deprecated`.
- [ ] **Step 2:** `pnpm db:generate`. Answer `missing_hints` with renames for the three `applicant_*` columns (rerun with `--output json --hints '[…]'`). Expected: one new folder whose `migration.sql` only creates/adds/renames and drops `NOT NULL` on `member.title`; no `DROP`.
- [ ] **Step 3:** `grep -iE "drop (table|column)" drizzle/*member_person_add/migration.sql` → no output.
- [ ] **Step 4:** Commit `feat: add company table and member person columns (schema step 1)`. `tsc` errors elsewhere are expected until Task 13.

### Task 2: Conversion and constraint migrations, with a scratch-database test

**Files:**
- Create: `drizzle/<ts>_member_person_convert/migration.sql` via `pnpm exec drizzle-kit generate --custom --name member_person_convert`
- Modify: `src/db/schema.ts` (final deploy-1 shape)
- Create: `drizzle/<ts>_member_person_constraints/` via `pnpm db:generate --name member_person_constraints`
- Test: `src/db/member-conversion.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and columns.
- Produces (final deploy-1 schema): `memberId` not null with FK → `member.id` on `collection` / `accrual` / `project_pledge` (`on delete restrict`) and on the five Organizasyon person tables (`on delete cascade`), indexed like the old columns (`*_member_idx` names; Organizasyon tables' existing `${name}_member_representative_idx` replaced by `${name}_member_member_idx`); `representativeId` columns dropped from those eight tables; `member.first_name` and `member.last_name` not null.

Conversion SQL (in `member_person_convert`), in order, one transaction (the migrator's):

1. `create temp table member_company (member_id int primary key, company_id int)`; insert one `company` per member from the legacy columns (`title_key` = SQL fold of `title`), recording the pair. Members whose folded title equals another member's share the company of the lowest member id; per field, the lowest member id with a non-empty value supplies it.
2. `update member set company_id` from `member_company`.
3. For members with links: pick the linked yetkili with the lowest id per member as that member's person. Fill `first_name`/`last_name` only where null (split the yetkili name: last whitespace-separated word → last name, the rest → first name; a one-word name → first name, last name `''`), `email`, `mobile_phone` (from yetkili `phone`), `birth_date` (from `date_of_birth`): yetkili value when not null, else the member's. Copy `photo`, `notes`, `po_positive_card_no`. `company_role` = link `role` when not null, else the existing value. Insert into `representative_member_map`.
4. For every other yetkili linked to a member (the second of the two-yetkili member): insert a new member with the split name, the yetkili's fields, `company_id` of that member, `status` and `member_login_date` copied from that member, `company_role` from its link; map it.
5. For yetkililer with no link: insert a member with `status 'active'` (or `'passive'` when the yetkili is not active), no company, no `member_login_date`; map it.
6. `update collection/accrual/project_pledge/<5 org tables> set member_id = map.member_id from representative_member_map map where map.representative_id = representative_id`.
7. `update sms_send set contact_id = map.member_id … where kind = 'birthday'`; `… set contact_id = member.company_id from member where kind = 'founding' and contact_id = member.id and member.company_id is not null`.
8. `update collection_notice_settings` set every template column to `replace(col, '{yetkili}', '{uye}')`.
9. Checks, each `do $$ … raise exception '…' $$`: every `authorized_representative.id` is in the map; every money/Organizasyon row has `member_id`; for each of `collection`, `accrual`, `project_pledge`: per old `representative_id`, `count(*)` and `sum(amount)` (pledge: `sum(quantity * amount)`) equal per mapped `member_id`; no member without `first_name`.
10. Insert one `audit_log` row: actor null, `action 'conversion'`, `entity_type 'member'`, `entity_label 'Yetkililer üyelere dönüştürüldü'`, `details` = counts only (members kept, members added, companies created, companies merged, rows re-pointed per table). Add the `conversion` action label ("Dönüştürme") to `audit-labels.ts` in this task.

- [ ] **Step 1: Write the failing test** `src/db/member-conversion.test.ts`. `beforeAll`: `create database "nesiad_conv_<random>"` on the server from `DATABASE_URL` (dev role has `CREATEDB`), copy `drizzle/` to a temp dir without the convert and constraints folders, `migrate()` it, insert fixtures with plain SQL, then `migrate()` the full `drizzle/`. `afterAll`: drop the database. Fixtures and assertions:
  - `one yetkili → member keeps id and gains the yetkili's fields`: member M1 (title "Acme", email null) + yetkili "Ali Veli Kaya" (email `a@x`, phone `5551112233`, photo `p.jpg`); expect M1 `first_name`='Ali Veli', `last_name`='Kaya', `email`='a@x', `mobile_phone`='5551112233', `photo`='p.jpg', company title 'Acme'.
  - `member with two yetkililer → two members sharing one company`: M2 "Beta" `member_login_date` '2015-03-01' + yetkililer B1 (lower id), B2; expect B1→M2, B2→ a new member with `company_id` = M2's, `member_login_date` '2015-03-01', status 'active'.
  - `same Ünvan → one company`: M3 "ANADOLU OSGB" (logo 'a.png', address null) and M4 "Anadolu Osgb" (logo 'b.png', address 'Nevşehir'); expect one company, logo 'a.png' if M3.id < M4.id, address 'Nevşehir', both members point to it.
  - `unlinked yetkili with tahsilat → member without company, tahsilat follows`: yetkili U1 with 2 collections ('100.00', '50.50'); expect a member with `company_id` null, `member_login_date` null, status active, 2 collections summing '150.50' with its `member_id`.
  - `accrual, pledge and Organizasyon rows follow their yetkili` (one each for B2).
  - `sms_send ids remapped` (one birthday row for U1, one founding row for M1).
  - `templates use {uye}`: notice settings row containing `{yetkili}` → `{uye}`.
  - `legacy data is left in place`: `authorized_representative` and `members_representatives` row counts unchanged, `member.title` of M1 still 'Acme'.
  - `works on an empty database`: a second scratch database migrated with no fixtures succeeds (CI runs `db:migrate` on an empty database).
- [ ] **Step 2:** `pnpm test --run member-conversion` → FAIL (convert migration missing).
- [ ] **Step 3:** Write the convert migration SQL as listed above.
- [ ] **Step 4:** Update `schema.ts` to the final deploy-1 shape and `pnpm db:generate --name member_person_constraints`. Hint: the new `member_id` columns are not renames of `representative_id`. Check the SQL drops only the eight `representative_id` columns (their data is preserved through the map) and sets the not-nulls/FKs.
- [ ] **Step 5:** `pnpm test --run member-conversion` → PASS. `pnpm exec drizzle-kit check --output json` → status ok, no warnings.
- [ ] **Step 6: Bring the dev database along.** Dev is built by push, so don't `db:migrate` it: run Task 1's `migration.sql` statements that push would make via `pnpm db:push` *at the Task 1 schema* (check out Task 1's commit's `schema.ts` into place), then `psql "$DATABASE_URL" -f drizzle/<ts>_member_person_convert/migration.sql`, then restore the final `schema.ts` and `pnpm db:push`. Alternative if it fights back: dev data is disposable; recreate the dev database and push.
- [ ] **Step 7:** Commit `feat: convert yetkililer into members (migrations)`.

### Task 3: Company writes and the companies API

**Files:**
- Create: `src/lib/zod-schemas/company.ts`, `src/app/api/[[...route]]/company-writes.ts`, `src/app/api/[[...route]]/companies.ts`, `src/app/api/[[...route]]/companies.test.ts`
- Modify: `src/app/api/[[...route]]/app.ts` (mount `/companies`), `src/lib/audit-labels.ts`

**Interfaces:**
- Produces:
  - `companyFieldsSchema` (API, multipart strings → typed): `title` (required, trimmed), `address`, `phone`, `website`, `companyIntro`, `sectorId` (int|null), `foundingDate` (`yyyy-aa-gg`|null), `employeeCount` (int|null). `companyFormSchema` is its form twin (dates `gg.aa.yyyy`).
  - `memberCompanyInputSchema` = JSON text of `{ mode: "none" } | { mode: "existing", id: number, fields: CompanyFields } | { mode: "new", fields: CompanyFields }`; type `MemberCompanyInput`.
  - `applyMemberCompany(tx, input: MemberCompanyInput, currentCompanyId: number | null): Promise<{ companyId: number | null; changes: AuditChange[]; createdCompany: boolean }>` — "existing" updates that company's fields (diffs become changes prefixed "Firma: …"), "new" inserts, "none" returns null. Logo/activity document files are handled by the member route.
  - `deleteCompanyIfOrphaned(tx, companyId: number): Promise<{ deleted: boolean; files: string[] }>` — deletes when no member points to it, returns its files for deletion after commit.
  - `GET /api/companies` → `{ id, title, logo, memberCount }[]` sorted with `compareTr`; `GET /api/companies/:id` → full fields + `sectorName` + `members: { id, name, status }[]`.
  - Audit labels: `company` entity type ("Firma"), its fields' labels.

- [ ] **Step 1: Failing tests** in `companies.test.ts`: `lists companies with member counts`; `returns a company with its members`; `applyMemberCompany creates a new company`; `applyMemberCompany updates an existing company and reports Firma changes`; `deleteCompanyIfOrphaned keeps a company that still has members`; `deleteCompanyIfOrphaned deletes an orphaned company and its files`; `rejects an existing company id that doesn't exist` (400 from the schema or a typed error → 400 in the route).
- [ ] **Step 2:** `pnpm test --run companies` → FAIL.
- [ ] **Step 3:** Implement the files above.
- [ ] **Step 4:** `pnpm test --run companies` → PASS.
- [ ] **Step 5:** Commit `feat: companies API and member company writes`.

### Task 4: Members API as people

**Files:**
- Modify: `src/app/api/[[...route]]/members.ts`, `members.test.ts`, `src/lib/zod-schemas/member.ts`
- Rename: `representative-organizations.ts` → `member-organizations.ts` (`syncMemberOrganizations`), `src/lib/representative-records.ts` → `member-records.ts` (`memberRecordsText`, `hasMemberRecords`, type `MemberRecordCounts`)

**Interfaces:**
- Consumes: Task 3's `memberCompanyInputSchema`, `applyMemberCompany`, `deleteCompanyIfOrphaned`.
- Produces:
  - `GET /api/members` rows: `{ id, firstName, lastName, name, status, memberLoginDate, birthDate, mobilePhone, email, photo, companyRole, poPositiveCardNo, notes, createdAt, company: { id, title, logo, sectorId, sectorName, phone, address, foundingDate, memberCount } | null }`. `name` = `firstName + " " + lastName`, trimmed.
  - `GET /api/members/:id`: the above + application fields (national id masked as today) + `company` full fields + `company.otherMembers: { id, name, status }[]` + `organizations` (rows as the yetkili detail had them) + record counts `{ collections, pledges, accruals }`.
  - `POST /api/members` / `PATCH /api/members/:id` multipart: person fields (`firstName`, `lastName` required on POST), `companyRole`, application fields, `company` (JSON text, `MemberCompanyInput`; PATCH without it leaves the company alone), `organizations` (as the yetkili form sent it; PATCH without it leaves them), files `photo` / `removePhoto`, `logo` + `logoOriginal` / `removeLogo` (apply to the member's company; 400 "Üyenin firması yok" when none), `identityDocument`, `activityDocument` (company's). Moving off a company calls `deleteCompanyIfOrphaned` on the old one in the same transaction, files deleted after commit.
  - `DELETE /api/members/:id`: 409 with `MemberRecordCounts` text when tahsilat/taahhüt/tahakkuk rows exist; Organizasyon rows cascade and are listed in the audit details; orphaned company deleted.
  - Audit: `entityLabel` = member name; company field changes as "Firma: <label>"; a create records person + company.

- [ ] **Step 1: Failing tests** (rewrite `members.test.ts` around people; keep the existing application/decision/national-id/logo/document tests, adjusted): `creates a member with a new company`; `creates a member without a company`; `creates a member on an existing company`; `updates shared company fields for every member of it` (A and B on one company; PATCH A's company title; GET B shows it; A's audit entry has a "Firma: Ünvan" change); `moving a member to no company deletes the orphaned company`; `logo upload sets the company logo`; `logo upload without a company is refused`; `photo upload and removal`; `organizations sent with the member replace only its rows`; `refuses to delete a member with tahsilat, taahhüt or tahakkuk rows`; `deleting a member removes its Organizasyon rows and names them in the audit entry`.
- [ ] **Step 2:** `pnpm test --run "api/.*/members"` → FAIL.
- [ ] **Step 3:** Implement. Move (not copy) the yetkili photo pieces: `photoFileSchema`, `MAX_PHOTO_SIZE`, `PHOTO_TOO_LARGE_MESSAGE` into `src/lib/zod-schemas/member.ts`, and the yetkili route's photo store/replace/delete code into a module the members route imports (`representatives.ts` may import it from there until Task 9 deletes it). Organizations sync uses `memberId`.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit `feat: members API for people with a company`.

### Task 5: Applications and decisions

**Files:**
- Modify: `src/app/api/[[...route]]/applications.ts`, `applications.test.ts`, `src/lib/zod-schemas/application.ts`, the application notice helper the decision route calls, `src/app/(public)/uyelik/*` only where field names changed (`applicantFirstName` → `firstName`, etc.)

**Interfaces:**
- Consumes: `applyMemberCompany` with `{ mode: "new" }`.
- Produces: an application creates an Aday member and, when the company title is filled, a new company. Notices fill `{ad}` with the member name and `{firma}` with the company title (empty string when none).

- [ ] **Step 1: Failing tests:** `application creates an Aday member and a new company`; `application with an existing Ünvan creates a separate company`; `acceptance notice uses the member name and company title`.
- [ ] **Step 2:** `pnpm test --run applications` → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: applications create a person member with a company`.

### Task 6: Tahsilat, Taahhüt, Tahakkuk and Genel Bakış point to members

**Files:**
- Modify: `collections.ts`, `collection-queries.ts`, `collections.test.ts`, `accruals.ts`, `accruals.test.ts`, `pledge-queries.ts`, `projects.ts`, `projects.test.ts`, `dashboard.ts`, `dashboard.test.ts`, `parameters.test.ts`, `cash-accounts.test.ts`, `audit-entries.test.ts`; rename `representative-rows.ts` → `member-rows.ts`; `src/lib/collection-notices.ts` (+test), `collection-filters.ts`, `accruals.ts`, `pledges.ts` (+tests), `collection-prerequisites.ts` (+test), zod `collection.ts`, `accrual.ts`, `project.ts`, `collection-notices.ts`, `src/lib/sms/templates.ts` (`COLLECTION_NOTICE_PLACEHOLDERS.uye = "üyenin adı soyadı"`, defaults use `{uye}`; staff texts "Üye: {uye}").

**Interfaces:**
- Produces: `assertUsableMembers(tx, ids: number[], keep: number[]): Promise<void>` (throws the existing typed error; Aktif required unless in `keep`); request/response fields `memberId` / `memberName` replace `representativeId` / `representativeName`; collection list filter URL param `member` replaces `representative`; dashboard's "aktif yetkililer" query becomes members with `status = 'active'`.

- [ ] **Step 1: Failing tests** (update existing ones by renaming fields, plus): `new tahsilat refuses an Aday, Reddedildi or Pasif member`; `editing a tahsilat keeps its member after it became Pasif`; `tahsilat notice fills {uye}`; same Aktif/keep pair for taahhüt and tahakkuk.
- [ ] **Step 2:** run `pnpm test --run "collections|accruals|projects|dashboard|collection-notices|pledges"` → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: money records point to members`.

### Task 7: Organizasyon points to members

**Files:** `organizations.ts`, `organization-queries.ts`, `organizations.test.ts`, zod `organization.ts`, `src/lib/organizations.ts` (+test), `src/lib/fetches/organization.ts`.

**Interfaces:** rows carry `memberId` / `memberName`; new rows need an Aktif member; kept Pasif ones stay (`assertUsableMembers`).

- [ ] **Step 1: Failing tests:** rename fields in existing tests; add `a group refuses an Aday member`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm test --run organizations`).
- [ ] **Step 5:** Commit `feat: Organizasyon groups list members`.

### Task 8: SMS

**Files:** `src/lib/sms/celebrations.ts`, `load-celebrations.ts`, `recipients.ts`, `templates.ts` (`TEMPLATE_PLACEHOLDERS.ad` = "firmanın unvanı ya da üyenin adı"), their tests, `sms.ts` + `sms.test.ts`, zod `sms.ts`.

**Interfaces:** `Contact.kind` becomes `"member"` only (founding celebrations use `kind: "company"` internally with the company id); `loadCelebrants()` returns `{ companies: { id, name: title, phone, foundingDate }[], members: { id, name, phone: mobilePhone, birthDate }[] }` — companies with at least one Aktif member, Aktif members with a birth date.

- [ ] **Step 1: Failing tests:** `birthday SMS go to Aktif members`; `Aday members get no birthday SMS`; `a company with two Aktif members gets one founding SMS`; `a company with only Pasif members gets none`; `manual recipients are members`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm test --run sms`).
- [ ] **Step 5:** Commit `feat: celebration SMS for members and companies`.

### Task 9: Remove the yetkili API and keep old links working

**Files:**
- Delete: `representatives.ts`, `representatives.test.ts`, `src/lib/fetches/representative.ts`, `src/lib/zod-schemas/authorized-representative.ts` (its photo pieces already moved in Task 4), all of `src/app/(panel)/representatives/**` except the two redirect pages below.
- Create: `src/app/(panel)/representatives/page.tsx` (`redirect("/members")`), `src/app/(panel)/representatives/[id]/page.tsx` (looks up `representative_member_map` server-side through a small `GET /api/members/by-representative/:id` → `{ id }`, then `redirect("/members/<id>")`, `notFound()` when missing).
- Modify: `app.ts`, `sectors.ts` (counts: Aktif members through `company.sector_id`), `src/lib/audit-filters.ts` (keep the "representative" entity type filterable as "Yetkili (eski)" for history).

- [ ] **Step 1: Failing tests:** `by-representative returns the mapped member`; `sector counts count Aktif members through their company`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat: remove Yetkililer API, redirect old links`.

### Task 10: Client fetches and pickers

**Files:** `src/lib/fetches/member.ts`, `company.ts` (new: `getCompanies`, `getCompany`), `src/components/use-member-items.ts`, `member-avatar.tsx`, `collections-section.tsx`, `pledges-editor.tsx`, picker forms and prefetches under `collections/`, `projects/`, `accruals/`, `organization/`, `src/app/(panel)/collections/_components/missing-prerequisites-notice.tsx`.

**Interfaces:** `useMemberItems(selectedIds: number[])` → combobox items of Aktif members plus the selected ones, label `name`, description company title; prefetch key `["members"]`. Labels "Yetkili" → "Üye".

- [ ] **Step 1:** Update; `pnpm exec tsc --noEmit` shows no errors in these files.
- [ ] **Step 2:** Commit `feat: pickers choose members`.

### Task 11: Üyeler list

**Files:** `src/app/(panel)/members/page.tsx`, `members.tsx`.

**Interfaces:** table id `members-v2` (fresh column cookie). Columns: Ad Soyad (avatar), Firma (logo + Ünvan), Görev, Sektör, Cep Telefonu, E-posta, Üye Giriş Tarihi, Kıdem, Doğum Tarihi, Durum, Başvuru Tarihi (hidden by default), PO Positive Card No (hidden), Notlar (hidden). Search folds name, company title, phone, email with `foldTr`. Default filter Aktif stays.

- [ ] **Step 1:** Implement; check in the dev panel (log in with the dev session script) that search "anadolu" shows both members of a shared company.
- [ ] **Step 2:** Commit `feat: Üyeler list shows people`.

### Task 12: Üye form

**Files:** `members/_components/member-form.tsx` (split: `person-fields.tsx`, `company-section.tsx`, `organizations-section.tsx` moved from the yetkili form), `members/new/page.tsx`, `members/[id]/edit/*`.

**Interfaces:** form values `MemberFormValues` = person fields + `company: { mode: "none" } | { mode: "existing", id, fields } | { mode: "new", fields }` + `organizations`. Company section: three-way choice like the tahsilat form's Proje section; "existing" uses `SearchCombobox` over `getCompanies`, loads the fields into editable inputs, and shows "Bu firma N üyede kullanılıyor, değişiklik hepsinde görünür" when `memberCount > 1` (counting other members). Logo drop zone lives in the company section. `useNavigationGuard` while dirty.

- [ ] **Step 1:** Implement; in the dev panel create a member with a new company, one on the existing company, one with none; edit the shared company from the second and see the warning.
- [ ] **Step 2:** Commit `feat: Üye form with person and Firma sections`.

### Task 13: Üye details and cleanup of leftovers

**Files:** `members/[id]/*` (details, photo buttons from the yetkili pages, logo buttons, decision parts), `member-info.tsx`, `src/lib/nav.ts` (drop Yetkililer), `src/app/(panel)/dashboard.tsx` labels, `settings/collection-notice-settings.tsx` placeholder help, `sms/manual-sms.tsx`, `sms/auto-sms.tsx`.

**Interfaces:** details sections: Kişi, Firma (with "Bu firmadaki diğer üyeler" links), Başvuru (as today), Organizasyonlar, Tahsilatlar, Taahhütler, Tahakkuk.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `grep -rniE "representative|yetkili" src --exclude-dir=db` → only `representative_member_map` uses, the redirect pages, audit history labels, and comments that explain history.
- [ ] **Step 3:** `pnpm lint && pnpm exec next typegen && pnpm exec tsc --noEmit && pnpm test --run && pnpm build` → all pass.
- [ ] **Step 4:** Commit `feat: Üye details page; remove Yetkililer from the panel`.

### Task 14: Docs and release notes

**Files:** `src/lib/release-notes.ts`, `CLAUDE.md` (Domain notes: members are people with an optional company; yetkili paragraphs rewritten; Tahsilat "yetkili" → "üye"; mention `representative_member_map` and the cleanup PR), memory note in the user's memory dir for "tahsilat → yetkili" superseded.

- [ ] **Step 1:** New version dated the push day: Değiştirildi "Üyeler artık kişilerdir; firma bilgileri üyenin içinde, Firma bölümünde girilir ve bir firma birden fazla üyede kullanılabilir.", Değiştirildi "Tahsilat, Taahhüt, Tahakkuk ve Organizasyon kayıtları artık üyeye bağlıdır.", Silindi "Yetkililer sayfası kaldırıldı; yetkililer üye oldu.", Değiştirildi "Tahsilat bildirim şablonlarında {yetkili} yerine {uye} kullanılır.".
- [ ] **Step 2:** `pnpm test --run release-notes` → PASS. Commit `docs: release notes and CLAUDE.md for members as people`.

### Task 15: Rehearsal on a production copy (needs the user's go-ahead)

- [ ] **Step 1:** User's call: `pg_dump` production through the tunnel into a local scratch database (`createdb nesiad_rehearsal`), never the dev database.
- [ ] **Step 2:** `DATABASE_URL=…/nesiad_rehearsal pnpm db:migrate` → succeeds; the in-migration checks didn't raise.
- [ ] **Step 3:** Counts-only checks: 122 members, 114 member rows kept their ids, ANADOLU members share one company, 7 members without company, per-member tahsilat totals equal per-yetkili totals before.
- [ ] **Step 4:** Point a local `pnpm dev` at it, click through Üyeler, one shared company, a tahsilat, an Organizasyon group. Drop the database afterwards (`dropdb nesiad_rehearsal`).
- [ ] **Step 5:** Release-day checklist written into the PR description: deploy outside working hours; after deploy, staff check ANADOLU OSGB's company fields (differing ones from Task 0) and the 8 new members' Ad/Soyad split.

### Task 16: Scheduled cleanup workflow (lands with deploy 1)

**Files:** Create `.github/workflows/scheduled-cleanup.yml`.

**Interfaces:**
- Triggers: `schedule: - cron: "0 4 <day> <month> *"` (07:00 Istanbul, the day = deploy-1 day + 7, set when Task 16 is merged) and `workflow_dispatch`.
- `env.TARGET_DATE: "<yyyy-mm-dd>"`, `env.CLEANUP_BRANCH: "cleanup/drop-yetkili-legacy"`.
- `permissions: contents: write, pull-requests: write, actions: write`.
- Steps (bash with `gh`, `GH_TOKEN: ${{ github.token }}`): on `schedule`, exit 0 unless `date -u +%F` = `TARGET_DATE`; find the open PR whose head is `CLEANUP_BRANCH` (fail "Temizlik PR'ı bulunamadı" if none); fail when draft, when `gh pr view --json mergeStateStatus` isn't `CLEAN`, when its head isn't up to date with `main` (`gh api repos/{owner}/{repo}/compare/main...<head>` `behind_by` > 0), or when any check isn't successful; then `gh pr merge <n> --merge --delete-branch` and `gh workflow run deploy.yml --ref main`.

- [ ] **Step 1:** Write the workflow. Check it with `actionlint` if installed (`pnpm dlx actionlint` is not a package; use `brew install actionlint` only if the user agrees), otherwise review by hand.
- [ ] **Step 2:** Dry check, right after deploy 1 is on `main` and before the cleanup PR exists (`workflow_dispatch` only works for workflows on the default branch): `gh workflow run scheduled-cleanup.yml --ref main` → fails with "Temizlik PR'ı bulunamadı" (proves the guard and token permissions).
- [ ] **Step 3:** Commit `ci: one-shot scheduled cleanup of the yetkili leftovers`.

### Task 17: Cleanup PR (after deploy 1 is live)

**Files:** `src/db/schema.ts` (remove `authorizedRepresentativeTable`, `membersRepresentativesTable`, the `legacy*` member columns), new migration `drizzle/<ts>_drop_yetkili_legacy/`, delete `.github/workflows/scheduled-cleanup.yml`, `CLAUDE.md` note about the leftovers.

- [ ] **Step 1:** Branch `cleanup/drop-yetkili-legacy` from `main` after deploy 1.
- [ ] **Step 2:** Remove the schema pieces; `pnpm db:generate --name drop_yetkili_legacy`; the SQL drops exactly those two tables and eleven columns, nothing else (`representative_member_map` stays).
- [ ] **Step 3:** `pnpm lint && pnpm exec tsc --noEmit && pnpm test --run && pnpm build` → pass; `drizzle-kit check` ok.
- [ ] **Step 4:** Push, open the PR titled "Drop the yetkili leftovers (scheduled)", body states the drop and the date, no release notes. Leave it open; the workflow merges it. Tell the user how to stop it.
