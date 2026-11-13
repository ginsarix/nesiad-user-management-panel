# Proje Taahhütleri — design

## Intent

Staff record who pledged what to a proje: per yetkili, an Adet and a unit
Tutar, with Toplam (Adet × Tutar) per row and a Genel Toplam over all rows.
It is a record only: no comparison with tahsilatlar, no "remaining" amount,
no notifications.

## Goals

- A "Taahhütler" section with rows of Yetkili, Adet, Tutar, Toplam, and a
  Genel Toplam row under them.
- Editable on the proje create form, the edit form, and in place on the proje
  details page. The totals update while typing; nothing is saved until Kaydet.

## Non-goals

- No link to tahsilatlar (no paid/remaining view).
- No taahhüt column on the Projeler list, no taahhütler on yetkili pages, no
  Excel export. Those can come later if staff ask.

## Approaches

- **A (chosen): one shared editor, two save paths.** The create and edit
  forms send the rows with the proje (`POST`/`PATCH /api/projects`, one
  transaction). The details page saves only the rows through
  `PUT /api/projects/:id/pledges`.
- B: the details page sends the whole proje back through `PATCH`. Rejected:
  if someone renamed the proje while the page was open, this save would
  quietly undo the rename, and it saves only one endpoint.

## Design

**Data.** New table `project_pledge`: `id`, `project_id` (FK, cascade: the
rows go with the proje), `representative_id` (FK, restrict), `quantity`
(integer, check ≥ 1), `amount` (`numeric(12,2)` unit price, check > 0),
`position` (row order), timestamps. Rows are replaced as a whole on every
save, like Organizasyon rows. The migration only adds a table; no existing
data is touched.

**Rules.**
- Adet is a whole number ≥ 1. Tutar is > 0 and typed in Turkish format
  (`src/lib/money.ts`).
- New rows need an Aktif yetkili. A Pasif yetkili already among the proje's
  rows is kept. The same yetkili may appear more than once.
- Totals (row Toplam, Genel Toplam) are never stored or returned by the
  API: one pure helper computes them on the fly in integer kuruş (`BigInt`,
  no floats), for the editor and for any read-only view. The "sum in
  Postgres" rule is for server-side aggregates over many rows (lists,
  exports); nothing here is aggregated on the server.
- A yetkili with taahhütler can't be deleted (409 with the count; the page
  suggests Pasif), checked alongside the existing tahsilat check.
- An empty list is fine (a proje needs no taahhüt).

**API.**
- `GET /api/projects/:id` also returns `pledges` (with yetkili name, photo
  and active flag); no totals.
- `POST`/`PATCH /api/projects` accept `pledges: [{ representativeId,
  quantity, amount }]`. On `PATCH` it is optional, so a request without it
  leaves the rows alone.
- `PUT /api/projects/:id/pledges` replaces the rows only.

**Audit.** Proje create/delete `details` include a "Taahhütler" line. Any
save that changes the rows records a "Taahhütler" change with the before and
after text (e.g. "Ali Veli: 2 × 1.000,00 TL"), on the proje's entity. No
change, no entry.

**UI.** One `PledgesEditor` component (react-hook-form `useFieldArray`,
`SearchCombobox` for Yetkili, `AmountInput` for Tutar), laid out as a table:
Yetkili | Adet | Tutar | Toplam | remove, then a Genel Toplam row and
"Taahhüt ekle".
- Create/edit forms: a section under the proje fields.
- Details page: the section shows the editor. While it has unsaved changes,
  a save bar (Kaydet / Vazgeç) appears and `useNavigationGuard` stops
  leaving, like Ayarlar → Bildirimler.

**Cache.** Saves invalidate `["projects"]` and `["representatives"]` (the
yetkili delete check uses the count).

## Left to the builder

The exact layout on narrow screens, the component and file names, and the
test split (API route tests for the rules and audit, a pure test for the
kuruş math).
