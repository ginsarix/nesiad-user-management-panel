# Public Membership Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old PHP application form with a public five-step form that creates Aday members, which staff accept or reject in the panel, with automatic email and SMS notices.

**Architecture:** `member.active` becomes a four-value `status`. One new public Hono route creates Aday records and files. Staff decisions go through one conditional status update that commits first and sends notices afterwards. Applicant field values stay out of the append-only audit log.

**Tech Stack:** Next.js 16 App Router, Hono RPC, Drizzle/Postgres, zod 4, react-hook-form, TanStack Query/Table v9, Base UI shadcn, Vitest against the development database.

**Spec:** `docs/superpowers/specs/2026-11-06-membership-application-design.md`. Read it before starting any task.

## Global Constraints

- Branch: `feat/membership-application`. Never merge or push without the user asking.
- UI text is Turkish; code, comments and commits are English. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Status values: `active`, `passive`, `candidate`, `rejected`. Labels: Aktif, Pasif, Aday, Reddedildi.
- Upload limit: 5 MB per file. Logo: PNG or JPG. Documents: PDF, PNG or JPG. Type checked by content with `file-type`.
- Spam limit: 5 saved submissions per IP per hour, keyed by `x-real-ip`; a missing header skips the limit.
- TC numbers and document filenames never appear in the member list response; TC numbers never appear in the member detail response.
- A submission writes no audit entry. New applicant field values are never written to audit `details` or `changes`.
- Only Aday → Aktif and Aday → Reddedildi send notices. Notices go out after commit and never undo a decision.
- Before editing `src/db/schema.ts` or any migration, load the `pnpm-drizzle-kit-drizzle` skill. Schema changes: `pnpm db:push`, then `pnpm db:generate`. Never run `db:migrate` on the development database.
- Before writing Next.js code, check `node_modules/next/dist/docs/`. Before writing table code, load the `pnpm-@tanstack+react-table-table-state` skill.
- Tests run with `pnpm test --run <pattern>`, against the real database, with `__test__` record names cleaned up in `afterAll`. Mock mail with `vi.mock("@/lib/mail", ...)` and NetGSM as `sms.test.ts` does. Never assert on whole-table counts.
- Every task ends with `pnpm lint`, `pnpm exec tsc --noEmit` and the task's tests passing.

## Review Focus

1. Two staff members (or a double click) decide the same Aday at once: exactly one status change and one set of notices; the other gets a 409.
2. A file named `.JPG` or `.jpeg`, or a browser sending an empty MIME type, is accepted; a `.pdf` whose content is something else is refused.
3. An applicant corrects a server-rejected field and resubmits: rejected attempts don't count toward the 5-per-hour limit.
4. Submit fails on a non-JSON response (413 from a front server) or a network error: a Turkish error appears and the form, including chosen files, stays intact.
5. A sector deleted while the Kabul Et dialog is open: the decision returns 400 with the existing sector error, changes nothing and sends nothing.

---

### Task 1: Member status replaces `active`

**Files:**
- Create: `src/lib/member-status.ts`, `src/lib/member-status.test.ts`, `drizzle/<generated>/migration.sql`
- Modify: `src/db/schema.ts`, `src/lib/audit-diff.ts`, `src/lib/zod-schemas/member.ts`, `src/lib/fetches/member.ts`, `src/lib/sms/load-celebrations.ts`, `src/components/info-fields.tsx`
- Modify API: `src/app/api/[[...route]]/{members,sms,sectors,representatives}.ts`
- Modify UI: `src/app/(panel)/members/members.tsx`, `src/app/(panel)/members/_components/{member-form,member-info}.tsx`, `src/app/(panel)/members/[id]/{member-details,toggle-active-button}.tsx`, `src/app/(panel)/representatives/_components/representative-form.tsx`, `src/app/(panel)/representatives/[id]/representative-details.tsx`
- Test: `src/app/api/[[...route]]/{members,sectors,representatives,sms}.test.ts` and any existing test using member `active`

**Interfaces:**
- Produces, from `src/lib/member-status.ts` (client-safe, no db imports):
  - `MEMBER_STATUSES = ["active", "passive", "candidate", "rejected"] as const`
  - `type MemberStatus`
  - `MEMBER_STATUS_LABELS: Record<MemberStatus, string>`
  - `isEstablished(status: MemberStatus): boolean`, true for active and passive
- Produces: `memberTable.status` typed `MemberStatus`, API member field `status`
- Produces: `setMemberStatus(id: number, status: "active" | "passive")` in `fetches/member.ts`, replacing `setMemberActive`
- Produces: `<StatusTag status={MemberStatus} />` in `info-fields.tsx`, rendering nothing for `active`. `PassiveTag` stays for yetkililer. Aday and Reddedildi use visibly different tag colours.

- [ ] **Step 1: Write the failing API tests**

In `members.test.ts`, replacing existing `active` cases:

```ts
it("defaults to active and accepts passive", ...)        // POST status omitted → "active"; POST status: "passive" → "passive"
it("refuses creating a candidate", ...)                  // POST status: "candidate" → 400
it("refuses changing a candidate through PATCH", ...)    // db-insert a candidate, PATCH status: "active" → 409, status unchanged
it("still edits other fields of a candidate", ...)       // PATCH title on a candidate → 200, status still "candidate"
it("audits status changes as display labels", ...)       // PATCH active→passive → change { label: "Durum", from: "Aktif", to: "Pasif" }
```

In `sms.test.ts`: a `candidate` and a `rejected` member with mobile numbers are absent from `GET /contacts` and `loadCelebrationsOn`, while a `passive` one stays absent as today.

In `sectors.test.ts`: a sector with one each of the four statuses reports `memberCount: 2`.

In `representatives.test.ts`: linking a `candidate` or `rejected` member returns 400 with `"Aday veya reddedilmiş üyeye yetkili bağlanamaz"` and writes no link.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test --run members sectors representatives sms`
Expected: FAIL because `status` doesn't exist yet.

- [ ] **Step 3: Change the schema and generate the migration**

`status: text().$type<MemberStatus>().default("active").notNull()` replaces `active` on `memberTable` only, with `check("member_status_valid", sql\`${table.status} IN ('active','passive','candidate','rejected')\`)`. Run `pnpm db:push`, then `pnpm db:generate` (drop `active`, create `status`: answer any `missing_hints` as a create, not a rename). Replace the generated statements with exactly:

```sql
ALTER TABLE "member" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE "member" SET "status" = CASE WHEN "active" THEN 'active' ELSE 'passive' END;--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_status_valid" CHECK ("status" IN ('active','passive','candidate','rejected'));
```

- [ ] **Step 4: Verify the migration against a scratch database**

```bash
psql "$DATABASE_URL" -c 'CREATE DATABASE nesiad_migration_check'
# point SCRATCH at the same server with database nesiad_migration_check
psql "$SCRATCH" -f drizzle/20261103103511_init/migration.sql
psql "$SCRATCH" -c "INSERT INTO member (title, active) VALUES ('a', true), ('p', false)"
psql "$SCRATCH" -f drizzle/<new>/migration.sql
psql "$SCRATCH" -c "SELECT title, status FROM member ORDER BY title"
psql "$DATABASE_URL" -c 'DROP DATABASE nesiad_migration_check'
```

Expected: `a | active`, `p | passive`, with no errors.

- [ ] **Step 5: Implement the API and query changes**

- `createMemberSchema`: `status: z.enum(["active", "passive"]).optional()` replaces `active`, and `updateMemberSchema` inherits it.
- `PATCH /:id`: when `status` is present and `!isEstablished(existing.status)`, return 409 `"Bu üyenin durumu buradan değiştirilemez"`.
- `formatAudit.active` stays for yetkililer. Add `formatAudit.memberStatus`, and member audit spec key `status` uses it with label `Durum`.
- SMS queries: `eq(memberTable.status, "active")`. Sector count: join condition adds `inArray(memberTable.status, ["active", "passive"])` so sectors with no such members still list with 0.
- Representatives API: before `replaceLinks` on create and update, reject links to `candidate` or `rejected` members.
- `selectLinkedMembers` returns `status` instead of `active`.

- [ ] **Step 6: Implement the UI changes**

- `members.tsx`: `MemberStatus` filter type gains `candidate` and `rejected`; items in order Aktif üyeler, Pasif üyeler, Adaylar, Reddedilenler, Tüm üyeler; `parseStatus` accepts them; `matchesStatus` compares `member.status`. Rows use `StatusTag`.
- `member-details.tsx`: Durum shows `MEMBER_STATUS_LABELS[member.status]`; `ToggleActiveButton` and "Yetkili ekle" only render when `isEstablished(member.status)`.
- `member-form.tsx`: form field `status` is `"active" | "passive"`; the checkbox renders only when creating or when the member is established; when it isn't, `toMemberForm` omits `status`.
- `representative-form.tsx`: picker filters to established members, labelling Pasif as today.

- [ ] **Step 7: Run tests and verify they pass**

Run: `pnpm test --run`, `pnpm lint`, `pnpm exec tsc --noEmit`
Expected: all pass, with no remaining `memberTable.active` or `member.active` (`grep -rn "member\.active\|memberTable\.active" src` is empty).

- [ ] **Step 8: Commit**

Commit message: `feat: replace member active flag with a status`. The body must state that the migration converts every production member row and needs a deploy while nobody is using the panel.

---

### Task 2: Applicant fields, audit redaction, TC and documents (API)

**Files:**
- Create: `src/lib/national-id.ts`, `src/lib/national-id.test.ts`, `src/lib/uploads.ts`, `src/lib/uploads.test.ts`, `drizzle/<generated>/migration.sql`
- Modify: `src/db/schema.ts`, `src/lib/audit-diff.ts`, `src/lib/audit-diff.test.ts` (create if missing), `src/lib/zod-schemas/member.ts`, `src/app/api/[[...route]]/{members,files}.ts`, `src/lib/fetches/member.ts`
- Test: `src/app/api/[[...route]]/members.test.ts`

**Interfaces:**
- Produces, `memberTable` nullable columns (TS name → DB name):
  `applicantFirstName` → `applicant_first_name`, `applicantLastName` → `applicant_last_name`, `applicantRole` → `applicant_role`, `employeeCount` (integer) → `employee_count`, `website`, `email`, `mobilePhone` → `mobile_phone`, `birthDate` (date string) → `birth_date`, `birthPlace` → `birth_place`, `nationalId` → `national_id`, `education`, `otherAssociations` → `other_associations`, `companyIntro` → `company_intro`, `gender` (`$type<"male" | "female">`), `referenceName` → `reference_name`, `identityDocument` → `identity_document`, `activityDocument` → `activity_document`, `consentedAt` (timestamptz) → `consented_at`
- Produces: `isValidNationalId(value: string): boolean`, `maskNationalId(value: string): string` (first 3 digits + 8 `•`)
- Produces, from `src/lib/uploads.ts`:
  - `LOGO_MIME_TYPES = ["image/png", "image/jpeg"]`, `DOCUMENT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"]`
  - `storeUpload(file: File, allowed: readonly string[], baseName: "logo" | "document"): Promise<string | null>`, returning null when the content isn't an allowed type. Stored names start with `document_` or `logo_`, never the applicant's filename.
- Produces: `MAX_REQUEST_SIZE = 3 * MAX_LOGO_SIZE + 1024 * 1024`, and in `zod-schemas/member.ts`: `documentFileSchema` (size ≤ 5 MB, name matches `/\.(pdf|png|jpe?g)$/i`, not empty), `normalizeWebsite(value: string): string | null`, returning null unless `http`/`https`
- Produces: `diffRedacted(labels: Record<string, string>, before, update): AuditChange[]`, comparing raw values and emitting `{ label, from, to }` where each side is `"•••"` when set and `"—"` when empty
- Produces API: detail response has `nationalIdMasked: string | null`, `identityDocument`, `activityDocument`, and no `nationalId`. List response has none of those. `GET /api/members/:id/national-id` → `{ nationalId: string | null }`.
- Produces: `getMemberNationalId(id: number)` in `fetches/member.ts`; `MemberFormValues` gains the new fields.

- [ ] **Step 1: Write the failing unit tests**

```ts
// national-id.test.ts
expect(isValidNationalId("10000000146")).toBe(true);
for (const bad of ["10000000147", "00000000000", "1234567890", "1000000014a"]) expect(isValidNationalId(bad)).toBe(false);
expect(maskNationalId("10000000146")).toBe("100••••••••");

// uploads.test.ts
it("stores a PNG named .JPG by content", ...)         // storeUpload(new File([PNG], "x.JPG", { type: "" }), DOCUMENT_MIME_TYPES, "document") → /^document_.*\.png$/
it("refuses text renamed to .pdf", ...)               // → null
it("refuses a PDF as a logo", ...)                    // storeUpload(pdf, LOGO_MIME_TYPES, "logo") → null
it("doesn't keep the original filename", ...)         // "ayse-kimlik.png" → result doesn't contain "ayse"

// audit-diff.test.ts
expect(diffRedacted({ nationalId: "TC Kimlik No" }, { nationalId: "1" }, { nationalId: "2" })).toEqual([{ label: "TC Kimlik No", from: "•••", to: "•••" }]);
expect(diffRedacted({ nationalId: "TC Kimlik No" }, { nationalId: null }, { nationalId: "2" })).toEqual([{ label: "TC Kimlik No", from: "—", to: "•••" }]);
expect(diffRedacted({ nationalId: "TC Kimlik No" }, { nationalId: "1" }, {})).toEqual([]);
```

- [ ] **Step 2: Write the failing API tests in `members.test.ts`**

```ts
it("never returns the TC number in list or detail", ...)   // masked in detail; JSON.stringify(list and detail) doesn't contain the full TC
it("reveals the TC number on its own endpoint", ...)       // GET /:id/national-id → full value; 404 for a missing member
it("keeps the TC number when PATCH sends it blank", ...)   // nationalId: "" → unchanged
it("refuses an invalid TC number", ...)                    // 400
it("refuses a javascript: website", ...)                   // website: "javascript:alert(1)" → 400; "ornek.com" stored as "https://ornek.com"
it("replaces a document and removes the old file", ...)    // PATCH identityDocument → new stored file, readStoredFile(old) is null
it("rejects a non-document upload", ...)                   // 415, no row change
it("logs applicant field changes without values", ...)     // PATCH birthPlace, email, nationalId → audit changes have those labels, all values "•••"/"—"; JSON of row has no typed value
it("leaves applicant data out of the delete entry", ...)   // DELETE → details labels are only today's company fields; document files gone from disk
```

In the existing `files` tests: a stored `.pdf` serves `application/pdf`; a `document_` file has `Cache-Control: private, no-store`; a `logo_` file keeps the immutable cache header.

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test --run national-id uploads audit-diff members`
Expected: FAIL.

- [ ] **Step 4: Add the columns and generate the migration**

`pnpm db:push`, `pnpm db:generate`. Inspect the SQL: only nullable `ADD COLUMN` statements, so nothing to convert.

- [ ] **Step 5: Implement the API**

- `selectMembers` omits `nationalId`, `identityDocument` and `activityDocument` via destructured `getColumns`. Add `selectFullMember(id, executor)` for PATCH, DELETE and detail.
- `createMemberSchema` gains all new fields as optional. Text fields use `optionalTextSchema`; `email` uses `z.email()` when not blank; `mobilePhone` uses `checkPhone` when not blank; `employeeCount` blank → null, otherwise a non-negative integer; `nationalId` blank → `undefined` (keep), otherwise `isValidNationalId`; `consentedAt` is never accepted from staff.
- The staff `logo` flow keeps `saveLogo` unchanged (all images). Documents go through `storeUpload(file, DOCUMENT_MIME_TYPES, "document")`; a failed transaction deletes newly stored files, and a successful replace deletes the old ones, following the logo code.
- `logoBodyLimit` becomes `requestBodyLimit` using `MAX_REQUEST_SIZE`, with the message `"Dosyalar 5 MB'dan küçük olmalıdır"`.
- Audit: an `applicantAuditLabels` map covers every new field, fed to `diffRedacted` on PATCH, and new fields stay out of `memberAuditSpec` so create and delete `details` never include them.
- DELETE: unlink `logo`, `identityDocument` and `activityDocument`.
- `files.ts`: add `".pdf": "application/pdf"`; when the filename starts with `document_` set `Cache-Control: private, no-store`; remove the stale TODO comment.

- [ ] **Step 6: Run tests and verify they pass, then commit**

Run: `pnpm test --run national-id uploads audit-diff members files`, lint, typecheck. Commit: `feat: add applicant fields and documents to members`.

---

### Task 3: Applicant fields in the staff UI

**Files:**
- Create: `src/app/(panel)/members/[id]/application-sections.tsx`, `src/app/(panel)/members/[id]/national-id-field.tsx`, `src/app/(panel)/members/_components/document-field.tsx`
- Modify: `src/app/(panel)/members/[id]/member-details.tsx`, `src/app/(panel)/members/_components/member-form.tsx`, `src/lib/fetches/member.ts`

**Interfaces:**
- Consumes: Task 2's API fields, `getMemberNationalId`, `logoUrl` (files URL)
- Produces: `<ApplicationSections member={MemberDetails} />`

- [ ] **Step 1: Implement the member page sections**

Three sections matching the approved mockup: **Başvuran** (Ad Soyad, Görev / Ünvan, Cep Telefonu, E-posta, Doğum Tarihi / Yeri, TC Kimlik No, Cinsiyet, Eğitim Durumu, Referans, Diğer Dernekler), **Firma** (İstihdam Sayısı, Web Sitesi as a link with `rel="noopener noreferrer"`, Tanıtım Yazısı; İş Telefonu and İş Adresi stay in Bilgiler), **Belgeler** (Kimlik Belgesi, Faaliyet Belgesi / Sicil Gazetesi, each a Görüntüle link opening a new tab). A section renders only if at least one of its values is set.

- [ ] **Step 2: Implement `NationalIdField`**

Shows `nationalIdMasked` with a Göster button that calls `getMemberNationalId` once on click, kept in local state and not in a TanStack Query cache.

- [ ] **Step 3: Extend `MemberForm`**

A "Başvuru Bilgileri" group with every new field, none required. TC input stays blank with `nationalIdMasked` as placeholder and the hint "Değiştirmek için yeni numarayı yazın". `DocumentField` shows the current file with Görüntüle and accepts a replacement. `toMemberForm` sends `nationalId` and document files only when given.

- [ ] **Step 4: Verify in the browser**

Using the `run` skill: open a member created in dev with all fields set; check the sections, mask and Göster; edit a field, replace a document, confirm the old value stays where untouched. Open an existing member with no applicant data: no new sections appear.

- [ ] **Step 5: Lint, typecheck and commit**

Commit: `feat: show and edit applicant fields in the panel`.

---

### Task 4: Public submit endpoint and panel-user email

**Files:**
- Create: `src/lib/rate-limit.ts`, `src/lib/rate-limit.test.ts`, `src/lib/zod-schemas/application.ts`, `src/lib/zod-schemas/application.test.ts`, `src/lib/application-emails.ts`, `src/app/api/[[...route]]/applications.ts`, `src/app/api/[[...route]]/applications.test.ts`
- Modify: `src/app/api/[[...route]]/app.ts`, `src/app/api/[[...route]]/app.test.ts`, `src/app/api/[[...route]]/validation.ts`

**Interfaces:**
- Consumes: `storeUpload`, `LOGO_MIME_TYPES`, `DOCUMENT_MIME_TYPES`, `MAX_REQUEST_SIZE`, `isValidNationalId`, `normalizeWebsite`, `checkPhone`
- Produces: `createRateLimiter({ limit: number, windowMs: number, now?: () => number })` → `{ isLimited(key: string | undefined): boolean; record(key: string | undefined): void }`. An undefined key is never limited; expired entries are pruned.
- Produces: `applicationApiSchema` (multipart: strings, `birthDate` as `yyyy-aa-gg`, consents as `"true"`, optional trap field `faxNumber`), `applicationFormSchema` (client: `birthDate` as `gg.aa.yyyy`, consents as `true`, files as `File | null` refined to required, `faxNumber: z.string()`), `type ApplicationFormValues`
- Produces: `APPLICATION_STEPS: readonly { id: "personal" | "company" | "association" | "documents" | "consent"; title: string; fields: readonly (keyof ApplicationFormValues)[] }[]`, titles Kişisel, Firma, Dernek, Belgeler, Onay; `stepOfField(field: string): number`
- Produces: `POST /api/applications` → 201 `{ message }`; failures `{ error, field? }`; `applicationLimiter` exported for tests
- Produces: `notifyPanelUsersOfApplication(memberId: number): Promise<void>`

Maximum lengths: first and last name 100, title 200, role 200, birth place 100, email 254, website 300, phones 30, address 1000, intro 5000, other associations 2000, reference 200, education 200. Single-line fields collapse all whitespace to one space. `employeeCount` matches `/^\d{1,7}$/`.

- [ ] **Step 1: Write the failing unit tests**

```ts
// rate-limit.test.ts
it("limits after `limit` records within the window", ...)
it("frees the key after the window", ...)                 // via injected now()
it("never limits an undefined key", ...)

// application.test.ts
it("maps every form field to exactly one step", ...)      // keys of applicationFormSchema.shape minus faxNumber === flat APPLICATION_STEPS fields, no duplicates
it("requires everything except otherAssociations", ...)
it("accepts .JPG and an empty MIME type", ...)            // documentFileSchema
it("refuses a future birth date", ...)
it("collapses newlines in single-line fields", ...)       // title: "A\nB" → "A B"
```

- [ ] **Step 2: Write the failing route tests**

```ts
it("creates a candidate with its files", ...)                 // 201; row status "candidate", consentedAt set, all fields stored, website normalized; files readable
it("writes no audit entry", ...)                              // no audit_log row with the title as entityLabel
it("doesn't return the record id", ...)                       // body has only message
it("ignores a status field in the request", ...)              // status: "active" sent → still "candidate"
it("reports the failing field", ...)                          // bad TC → 400 { error, field: "nationalId" }
it("refuses a logo that's a PDF and stores nothing", ...)     // 415 { field: "logo" }; other uploads removed
it("saves nothing when the trap field is filled", ...)        // faxNumber set → 201, no row
it("refuses over-limit bodies", ...)                          // > MAX_REQUEST_SIZE → 413 { error }
it("limits by x-real-ip only after saved submissions", ...)   // 5× applicationLimiter.record(ip) → 429; invalid submissions don't record; a request with no header isn't limited
it("still succeeds when the panel email fails", ...)          // vi.mocked(sendEmail).mockRejectedValue → 201
it("emails only verified, non-banned users", ...)             // __test__ users: verified, unverified, banned; vi.waitFor calls include only verified; text has no title, name or TC, and contains /members/<id>
```

In `app.test.ts`, with no session: `POST /api/applications` with an empty form isn't 401; `GET /api/files/x` is 401.

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test --run rate-limit zod-schemas/application applications app`
Expected: FAIL.

- [ ] **Step 4: Implement**

- `validation.ts`: add `respondWithFirstField`, responding `{ error, field: issues[0].path[0] }`.
- Route order: `bodyLimit` → `isLimited(x-real-ip)` returning 429 `"Çok fazla başvuru gönderildi. Lütfen daha sonra tekrar deneyin."` → validator → trap check → `storeUpload` ×3 (logo first; any null deletes those already stored and returns 415 with `field`) → insert with `status: "candidate"`, `consentedAt: new Date()` → `record(ip)` → `void notifyPanelUsersOfApplication(id).catch(console.error)` → 201. Delete stored files if the insert throws.
- `app.ts`: `.route("/applications", applicationsRoute)` beside `/cron`, before `.use(requireSession)`.
- `notifyPanelUsersOfApplication`: `emailVerified = true AND banned IS NOT TRUE`, one `sendEmail` per user via `Promise.allSettled`, failures logged. Subject and text: `Yeni başvuru`, with the link `${env.NEXT_PUBLIC_APP_URL}/members/${id}`.

- [ ] **Step 5: Run tests and verify they pass, then commit**

Run: `pnpm test --run rate-limit zod-schemas/application applications app`, lint, typecheck. Commit: `feat: accept public membership applications`.

---

### Task 5: `/uyelik` five-step form

**Files:**
- Create: `src/app/(public)/layout.tsx`, `src/app/(public)/uyelik/page.tsx`, `src/app/(public)/uyelik/application-form.tsx`, `src/app/(public)/uyelik/step-fields.tsx`, `src/app/(public)/uyelik/file-field.tsx`, `src/lib/fetches/application.ts`
- Modify: `src/proxy.ts`
- Test: `src/lib/fetches/application.test.ts`

**Interfaces:**
- Consumes: `applicationFormSchema`, `ApplicationFormValues`, `APPLICATION_STEPS`, `stepOfField`, `POST /api/applications`
- Produces: `class ApplicationError extends Error { field?: string }`, `submitApplication(values: ApplicationFormValues): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
it("throws the API's error and field", ...)                // fetch stub 400 { error: "x", field: "nationalId" } → ApplicationError with both
it("falls back on a non-JSON response", ...)               // 413 with HTML body → message "Başvuru gönderilemedi. Dosya boyutlarını kontrol edip tekrar deneyin."
it("falls back on a network failure", ...)                 // fetch rejects → message "Bağlantı kurulamadı. Lütfen tekrar deneyin."
it("sends the birth date as yyyy-aa-gg", ...)              // captured form has birthDate "1985-03-25" from "25.03.1985"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test --run fetches/application`
Expected: FAIL.

- [ ] **Step 3: Implement `submitApplication`**

- [ ] **Step 4: Implement the page**

- Add `/uyelik` to `PUBLIC_PATHS`. The layout reuses the `(auth)` look (logo, navy top border, muted footer) at `max-w-2xl`, showing `0 (384) 212 36 50 · nesiad@nesiad.org.tr`.
- **One `useForm<ApplicationFormValues>` in `ApplicationForm` for all steps**, with `zodResolver(applicationFormSchema)` and `shouldUnregister: false`. The step number is `useState`. All fields use the form's state, and files use `Controller` so `File` objects stay in form state.
- Devam Et: `await form.trigger(APPLICATION_STEPS[step].fields)`, advancing only when true. Geri never validates.
- `FileField` shows the chosen file's name and size with Değiştir once a file is chosen, because a file input can't re-display its value. `accept=".pdf,.png,.jpg,.jpeg"` for documents, `.png,.jpg,.jpeg` for the logo.
- Text copied from the old form: step 5's two consent labels (with "Yukarıdaki" corrected from "Yukardaki", and the link to `https://www.nesiad.org.tr/dosya/Uyelik_Formu.pdf`), and the button "Ön Üyelik Başvurusunu Yap".
- Hidden trap field `faxNumber`: visually hidden off-screen with `tabIndex={-1}` and `autoComplete="off"`, not `display: none`.
- On `ApplicationError` with `field`: `form.setError(field, ...)`, then `setStep(stepOfField(field))`. Without `field`: an error next to the submit button. Values always stay.
- `beforeunload` warning while `formState.isDirty` and not yet submitted.
- Success replaces the form with "Başvurunuz alındı" and "Teşekkür ederiz. Başvurunuz incelendikten sonra size e-posta ve SMS ile bilgi verilecektir.", plus the contact line.
- Moving between steps scrolls to the top and focuses the step's heading.

- [ ] **Step 5: Verify in the browser at phone width (375px), logged out**

Using the `run` skill and Playwright:
1. Visit `/uyelik` logged out: no redirect to login.
2. Fill Kişisel, Devam Et, fill Firma, Geri: Kişisel values are all there; Devam Et: Firma values are all there.
3. Choose three files, go to Onay, Geri: file names still shown.
4. Devam Et on an empty step: errors on that step only, no advance.
5. Stop the server, submit: error shown, values and files still there. Restart.
6. Submit a TC that passes the client but is refused by a test stub, or edit the request: the form jumps to Kişisel and shows the error.
7. Submit: confirmation screen; the record appears as Aday in the panel with its files viewable; no audit row.

- [ ] **Step 6: Run tests, lint, typecheck, commit**

Commit: `feat: add the public application form`.

---

### Task 6: Notice templates

**Files:**
- Create: `src/lib/application-notice-settings.ts`, `src/lib/zod-schemas/application-notices.ts`, `src/app/(panel)/sms/notice-settings.tsx`, `drizzle/<generated>/migration.sql`
- Modify: `src/db/schema.ts`, `src/lib/sms/templates.ts`, `src/lib/sms/templates.test.ts`, `src/lib/zod-schemas/sms.ts`, `src/lib/audit-labels.ts`, `src/lib/fetches/sms.ts`, `src/app/api/[[...route]]/sms.ts`, `src/app/api/[[...route]]/sms.test.ts`, `src/app/(panel)/sms/sms.tsx`, `src/app/(panel)/sms/page.tsx`

**Interfaces:**
- Produces: table `applicationNoticeSettingsTable` (`application_notice_settings`): single row, `id` default 1 with check `id = 1`, text NOT NULL `acceptedSms`, `rejectedSms`, `acceptedEmailSubject`, `acceptedEmailBody`, `rejectedEmailSubject`, `rejectedEmailBody`, `updatedAt`
- Produces: `getApplicationNoticeSettings()`, written like `getSmsSettings`
- Produces, from `templates.ts`: `NOTICE_PLACEHOLDERS = { ad: "başvuranın adı soyadı", firma: "firma adı" }`; `fillTemplate(template: string, values: Record<string, string>)`; `unknownPlaceholders(template: string, known: Record<string, unknown> = TEMPLATE_PLACEHOLDERS)`
- Produces: `noticeSettingsSchema`, `type NoticeSettingsValues`. SMS: required, ≤ `TEMPLATE_MAX_LENGTH`. Subject: required, ≤ 200. Body: required, ≤ 5000. All refuse unknown placeholders, naming `{ad}, {firma}` in the error.
- Produces: `GET/PUT /api/sms/notice-settings`, audit action `notice_settings_update` labelled `"Başvuru bildirim şablonları değiştirildi"`, query key `["notice-settings"]`

Default text, in `DEFAULT_NOTICE_TEMPLATES`:

| Field | Text |
| --- | --- |
| acceptedSms | `Sayın {ad}, {firma} adına yaptığınız NESİAD üyelik başvurunuz kabul edilmiştir. Aramıza hoş geldiniz. NESİAD` |
| rejectedSms | `Sayın {ad}, {firma} adına yaptığınız NESİAD üyelik başvurunuz olumlu sonuçlanmamıştır. İlginiz için teşekkür ederiz. NESİAD` |
| acceptedEmailSubject | `NESİAD üyelik başvurunuz kabul edildi` |
| acceptedEmailBody | `Sayın {ad},\n\n{firma} adına yaptığınız NESİAD üyelik başvurunuz kabul edilmiştir. Aramıza hoş geldiniz.\n\nNevşehir Sanayici ve İş İnsanları Derneği` |
| rejectedEmailSubject | `NESİAD üyelik başvurunuz hakkında` |
| rejectedEmailBody | `Sayın {ad},\n\n{firma} adına yaptığınız NESİAD üyelik başvurunuz olumlu sonuçlanmamıştır. İlginiz için teşekkür ederiz.\n\nNevşehir Sanayici ve İş İnsanları Derneği` |

- [ ] **Step 1: Write the failing tests**

```ts
// templates.test.ts
expect(fillTemplate("{ad} {firma} {x}", { ad: "A", firma: "F" })).toBe("A F {x}");
expect(fillTemplate("{ad}", { ad: "{firma}", firma: "F" })).toBe("{firma}");   // applicant text is never re-expanded
expect(unknownPlaceholders("{ad} {yil}", NOTICE_PLACEHOLDERS)).toEqual(["{yil}"]);

// sms.test.ts
it("creates the notice settings with the defaults", ...)
it("refuses an unknown placeholder", ...)                  // {yil} in a notice template → 400
it("audits a template change", ...)                        // PUT → notice_settings_update
it("doesn't affect the celebration settings", ...)         // autoEnabled and templates unchanged
```

Existing celebration template tests must still pass: `{ad}` and `{yil}` behave as today.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test --run templates sms`
Expected: FAIL.

- [ ] **Step 3: Implement schema, route and helpers**

`pnpm db:push`, `pnpm db:generate`; the SQL only creates a table.

- [ ] **Step 4: Implement the Ayarlar UI**

`NoticeSettings` renders below `SmsSettings` in the Ayarlar tab as its own form and Kaydet button, with headings "Başvuru Kabul Bildirimi" and "Başvuru Red Bildirimi". Each has SMS, E-posta Konusu and E-posta Metni fields and a live preview with samples `{ ad: "Ayşe Yılmaz", firma: "Kapadokya Gıda A.Ş." }`; SMS shows the `/ SMS_MAX_LENGTH` count. Prefetch in `page.tsx` like `sms-settings`.

- [ ] **Step 5: Verify in the browser, then run tests, lint, typecheck, commit**

Edit and save a template, reload, confirm it's kept, and check the audit log entry. Commit: `feat: add editable application notice templates`.

---

### Task 7: Decision API and notices

**Files:**
- Create: `src/lib/application-notices.ts`, `src/lib/application-notices.test.ts`, `src/lib/zod-schemas/member-decision.ts`
- Modify: `src/app/api/[[...route]]/members.ts`, `src/app/api/[[...route]]/members.test.ts`, `src/lib/audit-labels.ts`, `src/lib/fetches/member.ts`

**Interfaces:**
- Consumes: `getApplicationNoticeSettings`, `fillTemplate`, `checkPhone`, `netgsmClient`, `decodeSendResponse`, `sendEmail`
- Produces: `type NoticeOutcome = "sent" | "failed" | "skipped" | "unknown"` (`unknown` = NetGSM didn't answer; may have gone)
- Produces: `sendDecisionNotices(kind: "accepted" | "rejected", applicant: { title: string; applicantFirstName: string | null; applicantLastName: string | null; email: string | null; mobilePhone: string | null }): Promise<{ email: NoticeOutcome; sms: NoticeOutcome }>`, which never throws. Email is limited to 30 seconds so a hanging SMTP server counts as `failed`.
- Produces: `memberDecisionSchema`, a discriminated union on `decision`: `{ decision: "accept" | "add_passive"; memberLoginDate: string (required, past or today, yyyy-aa-gg); sectorId: number | null }`, `{ decision: "reject" | "reopen" }`
- Produces: `POST /api/members/:id/decision` (JSON) → 200 `{ status: MemberStatus; notices: { email: NoticeOutcome; sms: NoticeOutcome } | null }`; 404 missing; 409 `"Bu başvurunun durumu değişmiş. Sayfayı yenileyin."`; 400 for a missing sector with `MISSING_SECTOR_ERROR`
- Produces: `decideMember(id: number, decision: MemberDecision)` in `fetches/member.ts`

| Decision | Required current status | New status | Notice |
| --- | --- | --- | --- |
| `accept` | candidate | active | accepted |
| `add_passive` | candidate | passive | none |
| `reject` | candidate | rejected | rejected |
| `reopen` | rejected | candidate | none |

Audit actions: `application_accept` "Başvuru kabul edildi", `application_add_passive` "Başvuru pasif üye olarak eklendi", `application_reject` "Başvuru reddedildi", `application_reopen` "Başvuru tekrar adaya alındı", `application_notice` "Başvuru bildirimi gönderildi".

- [ ] **Step 1: Write the failing notice tests**

```ts
it("sends both from the right templates", ...)         // email subject/body and SMS text filled with {ad}, {firma}; SMS number normalized
it("skips a missing or invalid address", ...)          // email null → skipped; mobile "0384 111 11 11" → skipped; other channel still sent
it("reports a failed email without throwing", ...)     // sendEmail rejects → email: failed, sms: sent
it("reports a NetGSM refusal as failed", ...)
it("reports no NetGSM answer as unknown", ...)         // client.send rejects → sms: unknown
```

- [ ] **Step 2: Write the failing route tests in `members.test.ts`**

```ts
it("accepts a candidate", ...)                         // active; memberLoginDate and sector stored; both notices sent; audit application_accept with Durum Aday → Aktif
it("rejects a candidate", ...)                         // rejected; rejected templates used
it("adds a candidate as passive with no notice", ...)  // passive; notices null; no email, no SMS
it("reopens a rejected member with no notice", ...)    // candidate; notices null; no email, no SMS
it("then accepts it normally", ...)                    // reject → reopen → accept: accepted notice sent, no block from the earlier one
it("refuses other moves", ...)                         // accept on rejected or active, reject on passive, reopen on candidate → 409, status unchanged, nothing sent
it("sends one set of notices for concurrent accepts", ...)  // Promise.all two accepts → one 200, one 409; sendEmail called once
it("requires a date to accept", ...)                   // no memberLoginDate → 400
it("refuses a future date", ...)                       // → 400
it("keeps the decision when notices fail", ...)        // sendEmail rejects, NetGSM refuses → 200, status active, both failed in response
it("handles a deleted sector", ...)                    // sectorId missing → 400 MISSING_SECTOR_ERROR, status unchanged, nothing sent
it("logs notice outcomes without contact details", ...) // application_notice details hold outcomes; JSON has no email address, number or message text
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test --run application-notices members`
Expected: FAIL.

- [ ] **Step 4: Implement**

The transaction updates with `where(and(eq(id), eq(status, requiredStatus))).returning()`: zero rows means 404 if the member doesn't exist, otherwise 409. This conditional update is what makes concurrent decisions safe. `recordAudit` runs in the same transaction. Foreign-key errors map as in PATCH. After commit: `sendDecisionNotices` for `accept` and `reject`, then `recordAudit(db, { action: "application_notice", ... })` with `details` of E-posta and SMS outcomes in Turkish (Gönderildi, Gönderilemedi, Adres yok, Yanıt alınamadı), plus the dry-run mode line as the manual SMS has.

- [ ] **Step 5: Run tests and verify they pass, then commit**

Run: `pnpm test --run application-notices members`, lint, typecheck. Commit: `feat: add application decisions and notices`.

---

### Task 8: Decision UI, Adaylar list and docs

**Files:**
- Create: `src/app/(panel)/members/[id]/decision-buttons.tsx`, `src/app/(panel)/members/[id]/accept-dialog.tsx`, `src/lib/notice-outcome.ts`, `src/lib/notice-outcome.test.ts`
- Modify: `src/app/(panel)/members/[id]/member-details.tsx`, `src/app/(panel)/members/members.tsx`, `CLAUDE.md`, `docs/deploy.md`

**Interfaces:**
- Consumes: `decideMember`, `NoticeOutcome`, `SectorCombobox`, `DateField`, `todayInIstanbul`, `isoToDisplay`
- Produces: `noticeWarning(notices: { email: NoticeOutcome; sms: NoticeOutcome } | null): string | null`, null when nothing went wrong

- [ ] **Step 1: Write the failing test**

```ts
expect(noticeWarning(null)).toBeNull();
expect(noticeWarning({ email: "sent", sms: "sent" })).toBeNull();
expect(noticeWarning({ email: "failed", sms: "sent" })).toContain("E-posta gönderilemedi");
expect(noticeWarning({ email: "sent", sms: "skipped" })).toContain("cep telefonu");
expect(noticeWarning({ email: "sent", sms: "unknown" })).toContain("NetGSM");
```

- [ ] **Step 2: Run it to verify it fails, then implement `noticeWarning`**

Run: `pnpm test --run notice-outcome`

- [ ] **Step 3: Implement the decision UI**

- `member.status === "candidate"`: Kabul Et, Reddet, Pasif olarak ekle. `"rejected"`: Tekrar Aday yap (one click, no dialog).
- Kabul Et and Pasif olarak ekle share `AcceptDialog`, with Üye Giriş Tarihi (required, default today in Istanbul) and optional Sektör. Kabul Et shows the `E-posta ve SMS gönderilecek:` box with `member.email` and `member.mobilePhone`, and the button "Kabul Et ve Bildir". Pasif olarak ekle shows no notice box.
- Reddet uses `AlertDialog` with the mockup's wording and the same box, button "Reddet ve Bildir".
- A missing address shows "Bu adres eksik, gönderilmeyecek" in the box before confirming.
- On success invalidate `["members"]`, `["sectors"]` and SMS queries, then if `noticeWarning` returns text, keep the dialog open showing it with a Kapat button. The decision has already been saved, so the dialog must say so.
- On 409, show the error and invalidate `["members"]`.

- [ ] **Step 4: Implement the list changes**

- The Adaylar filter item shows the waiting count from the loaded list.
- Add `applicant` (Başvuran, `applicantFirstName + applicantLastName`) and `appliedAt` (Başvuru Tarihi, `createdAt` as an Istanbul date) columns, available in Sütunlar and hidden by default.
- While status is `candidate` or `rejected`, these two are forced visible and `sector`, `representatives` and the kıdem columns forced hidden, without writing to the saved cookie. Leaving the filter restores the user's saved choice. Default sort under these filters: `appliedAt` descending.

- [ ] **Step 5: Update docs**

- `CLAUDE.md`: Domain notes get status values, transitions and the rule that only decision actions leave Aday and Reddedildi. Architecture gets `/uyelik` and `POST /api/applications` as the only public panel routes. Audit section records the exception: no submission entry, and applicant field values never logged.
- `docs/deploy.md`: after the first deploy with this feature, submit one real application with three files near 5 MB, and repoint the old site's form link once it's confirmed.

- [ ] **Step 6: Verify the whole flow in the browser**

With `SMS_DRY_RUN` on: submit an application logged out; find it under Adaylar with the count; open it; view documents; Göster TC. Accept: check the dialog, the status, the audit entries and dry-run SMS line. Submit another and reject; Tekrar Aday yap; accept. Add a third as Pasif: no notice. Check Aktif (default) never lists Aday or Reddedildi, the yetkili picker doesn't offer them, and sector counts exclude them. Stop SMTP or misconfigure it and accept one: warning shown, status kept. Search the audit log's rows for the test applicant's TC, birth place and mobile: none found.

- [ ] **Step 7: Run everything and commit**

Run: `pnpm test --run`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`
Expected: all pass. Commit: `feat: add application decisions to the member page`.
