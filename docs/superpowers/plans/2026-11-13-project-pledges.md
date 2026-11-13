# Proje Taahhütleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projeler get a "Taahhütler" list (Yetkili, Adet, Tutar, Toplam, Genel Toplam), editable on the create/edit forms and in place on the details page.

**Architecture:** New `project_pledge` table, rows replaced as a whole on each save (like Organizasyon rows). The projects Hono route accepts `pledges` on POST/PATCH and gets `PUT /:id/pledges` for the details page. One `PledgesEditor` (react-hook-form `useFieldArray`) is used by both pages; totals are computed client-side in integer kuruş by one pure helper.

**Tech Stack:** Next.js 16, Hono RPC, Drizzle/Postgres, zod, react-hook-form, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-project-pledges-design.md`

## Global Constraints

- UI text Turkish, code/comments/commits English. Section title "Taahhütler"; columns "Yetkili", "Adet", "Tutar", "Toplam"; footer "Genel Toplam"; add button "Taahhüt ekle".
- Every mutation writes `recordAudit` in the same transaction; changes as one "Taahhütler" line; no change → no entry.
- Totals are never stored or returned by the API; computed with `BigInt` kuruş, never floats.
- Adet: whole number 1…1.000.000. Tutar: `numeric(12,2)`, > 0, typed Turkish ("1.250,50"), sent as "1250.50".
- New rows need an Aktif yetkili; a Pasif yetkili already in the proje's saved rows is kept. Duplicates allowed. Empty list allowed.
- Migration is additive only (new table). Run `pnpm db:push` then `pnpm db:generate`, commit the migration.
- Tests via `pnpm test --run <pattern>`; test records named `__test__…`, cleaned in `afterAll`, assertions scoped to own records.
- `pnpm lint` and `pnpm exec tsc --noEmit` pass at the end of every task.

## Review Focus

1. A Pasif yetkili already in the list must survive a save of the details page and of the edit form (both PUT and PATCH pass the saved rows' yetkili ids as "current").
2. PATCH without `pledges` (e.g. the Aktif/Pasif toggle button, which sends only proje fields) must leave rows untouched.
3. A half-filled row (no yetkili, or Tutar "abc") shows "—" as its Toplam and is left out of Genel Toplam, without crashing; it blocks Kaydet with a field error.
4. After a details-page save the form resets to the saved rows, so the save bar disappears and the guard releases; a failed save keeps the edits.
5. Deleting a yetkili with taahhütler is refused even when they have no tahsilatlar, and the dialog says why.

---

### Task 1: Shared schemas and pledge helpers

**Files:**
- Modify: `src/lib/zod-schemas/shared.ts`, `src/lib/zod-schemas/collection.ts`, `src/lib/zod-schemas/payment.ts`, `src/lib/zod-schemas/project.ts`
- Create: `src/lib/pledges.ts`
- Test: `src/lib/pledges.test.ts`, `src/lib/zod-schemas/project.test.ts`

**Interfaces:**
- Produces (shared.ts, moved from the identical copies in collection.ts/payment.ts, which then import them): `idSchema(message)`, `pickedSchema(message)`, `amountSchema` (API "1250.50", > 0), `typedAmountSchema` (form text, "Tutar boş olamaz" / "Geçerli bir tutar girin" / "Tutar sıfırdan büyük olmalı").
- Produces (project.ts):
  - `pledgeSchema = z.object({ representativeId: idSchema("Yetkili seçin"), quantity: z.number().int(...).min(1, "Adet en az 1 olmalı").max(1_000_000, "Adet en fazla 1.000.000 olabilir"), amount: amountSchema })`
  - `pledgesSchema = z.array(pledgeSchema).max(500, "En fazla 500 taahhüt eklenebilir")`; `type PledgeInput = z.output<typeof pledgeSchema>`
  - `projectSchema = projectFieldsSchema.extend({ pledges: pledgesSchema })` (POST); `projectUpdateSchema = projectFieldsSchema.extend({ pledges: pledgesSchema.optional() })` (PATCH). `projectFieldsSchema` stays unchanged (the Tahsilat form's "Yeni proje" uses it).
  - `pledgeFormRowSchema = z.object({ representativeId: pickedSchema("Yetkili seçin"), quantity: <trimmed string: "Adet boş olamaz", /^\d+$/ "Adet tam sayı olmalı", ≥1, ≤1.000.000>, amount: typedAmountSchema })`; `pledgesFormSchema = z.object({ pledges: z.array(pledgeFormRowSchema) })` (details page); `projectFormSchema = projectFieldsSchema.extend({ pledges: z.array(pledgeFormRowSchema) })`.
  - `type PledgeFormRow = z.input<typeof pledgeFormRowSchema>`, `pledgesToApi(rows: z.output<typeof pledgeFormRowSchema>[]): PledgeInput[]` (quantity → number, amount via `parseAmountInput`), `pledgesToForm(rows: { representativeId: number; quantity: number; amount: string }[]): PledgeFormRow[]` (amount via `amountToInput`, quantity `String`).
- Produces (`src/lib/pledges.ts`, client-safe):
  - `pledgeRowTotal(quantity: number, amount: string): string` → "2500.00"
  - `pledgeGrandTotal(rows: { quantity: number; amount: string }[]): string` → "0.00" for []
  - `typedPledgeTotal(row: PledgeFormRow): string | null` → null when Adet or Tutar doesn't parse (for the editor)
  - `pledgesAuditText(rows: { representativeName: string; quantity: number; amount: string }[]): string` → `"Ali Veli: 2 × 1.000,00 TL, Ayşe: 1 × 50,00 TL"`, `"—"` when empty (use `formatAmountText`)

- [ ] **Step 1: Write failing tests** in `src/lib/pledges.test.ts`:
  - `pledgeRowTotal(3, "0.10")` → `"0.30"`; `pledgeRowTotal(1_000_000, "9999999999.99")` → `"9999999999990000.00"` (no float loss)
  - `pledgeGrandTotal([{quantity:2,amount:"1000.00"},{quantity:1,amount:"50.25"}])` → `"2050.25"`; `[]` → `"0.00"`
  - `typedPledgeTotal({representativeId:1, quantity:"2", amount:"1.250,50"})` → `"2501.00"`; quantity `""` or amount `"abc"` → `null`
  - `pledgesAuditText([...two rows above with names])` → `"Ali Veli: 2 × 1.000,00 TL, Ayşe: 1 × 50,25 TL"`; `[]` → `"—"`

  And `src/lib/zod-schemas/project.test.ts`: `pledgesSchema` rejects quantity 0 ("Adet en az 1 olmalı"), 1.5, amount "0.00" ("Tutar sıfırdan büyük olmalı"); `pledgeFormRowSchema` rejects quantity "abc" ("Adet tam sayı olmalı"); `pledgesToApi(pledgesToForm([{representativeId:4, quantity:2, amount:"1250.50"}]))` round-trips.
- [ ] **Step 2:** `pnpm test --run pledges project.test` → FAIL (modules missing).
- [ ] **Step 3:** Move the shared schemas, add the project.ts schemas, implement `src/lib/pledges.ts` (amount string → kuruş `BigInt` by removing the dot; format back with two decimals).
- [ ] **Step 4:** `pnpm test --run pledges project.test collection payment` → PASS (collection/payment tests confirm the move broke nothing).
- [ ] **Step 5:** `git commit -m "feat: add taahhüt schemas and kuruş total helpers"` (include the spec and this plan under `docs/superpowers/`)

### Task 2: Table and migration

**Files:**
- Modify: `src/db/schema.ts` (after `projectTable`)
- Create: `drizzle/<generated>` migration

**Interfaces:**
- Produces: `projectPledgeTable` = `project_pledge`: `id` identity PK; `projectId` → `project.id` `onDelete: "cascade"`; `representativeId` → `authorized_representative.id` `onDelete: "restrict"`; `quantity integer not null`; `amount numeric(12,2) mode string not null`; `position integer not null`; `createdAt`/`updatedAt` like `projectTable`. Checks `project_pledge_quantity_positive` (`quantity >= 1`), `project_pledge_amount_positive` (`amount > 0`). Indexes `project_pledge_project_idx` (project_id, position), `project_pledge_representative_idx`.

- [ ] **Step 1:** Add the table with a doc comment ("Taahhütler: what a yetkili pledged to a proje; rows go with the proje, a yetkili with any can't be deleted").
- [ ] **Step 2:** `pnpm db:push` → table created; `pnpm db:generate` → one new migration containing only `CREATE TABLE "project_pledge"`, FKs and indexes (check it has no DROP/ALTER of existing columns).
- [ ] **Step 3:** `pnpm exec tsc --noEmit` passes.
- [ ] **Step 4:** `git commit -m "feat: add the project_pledge table"`

### Task 3: Projects API

**Files:**
- Modify: `src/app/api/[[...route]]/projects.ts`, `src/app/api/[[...route]]/collections.ts` (only if `insertProject`'s signature change needs it)
- Test: `src/app/api/[[...route]]/projects.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas/helpers, Task 2 table.
- Produces:
  - `GET /:id` → `{ id, name, number, active, collectionCount, pledges: { id, representativeId, representativeName, representativePhoto, representativeActive, quantity, amount }[] }` in `position` order.
  - `POST /` body `projectSchema`; `PATCH /:id` body `projectUpdateSchema`; `PUT /:id/pledges` body `{ pledges: pledgesSchema }` → `{ id, message: "Taahhütler kaydedildi" }` 200, 404 "Proje bulunamadı".
  - Refused rows → 400 `{ error, field: "pledges.<index>.representativeId" }` with "Seçilen yetkili bulunamadı" or "Pasif yetkili eklenemez"; FK violation during save (yetkili deleted meanwhile) → 400 `{ error: "Seçilen yetkili bulunamadı" }`.
  - `insertProject(tx, values: ProjectFields, actor, pledges: PledgeInput[] = [])` keeps its return shape; collections' "Yeni proje" keeps calling it without pledges.
- Internal helpers (in projects.ts): `loadPledges(executor, projectId)`, `assertValidPledges(tx, pledges, currentIds: ReadonlySet<number>)` (model: `assertValidPeople` in organizations.ts), `replacePledges(tx, projectId, pledges)`.

- [ ] **Step 1: Write failing tests** (add a helper that inserts `__test__` yetkililer, Aktif and Pasif, cleaned in `afterAll` after projects):
  - existing "creates a trimmed project" expectations gain `pledges: []` and the details line `{ label: "Taahhütler", value: "—" }`.
  - POST with two pledges → GET returns them in order with names; create audit `Taahhütler` = `"<name>: 2 × 1.000,00 TL, <name>: 1 × 50,25 TL"`.
  - POST with a Pasif yetkili → 400 `{ error: "Pasif yetkili eklenemez", field: "pledges.0.representativeId" }`; unknown id 999999999 → "Seçilen yetkili bulunamadı".
  - PATCH without `pledges` keeps rows and writes no Taahhütler change; PATCH with changed rows records `{ label: "Taahhütler", from, to }`; PATCH keeping a row whose yetkili became Pasif after saving → 200.
  - PUT `/:id/pledges`: replaces rows; keeps a yetkili that became Pasif after being saved (set inactive directly in the DB, then PUT the same rows → 200); same rows again → no new audit entry; unknown proje → 404.
  - DELETE a proje with pledges (no tahsilatlar) → 200, rows gone, delete audit details include the Taahhütler text.
- [ ] **Step 2:** `pnpm test --run projects.test` → new tests FAIL.
- [ ] **Step 3:** Implement. PATCH/PUT read the saved rows first (for `currentIds` and the audit "before"), then replace, then reload for the "after" text (`change("Taahhütler", before, after)`). PUT records `action: "update"`, `entityType: "project"`, `entityLabel` = proje name.
- [ ] **Step 4:** `pnpm test --run projects collections` → PASS.
- [ ] **Step 5:** `git commit -m "feat: save taahhütler with projeler"`

### Task 4: Yetkili deletion refuses taahhütler

**Files:**
- Modify: `src/app/api/[[...route]]/representatives.ts` (GET `/:id`, DELETE `/:id`), `src/app/(panel)/representatives/[id]/delete-representative-button.tsx`
- Test: `src/app/api/[[...route]]/representatives.test.ts`

**Interfaces:**
- Produces: GET `/:id` adds `pledgeCount: number`. DELETE refuses with 409 when `collectionCount + pledgeCount > 0`. Message from `hasRecordsError(collectionCount: number | null, pledgeCount: number | null)`: "Bu yetkiliye ait 2 tahsilat var. …", "… 3 taahhüt var. …", "… 2 tahsilat ve 3 taahhüt var. …", and for the concurrent FK case (both null) "Bu yetkiliye ait tahsilat veya taahhüt var. Silmek yerine pasif yapabilirsiniz."

- [ ] **Step 1: Failing tests:** yetkili with one pledge (insert a `__test__` proje + `project_pledge` row directly) → GET `pledgeCount` 1; DELETE → 409 `"Bu yetkiliye ait 1 taahhüt var. Silmek yerine pasif yapabilirsiniz."` and the yetkili still exists.
- [ ] **Step 2:** `pnpm test --run representatives` → FAIL.
- [ ] **Step 3:** Implement; the dialog's "Bu yetkili silinemez" branch shows when either count > 0, with the same wording as `hasRecordsError` (put the wording in a client-safe function, e.g. `src/lib/representatives.ts` if one exists, else next to the button, and use it on both sides).
- [ ] **Step 4:** `pnpm test --run representatives` → PASS.
- [ ] **Step 5:** `git commit -m "feat: refuse deleting a yetkili with taahhütler"`

### Task 5: PledgesEditor and the create/edit form

**Files:**
- Create: `src/components/pledges-editor.tsx`
- Modify: `src/lib/fetches/project.ts`, `src/app/(panel)/projects/_components/project-form.tsx`

**Interfaces:**
- Consumes: Task 1 (`PledgeFormRow`, `typedPledgeTotal`, `pledgeGrandTotal`-style sum, `pledgesToApi`, `pledgesToForm`), Task 3 response types.
- Produces:
  - fetches: `createProject(values: ProjectApiValues)`, `updateProject(id, values: ProjectUpdateValues)` (input types of `projectSchema` / `projectUpdateSchema`), new `savePledges(id: number, pledges: PledgeInput[])` (throws via `throwResponseError(res, "Taahhütler kaydedilemedi")`). `ToggleActiveButton`'s call keeps working without `pledges`.
  - `PledgesEditor<T extends { pledges: PledgeFormRow[] }>({ control, current }: { control: Control<T>; current: Project["pledges"] })`: `useFieldArray` on `"pledges"`; yetkili items = Aktif yetkililer plus Pasif ones in `current` (labelled "(Pasif)"), Turkish-sorted (copy `People` in `group-form.tsx`); Adet as `Input inputMode="numeric"`; Tutar as `AmountInput`; Toplam = `formatAmount(typedPledgeTotal(row))` or "—"; Genel Toplam = sum of the rows whose total is non-null; empty state "Henüz taahhüt eklenmemiş."; "Taahhüt ekle" appends `{ representativeId: null, quantity: "1", amount: "" }`. Totals read with `useWatch({ control, name: "pledges" })`.

- [ ] **Step 1:** Add a test to `src/lib/pledges.test.ts` for the editor's sum helper if one was added for form rows (e.g. `typedPledgeGrandTotal(rows)` skipping null rows: `[valid 2×"1.000,00", invalid] → "2000.00"`), run → FAIL, implement → PASS.
- [ ] **Step 2:** Build `PledgesEditor` and add it to `ProjectForm` as a second section titled "Taahhütler" under the proje fields; defaults `pledgesToForm(project?.pledges ?? [])`; submit maps through `pledgesToApi`; `onError` sets the field error when `error.field` is in `FIELDS` or starts with `"pledges."`. On success also invalidate `["representatives"]`.
- [ ] **Step 3:** `pnpm exec tsc --noEmit && pnpm lint` → clean.
- [ ] **Step 4:** In the dev panel (log in via the dev session script): create a proje with two rows, check live Toplam/Genel Toplam while typing ("1.250,50" × 2 → "₺2.501,00"), save, edit, remove a row, save.
- [ ] **Step 5:** `git commit -m "feat: edit taahhütler on the proje form"`

### Task 6: In-place editing on the details page

**Files:**
- Create: `src/app/(panel)/projects/[id]/project-pledges.tsx`
- Modify: `src/app/(panel)/projects/[id]/project-details.tsx`, `src/lib/navigation-guard.ts`, `src/app/(panel)/settings/notifications-tab.tsx`

**Interfaces:**
- Consumes: `PledgesEditor`, `savePledges`, `pledgesFormSchema`, `useNavigationGuard`.
- Produces: `shakeElement(element: HTMLElement | null)` in `navigation-guard.ts` (the `SHAKE` keyframes + reduced-motion check moved out of notifications-tab, which then uses it). `ProjectPledges({ project }: { project: Project })`.

- [ ] **Step 1:** Move `SHAKE` into `shakeElement`; notifications-tab calls it. `pnpm exec tsc --noEmit` clean.
- [ ] **Step 2:** `ProjectPledges`: own `useForm({ resolver: zodResolver(pledgesFormSchema), defaultValues: { pledges: pledgesToForm(project.pledges) } })`, a "Taahhütler" card spanning the details grid below Bilgiler/Tahsilatlar, `PledgesEditor` inside. When `isDirty`: fixed save bar (same classes as notifications-tab's) with "Kaydedilmemiş değişiklikler var", "İptal" (`reset()`, no confirm dialog needed: it only drops this section's edits) and "Kaydet". `useNavigationGuard(isDirty, …)` turns the bar red with "Sayfadan ayrılmadan önce değişiklikleri kaydedin ya da iptal edin." and shakes it. Save: `savePledges`, then invalidate `["projects"]` and `["representatives"]`, then `reset({ pledges: pledgesToForm(fresh.pledges) })` from the refetched proje; field errors mapped like Task 5; other errors shown in the bar.
- [ ] **Step 3:** Render it in `project-details.tsx` (keyed by `project.id`).
- [ ] **Step 4:** `pnpm exec tsc --noEmit && pnpm lint` clean. In the dev panel: edit a row on the details page, watch totals, click a sidebar link → stays, bar shakes; Kaydet → bar disappears, audit entry shows the Taahhütler change; İptal restores; make a listed yetkili Pasif, reload, save → still accepted.
- [ ] **Step 5:** `git commit -m "feat: edit taahhütler in place on the proje page"`

### Task 7: Docs

**Files:**
- Modify: `CLAUDE.md` (Projeler bullet in Domain notes)

- [ ] **Step 1:** Extend the Projeler note: Taahhütler (`project_pledge`) are a record of what a yetkili pledged (Adet × Tutar), edited on the proje forms and in place on the details page (`PUT /api/projects/:id/pledges`); totals are computed client-side in kuruş (`src/lib/pledges.ts`), not stored; new rows need an Aktif yetkili; rows go with the proje; a yetkili with taahhütler can't be deleted. Not linked to tahsilatlar.
- [ ] **Step 2:** `pnpm test --run && pnpm lint && pnpm exec tsc --noEmit` → all pass.
- [ ] **Step 3:** `git commit -m "docs: describe proje taahhütleri"`
