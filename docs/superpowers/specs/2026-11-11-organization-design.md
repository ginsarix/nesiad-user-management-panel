# Organizasyon: design

Status: draft for review, 2026-11-11.

Decisions marked **(user)** came from the user. Decisions marked **(my call)** are the designer's defaults and can be overruled. Everything else is left to the builder.

## Why

The association's boards and committees (who sits on the yönetim, which committees exist and who is in them, who is on the disiplin and denetim kurulları) are kept outside the panel today. This adds four pages that record them, each as named groups of yetkililer with a görev, and shows on each yetkili's page which groups they belong to.

## What gets built

1. A new **Organizasyon** sidebar item that opens to four pages **(user)**: **Yönetimler**, **Komiteler**, **Disiplin Kurulu**, **Denetim Kurulu**.
2. On each page, a list of groups and pages to view, create, edit and delete a group.
3. A group has an **İsim** and a list of people. Each person is a **Yetkili** (picked from yetkililer) with a **Görev** (picked from the Dernek Görevleri list on Ayarlar → Parametreler) **(user)**.
4. An **Organizasyonlar** section on the yetkili details page listing every group the yetkili is in, across all four pages **(user)**.
5. Audit entries for every change, delete rules, and the parameter usage count.

## Goals

- Staff can enter a whole board (5–10 people) in one form and one save.
- From a yetkili's page, anyone can see every board and committee they're on and in what görev.
- Each of the four organizations can later get its own fields or rules without touching the others.

## Non-goals

- Terms, dates, or a current/past distinction. A group is just a named group; staff may edit a board in place when it changes or add a new group and keep the old one. The panel takes no position on which **(user)**.
- Excel export, dashboard widgets, or SMS/email to a group **(my call; easy to add later)**.
- Anything about the görev on a yetkili ↔ üye link (`members_representatives.role`). That's a different thing and stays as it is **(user)**.

## Anti-goals

- **One shared table for all four.** The user isn't sure the four will stay alike, so each gets its own tables **(user)**. Sharing *code* is fine and expected (see Build notes); sharing *storage* is not.
- A yetkili's deletion leaving a group pointing at nothing, or a Dernek Görevi deletion leaving a person without a görev.

## Data

For each of the four organizations, two tables. Names are the builder's choice; a suggestion that keeps "Denetim Kurulu" clear of the existing audit log ("Denetim Kayıtları", `audit_log`):

| Page | Group table | People table |
|---|---|---|
| Yönetimler | `management_board` | `management_board_member` |
| Komiteler | `committee` | `committee_member` |
| Disiplin Kurulu | `disciplinary_board` | `disciplinary_board_member` |
| Denetim Kurulu | `supervisory_board` | `supervisory_board_member` |

**Group:** `id`, `name` (İsim, required), `name_key` (Turkish-lowercase name), `created_at`, `updated_at`. İsim is unique within its page, ignoring Turkish case **(user)**, like sectors' `name_key`.

**Person (row in a group):**

| Column | Notes |
|---|---|
| `id` | Own identity key: the same yetkili may appear in a group more than once **(user)**, so (group, yetkili) is not unique |
| group id | FK to the group, `on delete cascade` |
| `representative_id` | FK to `authorized_representative`, `on delete cascade`: deleting a yetkili removes them from groups **(user)** |
| `role_id` | Görev, required **(user)**. FK to `parameter`, `on delete restrict`; the API checks it's an `association_role` entry |
| `position` | Keeps the order staff entered the rows in, so a board lists its Başkan first if that's how it was typed **(my call)** |

A group may have no people (e.g. a committee created before its members are chosen) **(my call)**.

The migration only adds tables, so no production data is touched. It depends on the Dernek Görevleri parameter kind (`association_role`, migration `20261111131459_association_role`), which is done but not yet committed.

## Pages

URLs under `/organization/…` (e.g. `/organization/committees`, `/organization/committees/new`, `/organization/committees/[id]`, `/organization/committees/[id]/edit`) **(my call)**. The sidebar parent "Organizasyon" works like "Finans". Page titles are the four names above; button labels use the singular ("Komite Ekle", "Yönetim Ekle", "Disiplin Kurulu Ekle", "Denetim Kurulu Ekle") **(my call)**.

**Sidebar.** "Organizasyon" sits right after Yetkililer **(my call)**.

**List page.** A table with **İsim** (links to the group) and **Kişi Sayısı** (counts rows, so a yetkili listed twice counts twice) **(my call)**, a search box on İsim (Turkish-aware), the "Sütunlar" column toggle, and the add button. Follows the existing list pages: server prefetch + `HydrationBoundary`, filters mirrored into the URL, `rememberListSearch` / `listHref` for the "… dön" link.

**Group form (new and edit), approved layout "A" (user):** the İsim field, then one row per person with a Yetkili combobox and a Görev combobox, a delete button per row, and "+ Kişi ekle" underneath. One Kaydet saves the İsim and all rows together in one transaction. This works like the Üyeler section of the yetkili form (`representative-form.tsx`, `useFieldArray`). Every row needs both fields. The yetkili picker offers **Aktif** yetkililer; a Pasif yetkili already in the group stays in the row and is marked Pasif **(user)**. The API enforces the same rule: a Pasif yetkili is accepted only if that yetkili was already in the group before the save (matched by yetkili, not by row id, since a yetkili can appear more than once) **(my call)**. If the Dernek Görevleri list is empty, the form says to add görevler in Ayarlar first (like Ödemeler' missing-parameter notice) **(my call)**. The form uses the unsaved-changes guard like other forms do. Create lands on the group details page.

**Group details page:** the İsim, a table of people (Yetkili linking to the yetkili's page, Pasif tag where it applies, Görev) in their saved order, and Düzenle / Sil buttons. Sil asks for confirmation, then returns to the list.

**Yetkili details page:** a new **Organizasyonlar** section with one row per membership: the page it's on (e.g. "Komiteler"), the group name linking to the group, and the görev. A yetkili who is in one group twice gets two rows **(user)**. Ordered by page (Yönetimler, Komiteler, Disiplin Kurulu, Denetim Kurulu), then by group name **(my call)**. When the yetkili is in no group, the section stays and says so **(my call)**. The yetkili's delete confirmation adds that they will be removed from their groups **(user)**.

## Rules

- Deleting a group deletes its people rows; nothing else.
- Deleting a yetkili removes their rows from every group (cascade). Their delete audit entry lists the groups they were removed from, read before the delete (like it already does for member links) **(my call)**.
- A Dernek Görevi used by any group row can't be deleted (409 with the count); renaming is fine **(user)**. The parameters API's `usageCount` and the delete refusal must count these rows. Today both the API's `inUseError` and `delete-parameter-button.tsx` assume a non-`payment_` kind means tahsilatlar, so they need wording for `association_role` (e.g. "organizasyon kaydında").
- Invalidate the yetkili queries (and `["parameters"]`, for the usage count) when groups change, since the yetkili page and Parametreler tab show this data.

## Audit log

Every create, update and delete of a group writes `recordAudit` in the same transaction, with `actorOf(c)` **(user)**:

- Each organization gets its own `entityType` so the Denetim Kayıtları filter can tell them apart, with labels in `audit-labels.ts`.
- Create and delete store the whole group in `details`: İsim and the people as display strings (e.g. "Ahmet Yılmaz: Başkan").
- Update stores `changes` only for what changed: İsim via `change`, and the people list as one before/after change when the list differs (exact format left to the builder). No entry when nothing changed.

## Build notes

- The four pages are identical for now. Write the route, fetches and components once, parameterized by organization (tables, URL, labels, audit entity type), with each page a thin wrapper. When one organization later needs special handling, that one diverges and the others don't change. How to parameterize is up to the builder; Drizzle table objects with the same column names make a shared helper straightforward.
- Follow the project conventions in `CLAUDE.md`: Hono route mounted in `app.ts`, typed RPC fetches in `src/lib/fetches/`, zod schemas in `src/lib/zod-schemas/`, react-hook-form, TanStack Table v9, `SearchCombobox`, `orDash`/`PassiveTag`.
- Tests: route tests for create/update/delete, the uniqueness rule, Aktif-yetkili and görev-kind checks, the duplicate-yetkili allowance, cascade on yetkili delete, the parameter delete refusal, and the audit entries. Test records named `__test__…`.
- After adding pages, run `pnpm exec next typegen`.
- Commit the Dernek Görevleri parameter work on its own first. This change then updates `CLAUDE.md`: its note says nothing uses Dernek Görevleri yet, and it needs a domain note on the Organizasyon pages.
