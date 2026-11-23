# Kasa - Banka — design

## Intent

Staff want to see how much money sits in each cash box and bank account,
and have every ödeme and tahsilat say which one it went out of or came into.
"Kasa - Banka" is one list (`cash_account` in code) covering both kinds. It
replaces Ödeme Tipi and Tahsilat Tipi: the account a record uses already says
how the money moved.

## Goals

- "Kasa - Banka" as the **first** item under Finans (`/cash-accounts`), with
  the same list / new / details / edit pages as Cariler and Projeler.
- Fields: İsim (required), Başlangıç Bakiyesi (optional, empty = 0), Aktif/Pasif
  (default Aktif).
- Every ödeme and tahsilat has a required Kasa - Banka; Ödeme Tipi and
  Tahsilat Tipi are removed everywhere.
- Bakiye = Başlangıç Bakiyesi + tahsilatlar − ödemeler of that account, always
  correct after creates, edits (amount or account changed) and deletes.

## Non-goals

- Transfers between accounts (virman), balance as of a date, statements by
  period, Excel export of the Kasa - Banka list, anything on Genel Bakış.
- Kasa vs. Banka as a stored distinction; the name says which it is.

## Anti-goals

- A balance that can drift from the records.
- Internal account names reaching members in tahsilat notices by default.

## Approaches

- **Chosen: store `opening_balance`, compute Bakiye when read** (sum in
  Postgres, like a cari's Toplam Ödenen). Edits, deletes and moves between
  accounts are right with no extra code; a mistyped starting balance is fixed
  by editing an ordinary field, audited with a clear meaning.
- Rejected: a stored `balance` that each create/edit/delete adjusts. It works,
  but every write path must remember to update it, and a typo in the starting
  balance can only be fixed by hand-editing `balance`, which hides what the
  number means.
- Rejected: a stored `balance` that only creates change. Wrong after the first
  edited amount.

## Design

**Data.** New table `cash_account`: `name`, `name_key` (Turkish lowercase,
unique, like `counterparty.title_key`), `opening_balance` `numeric(12,2)` not
null default 0, `active` default true, timestamps. `payment` and `collection`
each get `cash_account_id` (not null, FK restrict, indexed) and lose
`method_id`.

**Migration (destructive, user-approved 2026-11-23).** Drops
`payment.method_id` and `collection.method_id`; deletes `parameter` rows of
kind `payment_method` / `collection_method` and narrows the
`parameter_kind_valid` check; adds the not-null `cash_account_id` columns with
no default. Production has no payment or collection rows and will have none
before this ships; if that ever stops being true the `ADD COLUMN … NOT NULL`
fails and the migration stops, so no rows can be lost silently. The same
migration rewrites the saved `collection_notice_settings` row (see Notices).
Deleted parameter rows aren't audited (it's a migration); old audit entries
keep their "Ödeme Tipi" / "Tahsilat Tipi" strings.

**Bakiye.** One SQL helper gives an account's balance:
`opening_balance + coalesce(sum(collection.amount), 0) − coalesce(sum(payment.amount), 0)`,
returned as a string like every amount. It may be negative (shown as is).

**API** `/api/cash-accounts` (Hono, typed RPC, `src/lib/fetches/cash-account.ts`):
list (with `balance`, `usageCount`), get by id (with balance), create, patch,
delete. Delete is refused with 409 and the counts when the account has ödemeler
or tahsilatlar ("Pasif yapın" hint). Name unique ignoring Turkish case (409).
Başlangıç Bakiyesi typed the Turkish way (`src/lib/money.ts`), any sign.
Audit entity type `cash_account` ("Kasa - Banka"): create/delete store the
record, update stores field diffs (İsim, Başlangıç Bakiyesi, Durum).

**Ödeme / Tahsilat rules.** A new record needs an Aktif account; an edit keeps
the one it has even if it has become Pasif (same as yetkili/proje). The API
checks the id exists. Mutations invalidate `["cash-accounts"]` too, and account
changes invalidate payment and collection queries (names shown there).

**Forms.** Below the main section of both forms, a bordered "Kasa - Banka"
section (above Proje on the tahsilat form): a `SearchCombobox` of Aktif
accounts (plus the current one when editing), and under it the selected
account's current saved Bakiye and a "Hesaba git" link to its details page.
The picker is the view on edit pages. The account itself isn't edited here.
"Missing prerequisites" notices ask for an Aktif Kasa - Banka instead of a
Tip.

**Lists and exports.** The Tip column and filter become Kasa - Banka
(`?cashAccount=<id>`) on Ödemeler and Tahsilatlar, and the Excel exports'
Tip column becomes "Kasa - Banka". Same swap in the cari details payments
table and the shared tahsilatlar section (yetkili/proje pages).

**Kasa - Banka pages.** List: İsim, Bakiye, Durum; search, status filter
defaulting to Aktif (like Projeler), Sütunlar toggle, pinned Toplam row of
Bakiye. Details: İsim, Başlangıç Bakiyesi, Bakiye, Durum, Aktif/Pasif toggle,
delete button, then the account's Ödemeler and Tahsilatlar tables, each with
a Toplam row. New/edit: İsim, Başlangıç Bakiyesi, Aktif. Icon: `Vault`.

**Notices.** `{tip}` is removed; `{kasa}` (account name) is added to the
tahsilat placeholders. Defaults: yetkili texts lose `{tip}` ("…{tur} ödemeniz
alınmıştır."), staff texts use `{kasa}` ("({tur}, {kasa})",
"Kasa - Banka: {kasa}"). The migration does the same to the saved row:
removes `{tip}` (and the " ({tip})" wrapper) from the three
`representative_*` columns, and replaces "Tahsilat Tipi: {tip}" then `{tip}`
with "Kasa - Banka: {kasa}" / `{kasa}` in the three `staff_*` columns.

**Parametreler.** Tahsilat Tipi and Ödeme Tipi disappear from the tab and from
`PARAMETER_KINDS`.

**Tests.** New `cash-accounts.test.ts`: balance after create, amount edit,
moving a record to another account, delete; 409 on delete when used; name
uniqueness; Pasif account refused for new records but kept on edit. Existing
payment/collection/parameter/dashboard/etc. tests switch from method params
to a test account. Notice tests cover `{kasa}` and the absence of `{tip}`.

**Docs.** CLAUDE.md domain notes: Kasa - Banka entry; Ödemeler/Tahsilatlar
lines lose Tipi.

## Builder's calls (mine, not discussed)

- Name uniqueness, negative balances allowed, starting balance may be negative.
- The Bakiye shown in the form is the saved balance (on an edit page it
  already includes the record being edited); no live preview.
- Kasa - Banka list has a Toplam row (it has an amount column, house rule).
