# Tahakkuk — design

## Intent

One Tahakkuk list for the whole association: rows of Yetkili, Adet, Tutar,
with each row's Toplam and a Genel Toplam, edited in place on its own page.
It is the proje Taahhütler editor without a proje. Staff rejected separate
tahakkuk records with create/edit pages as too much back-and-forth.

## Goals

- "Tahakkuk" as the last item under Finans (`/accruals`).
- The page is the in-place editor: totals follow what is typed; Kaydet / İptal
  in the save bar; leaving with unsaved changes is stopped.
- Two people editing at once can't silently overwrite each other.

## Non-goals

- No link to tahsilatlar, the dashboard, or any "expected dues" logic.
- No dates, names, filters, Excel export, or several lists.

## Approaches

- **Chosen: its own `accrual` table and `/api/accruals` route**, reusing the
  Taahhütler pieces (editor, totals, validation, yetkili rule).
- Rejected: storing the rows in `project_pledge` with no proje. It mixes two
  concepts in one table; the codebase keeps lookalike features in separate
  tables on purpose (Organizasyon).

## Design

**Data.** `accrual`: `representative_id` (FK restrict), `quantity` (≥ 1),
`amount` (`numeric(12,2)`, > 0), `position`, timestamps. Additive migration.

**API.** `GET /api/accruals` → `{ rows, version }` (rows with yetkili name and
active flag, in order). `PUT /api/accruals` with `{ rows, version }` replaces
all rows. `version` is a hash of the saved rows' contents; the PUT takes a
table lock, recomputes it and refuses with 409 when it differs (someone saved
in between), so the later save can't overwrite. The response carries the new
version.

**Rules (same as Taahhütler).** Adet 1…1.000.000; Tutar > 0 typed the Turkish
way; new rows need an Aktif yetkili, a Pasif one already in the list stays;
the same yetkili may appear more than once; totals computed on the fly in
kuruş, never stored. A yetkili with tahakkuk rows can't be deleted (409, the
message names tahsilat, taahhüt and tahakkuk counts).

**Audit.** Entity type `accrual` ("Tahakkuk" in the Denetim Kayıtları filter),
action `update` ("Tahakkuk güncellendi"), one "Tahakkuk" change with the rows
before and after; nothing when unchanged.

**Reuse.** The Taahhütler editor, totals, row schemas and the server-side
yetkili check become generic (rows of yetkili × Adet × Tutar) and are used by
both features; the editor takes the field name and its add-button label.

**UI.** The page shows the editor in a card titled "Tahakkuk", "Tahakkuk ekle"
to add a row. On a 409 the bar says the list was changed by someone else and
to reload; the edits stay on screen until they do.

**Tests.** There is only one list, and tests run on the development database:
the accrual tests save the existing rows first and put them back afterwards,
and delete the audit entries they caused.

## Left to the builder

Generic names, file layout, the hash function, the lock mode.
