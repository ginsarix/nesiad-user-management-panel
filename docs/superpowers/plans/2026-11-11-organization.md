# Organizasyon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four pages under a new "Organizasyon" sidebar item (Yönetimler, Komiteler, Disiplin Kurulu, Denetim Kurulu), each listing named groups of yetkililer with a Dernek Görevi, plus an Organizasyonlar section on the yetkili details page.

**Architecture:** Each organization has its own two tables (group + people), built by one schema factory so they share a TypeScript type. One client-safe config (`src/lib/organizations.ts`) drives everything else. There is one Hono route with an `:organization` slug parameter, one fetch module, and one set of pages under `src/app/(panel)/organization/[organization]/`. A later special case can branch on the organization or get its own static route folder, which Next.js prefers over the dynamic one.

**Tech Stack:** Next.js 16 App Router, Hono RPC, Drizzle + Postgres, zod 4, TanStack Query/Table v9, react-hook-form.

**Spec:** `docs/superpowers/specs/2026-11-11-organization-design.md`

## Global Constraints

- All of CLAUDE.md applies: UI text is Turkish and code is English; `pnpm`; tests only through `pnpm test --run <pattern>`; test records named `__test__…` with a random suffix and cleaned up in `afterAll`; `db:push` then `db:generate --name <name>`; never `db:migrate` locally.
- Separate tables per organization (spec anti-goal: no shared storage).
- İsim is unique within an organization ignoring Turkish case: `name_key = name.toLocaleLowerCase("tr")`, with a unique constraint.
- The same yetkili may appear in a group more than once. There is no uniqueness on (group, yetkili), in either the form or the API.
- Every person row needs a yetkili and a görev, and the görev must be an `association_role` parameter.
- New rows need an Aktif yetkili. A Pasif yetkili is accepted only if that yetkili was already in the group before the save (matched by yetkili id).
- FKs: person → group `cascade`, person → `authorized_representative` `cascade`, person → `parameter` `restrict`.
- Every group mutation writes `recordAudit(tx, …)` in its transaction with `entityType` = the organization key; an update with no change writes nothing.
- The migration only creates tables. No production data is touched.
- `pnpm exec tsc --noEmit` and `pnpm lint` pass at the end of every task.

## Review Focus

1. **A yetkili becomes Pasif while in a group.** Re-saving the group keeps them; adding a different Pasif yetkili is refused. Tests in Task 2: "keeps a yetkili that became Pasif", "refuses a Pasif yetkili not already in the group".
2. **The same yetkili twice in one group.** It's saved in order and appears twice on the yetkili page. Tests in Task 2 ("allows the same yetkili twice") and Task 3 ("lists each group row").
3. **Names that differ only by Turkish case** ("İŞ Komitesi" vs "iş komitesi") get a 409 on `name`, while the same name on a different organization page is fine. Tests in Task 2.
4. **A görev id from another parameter list** (e.g. a `payment_method`) or an unknown yetkili id gets a 400 and saves nothing. Tests in Task 2.
5. **Deleting a yetkili or a Dernek Görevi that groups use.** The yetkili is removed from groups, and its audit entry names them. The görev is refused with 409 and the organization wording. Tests in Task 3.

---

## File Structure

```
src/lib/organizations.ts                       config, slug lookup, organizationPeopleText (client-safe)
src/lib/organizations.test.ts
src/db/schema.ts                               organizationTables factory + 8 exported tables
drizzle/<timestamp>_organization/              generated migration
src/lib/zod-schemas/organization.ts            API + form schemas
src/app/api/[[...route]]/organization-queries.ts   ORGANIZATION_TABLES, per-yetkili and usage queries (server)
src/app/api/[[...route]]/organizations.ts      the Hono route
src/app/api/[[...route]]/organizations.test.ts
src/lib/fetches/organization.ts                RPC fetches + types
src/app/(panel)/organization/[organization]/page.tsx, organization-groups.tsx      list
src/app/(panel)/organization/[organization]/new/page.tsx
src/app/(panel)/organization/[organization]/[id]/page.tsx, group-details.tsx, delete-group-button.tsx, not-found.tsx
src/app/(panel)/organization/[organization]/[id]/edit/page.tsx, edit-group.tsx
src/app/(panel)/organization/_components/group-form.tsx
```

Modified: `app.ts`, `audit.ts`, `audit-filters.ts`, `audit-labels.ts`, `nav.ts`, `parameters.ts` (lib), `parameters.ts` (route), `representatives.ts` (route), the yetkili details/delete/toggle/form components, `parameter-dialog.tsx`, `delete-parameter-button.tsx`, `CLAUDE.md`.

---

### Task 1: Config, tables and migration

**Files:**
- Create: `src/lib/organizations.ts`, `src/lib/organizations.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/<timestamp>_organization/` (generated)

**Interfaces:**
- Produces:
  - `ORGANIZATIONS = ["management_board", "committee", "disciplinary_board", "supervisory_board"] as const`, `type Organization`. The array order is the display order everywhere.
  - `ORGANIZATION_INFO: Record<Organization, { slug: string; title: string; singular: string; noun: string; backLabel: string }>` with exactly:

    | key | slug | title | singular | noun | backLabel |
    |---|---|---|---|---|---|
    | management_board | `management-boards` | Yönetimler | Yönetim | yönetim | Yönetimlere dön |
    | committee | `committees` | Komiteler | Komite | komite | Komitelere dön |
    | disciplinary_board | `disciplinary-boards` | Disiplin Kurulu | Disiplin Kurulu | disiplin kurulu | Disiplin Kurulu listesine dön |
    | supervisory_board | `supervisory-boards` | Denetim Kurulu | Denetim Kurulu | denetim kurulu | Denetim Kurulu listesine dön |

  - `ORGANIZATION_SLUGS` (tuple of the slugs, for `z.enum`), `organizationFromSlug(slug: string): Organization | null`, `organizationHref(organization: Organization, path?: string): string` (`organizationHref("committee")` → `/organization/committees`, `organizationHref("committee", "12/edit")` → `/organization/committees/12/edit`).
  - `organizationPeopleText(people: { representativeName: string; roleName: string }[]): string`, e.g. `"Ahmet Yılmaz: Başkan, Ayşe Demir: Üye"`, or `"—"` when empty. Used in audit details.
  - In `schema.ts`: a non-exported `organizationTables(name: string)` returning `{ group, person }`, and the exports `managementBoardTable`, `managementBoardMemberTable`, `committeeTable`, `committeeMemberTable`, `disciplinaryBoardTable`, `disciplinaryBoardMemberTable`, `supervisoryBoardTable`, `supervisoryBoardMemberTable`. Group columns: `id` identity, `name`, `nameKey` (`name_key`), `createdAt`, `updatedAt` (same as `projectTable`), unique `${name}_name_key_unique`. Person table `${name}_member`: `id` identity, `groupId` (`group_id`, notNull, cascade), `representativeId` (`representative_id`, notNull, → `authorizedRepresentativeTable.id` cascade), `roleId` (`role_id`, notNull, → `parameterTable.id` restrict), `position` (integer notNull), indexes on `group_id`, `representative_id`, `role_id`.

- [ ] **Step 1: Write the failing tests** in `src/lib/organizations.test.ts`:
  - `organizationFromSlug("committees")` → `"committee"`; `organizationFromSlug("nope")` → `null`.
  - `organizationHref("supervisory_board", "3")` → `"/organization/supervisory-boards/3"`.
  - `organizationPeopleText([])` → `"—"`; two people → `"Ahmet Yılmaz: Başkan, Ayşe Demir: Üye"`.
- [ ] **Step 2:** `pnpm test --run organizations.test` → FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/organizations.ts` (no db imports, "Client-safe" header comment like `parameters.ts`).
- [ ] **Step 4:** `pnpm test --run src/lib/organizations` → PASS.
- [ ] **Step 5:** Add the factory and the 8 tables to `schema.ts`, after `authorizedRepresentativeTable` and `parameterTable` are defined. Comment the factory: separate tables per organization on purpose (spec anti-goal), and to special-case one, replace its factory call with explicit tables.
- [ ] **Step 6:** `pnpm db:push`, then `pnpm db:generate --name organization`. Check the SQL only has `CREATE TABLE`, `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` and `CREATE INDEX`.
- [ ] **Step 7:** `pnpm exec tsc --noEmit && pnpm lint`, then commit `feat: add the Organizasyon tables` (schema, migration, config, test).

### Task 2: The API route

**Files:**
- Create: `src/lib/zod-schemas/organization.ts`, `src/app/api/[[...route]]/organization-queries.ts`, `src/app/api/[[...route]]/organizations.ts`, `src/app/api/[[...route]]/organizations.test.ts`
- Modify: `app.ts` (`.route("/organizations", organizationsRoute)` after representatives), `src/lib/audit.ts` (`AuditEntityType` += the 4 keys), `src/lib/audit-filters.ts` (`AUDIT_ENTITY_TYPES` += the 4, after `representative`), `src/lib/audit-labels.ts` (`ENTITY_TYPE_LABELS` = each `title`; `RECORD_ACTIONS` create/update/delete = `"<singular> eklendi" / "güncellendi" / "silindi"`, e.g. "Komite eklendi")

**Interfaces:**
- Consumes: Task 1 config and tables.
- Produces:
  - Zod: `organizationGroupSchema` (API): `{ name: string trimmed, min 1 "İsim boş olamaz"; people: { representativeId: int > 0; roleId: int > 0 }[] }` (people required, may be empty). `organizationGroupFormSchema`: the same `name`, people rows with `representativeId: number | null` refined "Yetkili seçin" and `roleId: number | null` refined "Görev seçin" (the `representativeFormSchema` pattern). Types `OrganizationGroupFormInput`, `OrganizationGroupFormValues`. `organizationParamSchema = z.object({ organization: z.enum(ORGANIZATION_SLUGS, { error: "Geçersiz organizasyon" }) })`.
  - `organization-queries.ts`: `ORGANIZATION_TABLES: Record<Organization, { group: typeof committeeTable; person: typeof committeeMemberTable }>`; `selectRepresentativeOrganizations(representativeId: number, executor?: Executor): Promise<{ organization: Organization; groupId: number; groupName: string; role: string }[]>`, one entry per person row, sorted by `ORGANIZATIONS` order, then `compareTr(groupName)`, then `position`; `representativeOrganizationsText(executor: Executor, representativeId: number): Promise<string>` → `"Komiteler › Eğitim Komitesi: Başkan, …"` or `"—"`; `organizationRoleUsageSql(roleId: AnyPgColumn): SQL<number>` (sum over the four person tables of rows with that `role_id`); `countOrganizationRoleUsage(executor: Executor, roleId: number): Promise<number>`.
  - Route `organizationsRoute`, all under `/:organization` (validated with `organizationParamSchema`):
    - `GET /:organization` → `{ id: number; name: string; personCount: number }[]` sorted by `compareTr(name)`. `personCount` counts rows.
    - `GET /:organization/:id` → `{ id; name; people: { id; representativeId; representativeName; representativeActive: boolean; roleId; roleName }[] }` ordered by `position`; 404 `{ error: "Kayıt bulunamadı" }`.
    - `POST /:organization` (body `organizationGroupSchema`) → 201 `{ id, message: "Kaydedildi" }`.
    - `PATCH /:organization/:id` (same body; replaces the name and all rows) → 200 `{ id, message: "Güncellendi" }`; 404 as above.
    - `DELETE /:organization/:id` → 200 `{ message: "Silindi" }`; 404 as above.
    - Errors: duplicate name → 409 `{ error: "Bu isimde bir kayıt zaten var", field: "name" }` (map `UNIQUE_VIOLATION`); unknown yetkili id → 400 `"Seçilen yetkili bulunamadı"`; görev id that isn't an `association_role` parameter → 400 `"Seçilen görev bulunamadı"`; Pasif yetkili not already in the group → 400 `"Pasif yetkili eklenemez"`. Check all three inside the transaction before writing rows (one `inArray` select per table). Rows are replaced as delete + insert with `position` = array index.
    - Audit: `entityLabel` = group name. Create and delete `details`: `[{ label: "İsim", value }, { label: "Kişiler", value: organizationPeopleText(...) }]`, with names read before the delete. Update `changes`: `change("İsim", …)` + `change("Kişiler", beforeText, afterText)`, and no entry when both are empty.

- [ ] **Step 1: Write the failing tests** in `organizations.test.ts`. Insert their own `__test__` yetkililer (two Aktif, one Pasif) and two `association_role` parameters plus one `payment_method` parameter directly. Call `organizationsRoute.request("/committees", …)` and the like. Clean up groups by id, then yetkililer and parameters, in `afterAll`. Tests:
  - "creates a group with people in order": POST with [A: Başkan, B: Üye] → 201. GET detail returns the two rows in that order with names, `representativeActive: true` and `roleName`. The audit `create` entry has `details` `[{İsim}, {Kişiler: "<A>: <Başkan>, <B>: <Üye>"}]` and `entityType: "committee"`.
  - "allows the same yetkili twice": people [A: Başkan, A: Üye] → 201, detail has 2 rows.
  - "lists groups with their person count": the list contains `{ id, name, personCount: 2 }`.
  - "refuses a name used in the same organization, ignoring Turkish case": `__test__ İŞ Komitesi ${suffix}` then `__test__ iş komitesi ${suffix}` → 409 with `field: "name"`. The same name on `/management-boards` → 201.
  - "refuses a görev from another list": roleId = the payment_method id → 400 "Seçilen görev bulunamadı", and no group was created (list doesn't contain the name).
  - "refuses an unknown yetkili": representativeId 2147483000 → 400 "Seçilen yetkili bulunamadı".
  - "refuses a Pasif yetkili not already in the group": a new group with the Pasif yetkili → 400 "Pasif yetkili eklenemez".
  - "keeps a yetkili that became Pasif": create with A; set A `active=false` directly; PATCH with the same people → 200. PATCH adding a second row for A → 200 (matched by yetkili). Restore A afterwards.
  - "records only what changed": PATCH with the identical body writes no new `update` entry. PATCH changing a görev writes one with a `Kişiler` change and no `İsim` change.
  - "deletes a group with its people": DELETE → 200, then GET → 404, and the audit `delete` entry lists the people.
  - "rejects an unknown organization": GET `/nope` → 400 "Geçersiz organizasyon".
- [ ] **Step 2:** `pnpm test --run organizations` → FAIL.
- [ ] **Step 3:** Implement the zod schemas, `organization-queries.ts`, and the route. Follow `projects.ts` / `representatives.ts` for transactions, `pgErrorCode`, `respondWithFirstIssue` and `actorOf`. Mount it in `app.ts`, then extend the audit type, filter and labels.
- [ ] **Step 4:** `pnpm test --run organizations audit` → PASS (the audit tests cover the filter list).
- [ ] **Step 5:** `pnpm exec tsc --noEmit && pnpm lint`, then commit `feat: add the Organizasyon API`.

### Task 3: Yetkili and Dernek Görevi integration (API)

**Files:**
- Modify: `src/app/api/[[...route]]/representatives.ts`, `src/app/api/[[...route]]/representatives.test.ts`, `src/app/api/[[...route]]/parameters.ts`, `src/app/api/[[...route]]/parameters.test.ts`, `src/lib/parameters.ts`

**Interfaces:**
- Consumes: `selectRepresentativeOrganizations`, `representativeOrganizationsText`, `organizationRoleUsageSql`, `countOrganizationRoleUsage` (Task 2).
- Produces:
  - `GET /api/representatives/:id` gains `organizations: { organization: Organization; groupId: number; groupName: string; role: string }[]`.
  - The yetkili `delete` audit `details` gain `{ label: "Organizasyonlar", value: representativeOrganizationsText(...) }`, read before the delete.
  - `src/lib/parameters.ts`: `parameterUsageNouns(kind: ParameterKind): { locative: string; genitivePlural: string }`. `payment_*` → `ödemede` / `ödemelerin`, `collection_*` → `tahsilatta` / `tahsilatların`, `association_role` → `organizasyon kaydında` / `organizasyon kayıtlarının`. This replaces the `startsWith("payment_")` logic in both the route's `inUseError` and `delete-parameter-button.tsx`. The button change is in Task 5, but the function lands here.
  - The parameters API `usageCount` and `usageOf` include `organizationRoleUsageSql` / `countOrganizationRoleUsage`.

- [ ] **Step 1: Write the failing tests:**
  - `representatives.test.ts` "lists each group row on the yetkili": put a test yetkili in one committee twice (Başkan, Üye) and in one supervisory board. `GET /:id` → `organizations` has 3 entries: committee rows first, in position order, then supervisory_board.
  - `representatives.test.ts` "removes a deleted yetkili from groups and names them": DELETE the yetkili, then the group detail has no rows for them. The audit `delete` entry's `Organizasyonlar` detail is `"Komiteler › <name>: <role>, …"`.
  - `parameters.test.ts` "refuses to delete a Dernek Görevi a group uses": a group row uses it. GET list shows `usageCount: 1`, and DELETE → 409 `"Bu kayıt 1 organizasyon kaydında kullanılıyor, silinemez."`.
  - A unit test for `parameterUsageNouns` in a new `src/lib/parameters.test.ts`: one kind from each family.
- [ ] **Step 2:** `pnpm test --run representatives parameters` → the new tests FAIL.
- [ ] **Step 3:** Implement. Insert group rows in these tests directly through `ORGANIZATION_TABLES`, or through `organizationsRoute`.
- [ ] **Step 4:** `pnpm test --run representatives parameters organizations` → PASS.
- [ ] **Step 5:** `pnpm exec tsc --noEmit && pnpm lint`, then commit `feat: count Organizasyon rows for yetkililer and Dernek Görevleri`.

### Task 4: Organizasyon pages

**Files:**
- Create: `src/lib/fetches/organization.ts` and the page files listed in File Structure.
- Modify: `src/lib/nav.ts`

**Interfaces:**
- Consumes: the route (Task 2), config (Task 1), `getRepresentatives`, `getParameters`.
- Produces:
  - Fetches (pattern of `fetches/project.ts`, every function takes `organization: Organization` first and calls `rpcClient.api.organizations[":organization"]` with `{ organization: ORGANIZATION_INFO[o].slug }`): `getOrganizationGroups(organization, options?)`, `getOrganizationGroup(organization, id, options?)` (null on 404), `createOrganizationGroup(organization, values: OrganizationGroupFormValues): Promise<number>`, `updateOrganizationGroup(organization, id, values)`, `deleteOrganizationGroup(organization, id)`. Errors go through `throwResponseError`, so `field: "name"` lands on the İsim input. Types `OrganizationGroupListItem`, `OrganizationGroup`.
  - Query keys: list `["organizations", organization]`, detail `["organizations", organization, id]`. Every group mutation invalidates `["organizations"]`, `["representatives"]` and `["parameters"]`.
  - `nav.ts`: a `NavParent` "Organizasyon" (icon `Network`) right after Yetkililer. Children come from `ORGANIZATIONS` with `href: organizationHref(o)` and icons Yönetimler `Briefcase`, Komiteler `UsersRound`, Disiplin Kurulu `Scale`, Denetim Kurulu `ClipboardCheck`.
  - Every page resolves `organizationFromSlug((await params).organization)` and calls `notFound()` on null. The `[id]` pages also reject non-positive or unsafe ids (pattern of `projects/[id]/page.tsx`). Server pages prefetch, client components use `useQuery` with the same key.
  - List (`OrganizationGroups({ organization, savedColumnVisibility })`): column-toggle table id `organization-${organization}`. Columns: **İsim** (link to the group, `enableHiding: false`, `compareTr` sort, default sort ascending) and **Kişi Sayısı** (numeric sort). A search input filters with `foldTr` on İsim and is mirrored as `?q=` with `history.replaceState` + `rememberListSearch(organizationHref(o), search)`. The count text reads `"{n} {noun}"`, and the add link `"{singular} Ekle"` goes to `organizationHref(o, "new")`. Empty state: `"Henüz kayıt eklenmemiş."`.
  - Form (`GroupForm({ organization, group? })` in `organization/_components/group-form.tsx`, the layout of `representative-form.tsx` + `MemberLinks`): one card titled `"Yeni {singular}"` or `"{singular} Düzenle"` with the İsim input. Then a "Kişiler" card with rows of [Yetkili `SearchCombobox`, Görev `SearchCombobox`, remove button `aria-label="Kişiyi kaldır"`], an empty text `"Henüz kişi eklenmemiş."`, and a `"Kişi ekle"` button. Yetkili items: Aktif yetkililer, plus yetkililer in `group.people` with `representativeActive: false`, labelled `"<name> (Pasif)"`, sorted with `compareTr`. There is no "already picked" filter. Görev items: `association_role` parameters with `noItemsText="Ayarlar'da dernek görevi yok."`. Above the cards, when the parameters list has loaded with no `association_role` entry, show a notice linking to `/settings`, worded like `missing-prerequisites-notice.tsx`: "Kişi eklemek için önce Ayarlar → Parametreler'de dernek görevi ekleyin." Save → detail page. İptal and back link → the detail page (edit) or `listHref(organizationHref(o))` (new).
  - Details (`GroupDetails({ organization, id })`): back link `backLabel` → `listHref(organizationHref(o))`. A header card with the name, Düzenle (→ `…/edit`) and `DeleteGroupButton`. A "Kişiler ({n})" card with a table of Yetkili (link to `/representatives/{id}`, `PassiveTag` when not active) and Görev, or `"Henüz kişi eklenmemiş."`.
  - `DeleteGroupButton`: an AlertDialog titled `“{name}” silinsin mi?` with the text `"{singular} ve kişi listesi kalıcı olarak silinir. Yetkililer silinmez. Bu işlem geri alınamaz."`. On success → `router.push(listHref(organizationHref(o)))`.

- [ ] **Step 1:** Write the fetches and `nav.ts`, then run `pnpm exec next typegen`.
- [ ] **Step 2:** Write the list, new, details and edit pages and their client components.
- [ ] **Step 3:** Add to `src/lib/nav.test.ts`: "finds Organizasyon pages under their parent". `findActiveNavItem("/organization/committees/12/edit")?.title` is `"Komiteler"`, and `isNavParentActive` is true for the Organizasyon parent on that path. Then `pnpm exec tsc --noEmit && pnpm lint && pnpm test --run nav` → PASS.
- [ ] **Step 4: Click through in dev** (dev session per the project memory): in Komiteler, create "Eğitim Komitesi" with 3 people including one yetkili twice. Check the list count is 3 and the details order matches. Edit and swap a görev. Try a duplicate name differing in case (the error shows under İsim). Delete. The sidebar group opens and highlights on all four pages, and the header shows the page title. Remove the test records afterwards.
- [ ] **Step 5:** Commit `feat: add the Organizasyon pages`.

### Task 5: Yetkili page section, invalidations, wording, docs

**Files:**
- Modify: `src/app/(panel)/representatives/[id]/representative-details.tsx`, `delete-representative-button.tsx`, `toggle-active-button.tsx`, `src/app/(panel)/representatives/_components/representative-form.tsx`, `src/app/(panel)/settings/parameter-dialog.tsx`, `src/app/(panel)/settings/delete-parameter-button.tsx`, `CLAUDE.md`

**Interfaces:**
- Consumes: `organizations` on the yetkili details (Task 3), `parameterUsageNouns` (Task 3), the config (Task 1).

- [ ] **Step 1:** Add an "Organizasyonlar ({n})" section on the yetkili details page, as a third card below the existing two. Each row shows `ORGANIZATION_INFO[o].title` (muted), the group name linking to `organizationHref(o, String(groupId))`, and the role on the right, like the Bağlı Üyeler list. When empty: `"Bu yetkili henüz bir organizasyonda yer almıyor."`.
- [ ] **Step 2:** Change the yetkili delete text to `"Yetkili kalıcı olarak silinir, üyelerle bağlantısı kaldırılır ve organizasyonlardan çıkarılır. Üyeler silinmez. Bu işlem geri alınamaz."`. The yetkili form, the toggle-active button and the delete button also invalidate `["organizations"]`. The parameter dialog (create and rename) also invalidates `["organizations"]`, since group pages show görev names.
- [ ] **Step 3:** `delete-parameter-button.tsx` uses `parameterUsageNouns(kind)` for its "kullanılıyor … değiştirin" text.
- [ ] **Step 4:** Update `CLAUDE.md`. Replace the Dernek Görevleri note's "nothing uses it yet" with "used as Görev on the Organizasyon pages". Add a Domain note on Organizasyon: the four pages, separate tables by design (the user expects some may diverge), the shared code via `src/lib/organizations.ts` and the `[organization]` route, groups of yetkili + görev rows with duplicates allowed, no terms/history, the Pasif rule, and cascade/restrict.
- [ ] **Step 5:** `pnpm exec tsc --noEmit && pnpm lint && pnpm test --run` → all PASS.
- [ ] **Step 6: Click through in dev:** a yetkili in two groups shows both on their page with working links. Make them Pasif; the group page shows the Pasif tag and the edit form keeps them. Rename the görev in Ayarlar, and the group page shows the new name without a reload. Trying to delete that görev shows the organization wording. Delete the test yetkili, and the group no longer lists them. Clean up.
- [ ] **Step 7:** Commit `feat: show Organizasyonlar on the yetkili page`.
