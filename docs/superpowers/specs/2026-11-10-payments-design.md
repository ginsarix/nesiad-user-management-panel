# Ödemeler and Cariler: design

Status: draft for review, 2026-11-10.

Decisions marked **(staff)** came from the user. Decisions marked **(my call)** are the designer's defaults and can be overruled. Everything else is left to the builder.

## Why

NESİAD staff record the payments the association makes (to a florist, a restaurant…) in a spreadsheet. This moves them into the panel: a list of the people and businesses the association deals with (**Cariler**, "counterparties" in code) and a record of each payment (**Ödemeler**). Who reads it later isn't settled; most likely accounting, wanting totals over a period, per cari or per tür **(staff: "probably accounting")**. The Ödeme Türü and Ödeme Tipi lists on the Parametreler tab were added for this.

## What gets built

1. A `counterparty` table and the Cariler pages: list, detail, new, edit, delete.
2. A `payment` table and the Ödemeler pages: list with filters and a total, new, edit, delete.
3. A Turkish province and district list, vendored into the repo, for the cari's Şehir and İlçe.
4. Delete rules: a cari or an Ödeme Türü/Tipi that a payment uses can't be deleted.
5. Excel export of the Ödemeler list **(staff)** and the Cariler list **(my call)**.
6. Audit entries for every change.

Ödemeler starts empty: the payments already in the spreadsheet are not imported **(staff)**.

## Goals

- Staff can record a payment in well under a minute: pick the cari, type the amount, pick tür and tip.
- Anyone can answer "how much did we pay X / for Y between these dates" from the Ödemeler list without leaving the panel.
- Payment history is never lost or orphaned by deleting something it points at.

## Non-goals

- Tahsilatlar (money coming in). The Tahsilat Türü/Tipi lists exist but nothing uses them yet.
- Currencies other than TL.
- Attachments (receipts, invoices).
- Importing the existing spreadsheet **(staff)**.
- Adding a new cari from inside the payment form. It goes to `docs/could-have.md` **(my call)**.
- Neighbourhoods (mahalle) and postal codes.
- Read-only accounts. The panel has no roles; staff pass totals on to accounting, or accounting gets a normal panel account **(my call)**.

## Anti-goals

- A deleted cari or parameter taking payments with it, or leaving them pointing at nothing.
- Money stored as a float, or totals that drift by a kuruş.
- Two cariler with the same name in the combobox, so a payment lands on the wrong one.

## Data

### Cari (`counterparty`)

Named `counterparty`, not `payee`, so Tahsilatlar can reuse the same list later without renaming a production table **(my call)**. Only payments use it for now.

| Field | Column | Required | Notes |
|---|---|---|---|
| Ünvan | `title` | yes **(staff)** | Unique ignoring Turkish case, via a `title_key` column like `sector.name_key` **(my call)** |
| Şehir | `city` | no **(staff)** | A province name from the vendored list |
| İlçe | `district` | no **(staff)** | A district of that province; only allowed when Şehir is set |
| Adres | `address` | no **(staff)** | Free text |
| Telefon | `phone` | no **(staff)** | Same handling as a member's phone |
| E-posta | `email` | no **(staff)** | Validated as an email address |

Plus `created_at` / `updated_at`. Şehir and İlçe are stored as names, not codes **(my call)**: they read the same in the audit log and the database, and a later update of the list doesn't change what's stored. The server checks that the province is in the list and the district belongs to it.

### Ödeme (`payment`)

| Field | Column | Required | Notes |
|---|---|---|---|
| Ödeme Yapılan Cari | `counterparty_id` | yes **(staff)** | Foreign key, `on delete restrict` |
| Tutar | `amount` | yes **(staff)** | `numeric(12,2)`, above zero |
| Tarih | `date` | yes **(staff)** | Postgres `date`; the form defaults it to today (Istanbul) |
| Ödeme Türü | `category_id` | yes **(staff)** | Foreign key to `parameter`, `on delete restrict`; must be a `payment_category` |
| Ödeme Tipi | `method_id` | yes **(staff)** | Foreign key to `parameter`, `on delete restrict`; must be a `payment_method` |
| Not | `note` | no **(staff)** | Free text |

Plus `created_at` / `updated_at`. The API checks that `category_id` and `method_id` point at entries of the right list. Whether the database also enforces this (e.g. a composite foreign key on `(kind, id)`) is the builder's call.

Amounts travel between server and browser as strings (`"1250.50"`), never as JS numbers, and totals are summed in Postgres.

### Province and district list

`districtsByCityCode.json` and `cityNamesByCode.json` from [muratgozel/turkey-neighbourhoods](https://github.com/muratgozel/turkey-neighbourhoods) (`src/data/`, MIT, last updated 2024-03) are copied into the repo with their license notice, not installed as a package **(staff)**. They hold 81 provinces and 973 districts (about 21 KB). Districts like "Merkez" come as the source has them.

## Pages

New sidebar items **Ödemeler** and **Cariler**, in that order, after SMS and before Otomatik Tahsilatlar **(my call)**. Both follow the existing list pattern: server prefetch, TanStack Table v9, the Sütunlar toggle, Turkish-aware sorting and search, filters mirrored in the URL, "… dön" links back to the filtered list.

### Cariler

- **List** `/counterparties`: Ünvan, Şehir, İlçe, Telefon, E-posta, and the total paid to each cari ("Toplam Ödenen") **(my call)**. Search on Ünvan. "Cari Ekle" button.
- **Detail** `/counterparties/:id`: the cari's information, then its payments (Tarih, Tutar, Tür, Tip, Not) with their count and total. A link to the Ödemeler list filtered to this cari.
- **New / edit** `/counterparties/new`, `/counterparties/:id/edit`: page forms like Yetkililer **(my call)**. Şehir is a searchable combobox of provinces. İlçe is a searchable combobox of the chosen province's districts, disabled until a province is chosen and cleared when the province changes.
- **Delete** from the detail page. A cari with payments can't be deleted: the dialog says how many payments it has and offers no delete button **(my call)**.

### Ödemeler

- **List** `/payments`: Tarih, Cari, Tutar, Ödeme Türü, Ödeme Tipi, Not; newest first **(my call)**. Filters for date range, cari, tür and tip. Above the table, the count and total of the filtered rows, e.g. "12 ödeme · Toplam ₺18.450,00" **(my call)**. A row goes to that payment's edit page; there is no payment detail page.
- **New / edit** `/payments/new`, `/payments/:id/edit`: page forms **(my call)**. Cari, Ödeme Türü and Ödeme Tipi are searchable comboboxes. Tutar is typed the Turkish way ("1.250,50"). Tarih is a `gg.aa.yyyy` date input defaulting to today. When the tür or tip lists are empty, the form says so and links to Ayarlar → Parametreler.
- **Delete** from the edit page, after a confirmation. Payments are hard-deleted; the audit log keeps the record.

Amounts are shown as `₺1.250,50` everywhere.

### Excel export

The people reading this want it in Excel **(staff: "they want exporting to excel")**.

- An "Excel'e aktar" button on the Ödemeler list downloads the **filtered** rows as `.xlsx`: exactly the rows the list shows, newest first **(my call)**. Sorting a column on screen doesn't change the file's order. Columns Tarih, Cari, Tutar, Ödeme Türü, Ödeme Tipi, Not, then a total row.
- The same button on the Cariler list downloads its search result, sorted by Ünvan: Ünvan, Şehir, İlçe, Adres, Telefon, E-posta, Toplam Ödenen **(my call)**.
- Cells are real Excel values, not text, so accounting can sum and filter them: Tarih is a date cell shown as `gg.aa.yyyy`, Tutar a number shown with two decimals and ₺. Headers are bold and the header row is frozen.
- The file is named after the list and today's date, e.g. `odemeler-2026-11-10.xlsx`.
- The file is built on the server from the same query and filters as the list, behind the session check, so the export can't differ from what's on screen.
- Exports aren't written to the audit log **(my call)**: they change nothing, and the data isn't personal.
- Which library builds the file is the builder's call. It must be maintained, write real date and number cells, and run in Node (not in the browser bundle). Check its current API before using it.

### Parameters

On the Parametreler tab, an Ödeme Türü or Ödeme Tipi used by a payment can't be deleted; the dialog says how many payments use it **(my call)**. Renaming is still allowed and shows on every payment. The Tahsilat lists keep their plain delete.

## Audit log

New entity types **Cariler** (`counterparty`) and **Ödemeler** (`payment`), with create/update/delete labels in `audit-labels.ts`. Same rules as everything else: written in the same transaction, creates and deletes store the whole record, updates store field-level changes. A payment's entity label is something like "Çiçekçi Ayşe · ₺1.250,00 · 10.11.2026". Cari and payment data is not personal applicant data, so nothing is redacted.

## Migration

New tables only, plus foreign keys from `payment` to `counterparty` and `parameter`. Nothing touches existing production rows.

## Tests

API tests for both routes in the existing style: required fields, Turkish-case uniqueness of Ünvan, province/district validation, the wrong-list parameter check, the delete rules (cari, Ödeme Türü, Ödeme Tipi), filter and total correctness including kuruş, the export (it opens, applies the filters, holds real date and number cells, and sums correctly), and the audit entries.

## Left to the builder

- Route and file layout, query keys and invalidation (payment changes invalidate cariler, cari changes invalidate payments).
- Exactly how the amount input formats while typing.
- Tarih can't be in the future, like every other date field in the panel **(my call, settled during planning)**.
- Whether the payments list paginates or loads everything (a few hundred rows a year).
- Which columns are hidden by default.
