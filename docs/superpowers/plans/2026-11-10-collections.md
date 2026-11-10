# Tahsilatlar and Projeler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record collections from members (Tahsilatlar), optionally linked to a managed list of projects (Projeler), with filters, totals, Excel export, a section on each member page, and delete rules that protect the history.

**Architecture:** This is a sibling of Ödemeler/Cariler and reuses their patterns and helpers: `money.ts`, `excel.ts`, `sumOfAmounts`, the `ApiError` field mapping, `LocationFields`-style shared form pieces, and `dateFilterText`. There are two new tables (`project`, `collection`) and two Hono route files. A tahsilat can create its proje in the same transaction. Delete rules are enforced as count-then-delete, with FK `restrict` as the backstop.

**Tech Stack:** Next.js 16 App Router, Hono RPC, Drizzle + Postgres, zod 4, TanStack Query/Table v9, react-hook-form, `write-excel-file` / `read-excel-file` (already installed).

**Spec:** `docs/superpowers/specs/2026-11-10-collections-design.md` (with `docs/superpowers/specs/2026-11-10-payments-design.md` as the reference for the shared patterns)

## Global Constraints

- All of CLAUDE.md applies: UI text is Turkish and code is English; `pnpm`; tests only through `pnpm test --run <pattern>`; test records named `__test__…` with a random suffix and cleaned up in `afterAll`; `db:push`, then `db:generate --name <name>`; never `db:migrate` locally.
- Every mutation calls `recordAudit(tx, …)` in its transaction. Updates use `diffFields` on display strings and write nothing when nothing changed. A refused delete writes nothing.
- Money follows the Ödemeler rules exactly: `numeric(12,2)` string mode with a `> 0` check, the API accepts `AMOUNT_PATTERN`, totals come from `sumOfAmounts()`-style SQL, and the form types the Turkish format through `AmountInput`.
- Tarih is required and not in the future (`requiredIsoDateSchema` / `requiredDisplayDateSchema`), and defaults to `todayInIstanbul()`.
- Delete rules: member, proje, Tahsilat Türü and Tahsilat Tipi can't be deleted while a tahsilat uses them (409 with the count; FK violation from a concurrent insert is mapped to the same 409).
- New tahsilat: the member and proje must be Aktif. On edit, the tahsilat's current member and proje are accepted even if Pasif.
- Proje Numarası is unique ignoring Turkish case and surrounding spaces (`number_key = number.trim().toLocaleLowerCase("tr")`).
- "Otomatik Tahsilatlar" stays a top-level "yakında" item; only its hidden `href` changes to `/automatic-collections`.
- The migration only creates `project` and `collection` (and their FKs and indexes).
- `pnpm exec tsc --noEmit` and `pnpm lint` pass at the end of every task.

## Review Focus

1. **"Yeni proje" with an invalid tahsilat** (e.g. amount "0.00", or a Tahsilat Tipi from the wrong list): nothing is saved, neither the proje nor the tahsilat. Test in Task 2: "creates nothing when the tahsilat is invalid".
2. **Editing a tahsilat whose member has become Pasif:** saving keeps it; switching to another Pasif member is refused. Tests in Task 2: "keeps a member that became Pasif" / "refuses another Pasif member".
3. **Proje Numarası typed with different case or spaces** ("pr-7 " vs "PR-7"): 409 with field `project.number` from the Tahsilat form, or `number` from the Projeler form. Tests in Tasks 1 and 2.
4. **Deleting a member with tahsilatlar:** 409; the member, its logo and its documents all stay (the files are removed only after a successful delete). Test in Task 2: "refuses to delete a member with tahsilatlar".
5. **The "Projesiz" filter, and kuruş totals** on the project and member filters. Test in Task 2: "filters by proje, Projesiz and member, summing kuruş exactly".

---

## File Structure

```
src/lib/projects.ts                 projectLabel (client-safe)
src/lib/zod-schemas/project.ts      projectSchema (API), projectFormSchema (form), shared field shapes
src/lib/zod-schemas/collection.ts   collectionSchema (API, with nested `project` choice), collectionFormSchema
src/lib/collection-filters.ts       CollectionFilters <-> URL params (client-safe)
src/lib/collection-prerequisites.ts missingForCollections (client-safe)
src/lib/fetches/project.ts, collection.ts
src/app/api/[[...route]]/projects.ts / .test.ts
src/app/api/[[...route]]/collections.ts / .test.ts
src/app/api/[[...route]]/collection-queries.ts   selectCollections, selectCollection
src/app/(panel)/projects/...        list, detail, new, edit
src/app/(panel)/collections/...     list, new, edit
src/components/project-fields.tsx   Ad / Proje Numarası / Aktif inputs, used by both forms
```

---

### Task 1: Projeler API

**Files:**
- Modify: `src/db/schema.ts` (add `projectTable` after `counterpartyTable`), `src/lib/audit.ts`, `src/lib/audit-filters.ts`, `src/lib/audit-labels.ts` (`project: "Projeler"`; `create: "Proje eklendi"`, `update: "Proje güncellendi"`, `delete: "Proje silindi"`), `app.ts` (mount `/projects`)
- Create: `src/lib/zod-schemas/project.ts`, `src/app/api/[[...route]]/projects.ts`, `projects.test.ts`, `src/lib/fetches/project.ts`, `drizzle/<ts>_project/`

**Interfaces:**
- Produces:
  - `projectTable`: `id`, `name` (text, not null), `number` (text, not null), `numberKey` (`number_key`, unique), `active` (boolean, default true, not null), timestamps
  - `projectFieldsSchema = z.object({ name: trimmed 1..200 "Proje adı boş olamaz", number: trimmed 1..50 "Proje numarası boş olamaz", active: z.boolean() })`. The API's POST and PATCH both take this full object. Export `projectFormSchema = projectFieldsSchema` and `type ProjectFormValues`.
  - Routes `/api/projects`:
    - `GET /` → `ProjectListItem[]` = `{ id, name, number, active, collectionCount: 0, totalCollected: "0.00" }`, sorted by `compareTr(number)` then name. Task 2 replaces the placeholders with a join.
    - `GET /:id` → `{ id, name, number, active, collectionCount }`, or 404.
    - `POST` → 201 `{ id }`. `PATCH /:id` → 200. `DELETE /:id` → 200 / 404 (Task 2 adds the 409).
    - Duplicates: a 409 `{ error: "Bu proje numarası zaten var", field: "number" }`.
  - `export async function insertProject(tx: Transaction, values: ProjectFields, actor: AuditActor): Promise<{ id: number; name: string; number: string }>`: inserts, audits the create, and is reused by Task 2. It throws on a unique violation; callers map that to their own field path.
  - fetches: `getProjects`, `getProject` (null on 404), `createProject(values): Promise<number>`, `updateProject(id, values)`, `deleteProject(id)`; types `ProjectListItem`, `Project`
  - `projectLabel({ name, number }) => \`${name} (${number})\`` in `src/lib/projects.ts` (client-safe), used for pickers and audit values
  - Audit spec labels: Ad, Proje Numarası, Durum (`formatAudit.active`)

- [ ] **Step 1: Write the failing tests** (`projects.test.ts`, structured like `counterparties.test.ts`)
  - `creates a project, active by default in the form, and records it`: POST `{ name: " __test__ Kreş ", number: " PR-${suffix} ", active: true }` returns 201. GET returns the trimmed name and number. The audit `details` are `[Ad, Proje Numarası, Durum: "Aktif"]`.
  - `requires name and number`: each blank one gives 400 with its message and `field`.
  - `rejects a number differing only in case or spaces`: `PR-${suffix}` then ` pr-${suffix}` → 409 `{ error: "Bu proje numarası zaten var", field: "number" }`.
  - `updates and records only changed fields`: flipping only `active` gives `changes` `[{ label: "Durum", from: "Aktif", to: "Pasif" }]`. An identical PATCH writes no entry.
  - `deletes and records`; `404s for unknown ids` (GET, PATCH, DELETE).
- [ ] **Step 2: Run** `pnpm test --run projects`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement**: the table, `pnpm db:push`, the schemas, `insertProject`, the route, the fetches and `projectLabel`.
- [ ] **Step 4: Run** `pnpm test --run projects`. Expected: PASS.
- [ ] **Step 5:** `pnpm db:generate --name project` (check the SQL only creates `project`); run tsc and lint; commit `feat: Projeler API`.

---

### Task 2: Tahsilatlar API, delete rules and the member side

**Files:**
- Modify: `src/db/schema.ts` (add `collectionTable` after `projectTable`), audit files (`collection: "Tahsilatlar"`; `create: "Tahsilat eklendi"`, `update: "Tahsilat güncellendi"`, `delete: "Tahsilat silindi"`), `app.ts` (mount `/collections`), `validation.ts`, `projects.ts` (+ test), `parameters.ts` (+ test), `members.ts` (+ `members.test.ts`)
- Create: `src/lib/collection-filters.ts`, `src/lib/zod-schemas/collection.ts`, `collection-queries.ts`, `collections.ts`, `collections.test.ts`, `src/lib/fetches/collection.ts`, `drizzle/<ts>_collection/`

**Interfaces:**
- Consumes: `insertProject`, `projectFieldsSchema`, `projectLabel` (Task 1); `AMOUNT_PATTERN`, `formatAmount`; `requiredIsoDateSchema`; `sumOfAmounts` (from `payment-queries.ts`; move it to a shared `amount-sql.ts` if importing across feels wrong).
- Produces:
  - `collectionTable`:
    - `id`
    - `memberId` (`member_id`, FK restrict, not null)
    - `categoryId` / `methodId` (FK `parameter` restrict, not null)
    - `amount` (`numeric(12,2)`, check `> 0`)
    - `date` (`date`)
    - `note`
    - `projectId` (`project_id`, FK restrict, nullable)
    - timestamps
    - indexes on `(date desc, id desc)`, `member_id` and `project_id`
  - `type CollectionFilters = { from: string | null; to: string | null; member: number | null; category: number | null; method: number | null; project: number | "none" | null }` with `parseCollectionFilters` / `collectionFiltersToParams` (`project=none` in the URL). `NO_COLLECTION_FILTERS`.
  - `collectionSchema` (API):
    - `{ memberId, categoryId, methodId, amount, date, note }` with the same rules as `paymentSchema`
    - `project: z.discriminatedUnion("mode", [{ mode: "none" }, { mode: "existing", id: positive int "Proje seçin" }, { mode: "new", ...projectFieldsSchema.shape }])`
  - `collectionFormSchema` (form): the payment form's rules for the shared fields, plus `project: { mode: "none" | "existing" | "new"; id: number | null; name: string; number: string; active: boolean }`. A `superRefine` requires `id` for "existing", and runs `projectFieldsSchema`'s rules on name and number for "new", at paths `project.id` / `project.name` / `project.number`.
  - `respondWithFirstField` now returns `field: issue.path.join(".")` (so `"project.number"`). Top-level paths are unchanged.
  - `collection-queries.ts`:
    - `selectCollections(filters): Promise<{ collections: CollectionRow[]; count: number; total: string }>`
    - `CollectionRow = { id, date, amount, note, memberId, memberTitle, categoryId, categoryName, methodId, methodName, projectId, projectName, projectNumber }`, newest first (`date desc, id desc`). Left join on project. `project: "none"` → `project_id is null`.
    - `selectCollection(id, executor?)`.
  - Routes `/api/collections`:
    - `GET /` (filters) → `selectCollections`; `GET /:id` → row or 404
    - `POST` → 201 `{ id, projectId }`; `PATCH /:id` (full body) → 200; `DELETE /:id` → 200 / 404
    - 400 errors:
      - "Seçilen üye bulunamadı" / "Seçilen üye aktif değil"
      - "Geçerli bir tahsilat türü seçin" / "Geçerli bir tahsilat tipi seçin"
      - "Seçilen proje bulunamadı" / "Seçilen proje aktif değil"
      - all with `field` (`memberId`, `categoryId`, `methodId`, `project.id`)
    - A duplicate number with `mode: "new"` → 409 `{ error: "Bu proje numarası zaten var", field: "project.number" }`.
  - Audit:
    - tahsilat spec labels in order: Üye, Tutar, Tarih, Tahsilat Türü, Tahsilat Tipi, Proje (`projectLabel` or "—"), Not
    - entity label `${memberTitle} · ${formatAmount(amount)} · ${isoToDisplay(date)}`
    - "new" mode: `insertProject` first (audits the proje), then the tahsilat insert and its audit, all in one transaction
  - `GET /api/projects` items get the real `collectionCount` / `totalCollected` (left join + `sumOfAmounts`); `GET /:id` gets the real `collectionCount`. `DELETE /api/projects/:id` with tahsilatlar → 409 `"Bu projeye ait N tahsilat var. Silmek yerine pasif yapabilirsiniz."`.
  - `GET /api/parameters` items: rename `paymentCount` to **`usageCount`** = payments + collections using the entry. Delete 409 message by kind: payment kinds `"Bu kayıt N ödemede kullanılıyor, silinemez."` (unchanged), collection kinds `"Bu kayıt N tahsilatta kullanılıyor, silinemez."`. Update `parameters.test.ts` for the rename.
  - `GET /api/members/:id` gains `collectionCount`. `DELETE /api/members/:id` with tahsilatlar → 409 `"Bu üyeye ait N tahsilat var. Silmek yerine pasif yapabilirsiniz."`, without deleting any files.
  - fetches: `getCollections(filters, options?)`, `getCollection(id, options?)` (null on 404), `createCollection(values: CollectionFormValues)`, `updateCollection(id, values)`, `deleteCollection(id)`, `collectionsExportHref(filters)` (used in Task 3); types `CollectionList`, `CollectionRow`, `Collection`. `toCollectionJson` maps the form's project block to the API's discriminated union and the amount/date to the API forms.

- [ ] **Step 1: Write the failing tests.** `collections.test.ts` inserts its own fixtures directly: an Aktif and a Pasif member (`__test__ … ${suffix}`), `collection_*` and `payment_*` parameters, and an Aktif and a Pasif proje. Its `afterAll` deletes collections, then projects, members and parameters.
  - `creates a tahsilat without a project and records it`: the entity label and the detail labels as in Interfaces, with Proje "—".
  - `links an existing Aktif project`: the GET row has `projectName` and `projectNumber`.
  - `creates a new project with the tahsilat in one go`: 201 with `projectId`. The proje exists, and there are two audit entries (`project` create, then `collection` create with Proje `Ad (No)`).
  - `creates nothing when the tahsilat is invalid`: `mode: "new"` with `amount: "0.00"`, and again with a `payment_method` id as `methodId`, gives 400, and no proje with that number exists afterwards.
  - `reports a duplicate project number under the project field`: 409 with `field: "project.number"`, and no tahsilat saved.
  - `requires every field but the note`; `rejects zero, negative and malformed amounts`; `rejects a future date`
  - `rejects parameters from the wrong list`: payment kinds, and category/method swapped.
  - `refuses a Pasif member or project on create`: 400 with the messages above.
  - `keeps a member that became Pasif`: create for an Aktif member, set it Pasif in the db, PATCH with the same `memberId` and a new amount → 200.
  - `refuses another Pasif member`: PATCH to a different Pasif member → 400. The same pair of tests for proje.
  - `filters by proje, Projesiz and member, summing kuruş exactly`: three tahsilatlar for one member (0.10 with proje A, 0.20 with no proje, 100.00 with proje A). `?member=` gives a total of "100.30", `&project=none` gives "0.20", and `&project=<A>` gives "100.10" in date-desc order.
  - `updates and records changed fields`: switching the proje from none to A, and changing the amount, gives `changes` for Tutar and Proje ("—" → "Ad (No)").
  - `deletes and records`; `404s`

  Additions elsewhere:
  - `projects.test.ts`: `counts tahsilatlar and refuses to delete a project with them`
  - `parameters.test.ts`: `counts tahsilatlar in usageCount and refuses to delete a used collection entry`
  - `members.test.ts`: `refuses to delete a member with tahsilatlar` (409; the member and its `logo` path are still there), and `includes collectionCount in the member detail`
- [ ] **Step 2: Run** `pnpm test --run collections projects parameters members`. Expected: FAIL.
- [ ] **Step 3: Implement**, then `pnpm db:push`.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `pnpm test --run`: everything passes.
- [ ] **Step 5:** `pnpm db:generate --name collection` (check the SQL only creates `collection`); run tsc and lint; commit `feat: Tahsilatlar API with project linking and delete rules`.

---

### Task 3: Tahsilatlar Excel export

**Files:** Modify `collections.ts`, `collections.test.ts`, `excel.ts` (`baseName` union adds `"tahsilatlar"`), `src/lib/fetches/collection.ts` (`collectionsExportHref`).

**Interfaces:** `GET /api/collections/export?<filters>` is registered before `/:id`. The sheet is "Tahsilatlar", with header `Tarih, Üye, Tutar, Tahsilat Türü, Tahsilat Tipi, Proje, Not`, then rows newest first, a blank row, and a bold `Toplam` row. It uses the `dateCell` / `amountCell` / `header` helpers and `stickyRowsCount: 1`. Proje is `projectLabel` or empty. The file is named `tahsilatlar-<Istanbul date>.xlsx`.

- [ ] **Step 1: Failing test** `exports the filtered tahsilatlar with real cells and a total`: it creates its own fixtures and reads the file back with `readSheet`. It checks the header, Date cells, number cells, the Proje label, a total row of `toBeCloseTo(0.3, 10)`, and the `Content-Disposition` filename.
- [ ] **Step 2:** `pnpm test --run collections`. Expected: FAIL (400 on `/export`).
- [ ] **Step 3: Implement.** **Step 4:** run it. Expected: PASS.
- [ ] **Step 5:** tsc and lint; commit `feat: Excel export of Tahsilatlar`.

---

### Task 4: Projeler pages and the Finans items

**Files:**
- Modify: `src/lib/nav.ts` and `nav.test.ts`. Finans children become Ödemeler, Cariler, `{ title: "Tahsilatlar", href: "/collections", icon: Coins }`, `{ title: "Projeler", href: "/projects", icon: FolderKanban }`. Otomatik Tahsilatlar `href: "/automatic-collections"`. The test asserts both the children order and the placeholder's new href.
- Create: `src/components/project-fields.tsx`, `src/app/(panel)/projects/` (`page.tsx`, `projects.tsx`, `new/page.tsx`, `_components/project-form.tsx`, `[id]/page.tsx`, `[id]/not-found.tsx`, `[id]/project-details.tsx`, `[id]/toggle-active-button.tsx`, `[id]/delete-project-button.tsx`, `[id]/edit/page.tsx`, `[id]/edit/edit-project.tsx`)

**Interfaces:**
- `ProjectFields<T>({ control, prefix }: { control: Control<T>; prefix: "" | "project." })` renders Ad*, Proje Numarası* and an "Aktif proje" checkbox bound to `${prefix}name` / `${prefix}number` / `${prefix}active`. The Projeler form uses prefix `""`, and the Tahsilat form (Task 5) uses `"project."`.
- Copy the Cariler/Yetkililer page structure. The differences:
  - **List** (`tableId` `"projects"`): columns Proje Numarası, Ad (link), Durum (`PassiveTag` when Pasif), Tahsilat (count), Toplam Tahsilat (`formatAmount`, numeric sort). Search on Ad and Proje Numarası. A status Select ("Aktif projeler" / "Pasif projeler" / "Tüm projeler", default Aktif, `?status=`) like Yetkililer. Button "Proje Ekle".
  - **Detail:** `InfoFields` with Proje Numarası and Durum. A Tahsilatlar section (prefetched `["collections", "list", { …NO_COLLECTION_FILTERS, project: id }]`) with a compact table (Tarih → edit link with `?project=`, Üye, Tutar, Tür, Tip, Not), "N tahsilat · Toplam …", "Tahsilat Ekle" (`/collections/new?project=<id>`, shown only while Aktif), and "Tüm tahsilatlarda göster" (`/collections?project=<id>`). Buttons: Düzenle; Aktif/Pasif yap (sends the full body with `active` flipped); Sil.
  - **Delete dialog:** when `collectionCount > 0` it says "Bu proje silinemez": "“Ad” projesine ait N tahsilat var. Silmek yerine projeyi pasif yapabilirsiniz." with only a "Tamam" button. Otherwise it's the usual confirm.
  - **Form:** maps `ApiError.field` onto inputs (as the cari form does). Saving invalidates `["projects"]` and `["collections"]`, then goes to the detail page.
- [ ] **Step 1:** update `nav.test.ts` (failing first), then make it pass; build the pages; run `pnpm exec next typegen`.
- [ ] **Step 2:** tsc and lint pass.
- [ ] **Step 3: Click through in dev** (memory `test-panel-in-dev`):
  - create a proje, and try a duplicate number with different case
  - edit it, toggle it Pasif/Aktif, then check the list's status filter and the search
  - delete an unused proje
  - check the Finans menu shows four items
  - remove everything you created afterwards
- [ ] **Step 4:** commit `feat: Projeler pages and Finans items`.

---

### Task 5: Tahsilatlar pages, the member page section and the dialogs

**Files:**
- Create: `src/app/(panel)/collections/` (`page.tsx`, `collections.tsx`, `new/page.tsx`, `_components/collection-form.tsx`, `_components/project-section.tsx`, `_components/prefetch-form-lists.ts`, `_components/missing-prerequisites-notice.tsx`, `[id]/not-found.tsx`, `[id]/edit/page.tsx`, `[id]/edit/edit-collection.tsx`, `[id]/edit/delete-collection-button.tsx`), `src/lib/collection-prerequisites.ts` (+ test), `src/components/ui/radio-group.tsx` (via `pnpm dlx shadcn@latest add radio-group`, declining overwrites)
- Move: `dateFilterText` from `src/lib/payment-filters.ts` (and its test) to `src/lib/dates.ts` / `dates.test.ts`; update the payments list import.
- Modify: `src/app/(panel)/members/[id]/page.tsx`, `member-details.tsx`, `delete-member-button.tsx`; `src/app/(panel)/settings/delete-parameter-button.tsx` (`usageCount` and a noun by kind: "ödemede" or "tahsilatta").

**Interfaces:**
- `missingForCollections(members: readonly { status: string }[] | undefined, parameters: readonly { kind: string }[] | undefined): { member: boolean; parameters: boolean }`. A member counts only when `status === "active"`. A list that hasn't loaded counts as not missing. The notice text follows the Ödemeler one: links to **Üyeler** (`/members`) and **Ayarlar → Parametreler**, ending "…den tahsilat türü ve tipi ekleyin" or "…den aktif üye ekleyin".
- **Collection list** (`tableId` `"collections"`): Ödemeler's list with these changes:
  - Üye replaces Cari.
  - A Proje column shows `projectLabel` linked to `/projects/<id>`, or "—".
  - The filters add Üye (all members that appear are fine, but the picker offers Aktif members plus the currently filtered one) and Proje (a `SearchCombobox` with every proje, plus a "Projesiz" choice mapped to `"none"`).
  - Summary "N tahsilat · Toplam …", export via `collectionsExportHref`, and the `dateFilterText` pending/invalid handling.
- **Form** (`collection-form.tsx`):
  - Tahsilat section: Üye* (Aktif members by title, plus the tahsilat's current member when editing, labelled "(Pasif)" if so), Tahsilat Türü*, Tahsilat Tipi* (`collection_category` / `collection_method`), Tutar* (`AmountInput`), Tarih* (default today), Not.
  - `ProjectSection`: a radio group (Projesiz / Mevcut proje / Yeni proje). "Mevcut proje" shows a `SearchCombobox` of Aktif projeler (`projectLabel`), plus the current one on edit. "Yeni proje" shows `ProjectFields prefix="project."`.
  - On edit, the default mode is "existing" when the tahsilat has a proje, otherwise "none".
  - `ApiError.field` (including `project.number` / `project.id`) maps onto the inputs.
  - `?member=` / `?project=` preselect (ignored when not among the offered options) and set the back target.
  - Saving invalidates `["collections"]`, `["projects"]`, `["members"]` and `["parameters"]`.
- **Delete** on the edit form footer, as for payments.
- **Member page:** a "Tahsilatlar" section after the existing ones, the same as the cari page's Ödemeler section:
  - columns Tarih (edit link `?member=`), Tutar, Tür, Tip, Proje, Not
  - the count and total
  - "Tahsilat Ekle" only when the member is Aktif
  - "Tüm tahsilatlarda göster"
  - prefetched in `members/[id]/page.tsx`
- **Member delete dialog:** when `collectionCount > 0` it says "Bu üye silinemez": "“X” üyesine ait N tahsilat var. Silmek yerine üyeyi pasif yapabilirsiniz." with only "Tamam".
- [ ] **Step 1:** the failing `collection-prerequisites.test.ts`. Its cases mirror `payment-prerequisites.test.ts`, plus "a Pasif member doesn't count". Move `dateFilterText` and its tests, and check they still pass. Then implement.
- [ ] **Step 2:** build the pages; `pnpm exec next typegen`; tsc and lint pass.
- [ ] **Step 3: Click through in dev:**
  - Check the notice when there are no tahsilat türü/tipi.
  - Record a tahsilat with "Yeni proje", then try a duplicate number (the error shows under Proje Numarası, and nothing is saved).
  - Record another with "Mevcut proje" and one "Projesiz".
  - Try the filters (Projesiz, proje, üye, dates) and check the URL and the total.
  - Export with filters and inspect the file.
  - Check the member page section and its "Tahsilat Ekle" round trip.
  - Try deleting a member with tahsilatlar (refused), then a used proje and a used Tahsilat Türü (refused).
  - Make the member Pasif and edit its tahsilat (it keeps the member).
  - Delete the tahsilatlar.
  - Remove everything you created.
- [ ] **Step 4:** commit `feat: Tahsilatlar pages and member tahsilat section`.

---

### Task 6: Docs and final verification

- Modify `CLAUDE.md` Domain notes:
  - Tahsilatlar (`collection`): member-only, Aktif-only on create, keeps a Pasif member or proje on edit; the proje choice (none / existing / new in one transaction).
  - Projeler (`project`): name, number, active; the number is unique.
  - The delete rules for member, proje and parameters (`usageCount`).
  - That Otomatik Tahsilatlar is a separate, undecided feature whose placeholder is at `/automatic-collections`.
  - Update the member note: members with tahsilatlar can't be hard-deleted.
- [ ] Run `pnpm test --run && pnpm exec tsc --noEmit && pnpm lint && pnpm build`. Expected: everything green and the new routes listed. Commit `docs: Tahsilatlar and Projeler`.
