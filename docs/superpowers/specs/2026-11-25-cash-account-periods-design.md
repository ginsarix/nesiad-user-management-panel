# Kasa - Banka periods (Dönemler)

## Intent

Staff keep their books in periods: in practice calendar years (01.01 to
01.01), but a period can start on any date they choose. They want each Kasa -
Banka split into such periods, each with its own opening balance and Bakiye,
and they want to carry a period's balance into the next one themselves
("Devir") when they consider the earlier period finished, not automatically.

Devir is manual on purpose. An automatic copy at the moment a period is
created would miss everything entered for the previous period afterwards
(e.g. the 2027 period created on 15.12.2026 would never see late-December
records). With a manual devir, staff enter the past period's data and then
carry it over, and can repeat it whenever the past period changes.

## Goals

- Periods per Kasa - Banka, created by staff with a Başlangıç Tarihi and a
  Başlangıç Bakiyesi. At least one per account. The account-wide Başlangıç
  Bakiyesi goes away.
- A record (ödeme, tahsilat) belongs to the period its date falls in. A period
  runs from its start date up to the day before the next period's start date;
  the last one is open-ended.
- Each period's Bakiye = its Başlangıç Bakiyesi + tahsilatlar − ödemeler dated
  inside it. Computed on read in Postgres, as today; edits, deletes and moves
  are always reflected within their period.
- Devir: pick a source and a destination period, press "Devir et": the
  destination's Başlangıç Bakiyesi becomes the source's current Bakiye.
  Repeatable at any time.
- The page notices when a devir has gone stale (the source's Bakiye changed
  since) and offers "Tekrar devir et".
- The details page shows one tab per period, titled by its start date.

## Non-goals

- Automatic devir of any kind, including on period creation. A new period
  opens with the balance staff type.
- Balances flowing forward through periods. A later period's Başlangıç
  Bakiyesi changes only by hand or by Devir. This is intended (user's call).
- Devir when creating an account with past periods: staff type each period's
  balance; the panel doesn't check that they chain.
- A Dönem column or filter on the Ödemeler / Tahsilatlar lists or exports.
- Virman (still in `docs/could-have.md`).

## Anti-goals

- Money silently disappearing from view. Records outside every period are
  allowed but must be shown as such.

## Approaches

- **A separate period table, records unchanged (picked).**
  `cash_account_period` rows hold the account, start date, opening balance and
  the last devir's source and amount. Ödemeler / tahsilatlar keep linking only
  to the account; their period is derived from their date when balances are
  computed.
- Storing a period id on each ödeme / tahsilat: ruled out. The date decides
  the period, and a stored link would disagree with it whenever a period is
  added, moved or deleted, or a record's date is edited.
- Periods with explicit end dates: ruled out. It allows gaps and overlaps
  that would need checking; "ends where the next starts" can't have either.

## Data

`cash_account_period`:

- `id` identity
- `cash_account_id` → `cash_account`, on delete cascade
- `start_date` date, not null; unique per account, enforced by the API under
  a lock on the account row rather than a DB constraint, so an edit that swaps
  two periods' dates can save (plan's call)
- `opening_balance` numeric(12,2), not null, may be negative (Başlangıç
  Bakiyesi)
- `carried_from_period_id` → `cash_account_period`, nullable, on delete set
  null: the source of the last Devir into this period
- `carried_amount` numeric(12,2), nullable: the amount that Devir carried
- `created_at`, `updated_at`

`cash_account.opening_balance` is dropped.

The devir link (`carried_from_period_id` + `carried_amount`) is cleared when:

- staff change this period's Başlangıç Bakiyesi by hand (the number no longer
  comes from the devir);
- a save leaves the source no longer earlier than this period (re-dated);
- the source period is deleted (FK set null; clear `carried_amount` too).

A period whose start date is later than today is allowed.

## Balances

- **Period Bakiye:** opening + sum of tahsilatlar − sum of ödemeler of the
  account with `start_date ≤ date < next start_date` (no upper bound for the
  last period). Summed in Postgres; amounts travel as strings.
- **Current Bakiye** (list's Bakiye column, Genel Bakış card, details header,
  sorting on the list): the Bakiye of the account's latest period with
  `start_date ≤ today`. If every period starts in the future, there is no
  current Bakiye: show "—" (sorts as lowest). (My call.)
- **Outside every period:** records dated before the account's first period.
  Allowed (user's call, for flexibility). They count in no Bakiye.
- `cashAccountBalance()` in `cash-account-queries.ts` is replaced by period
  aware queries; the exact SQL is the builder's call (correlated subqueries or
  a lateral join, keeping "no joins that multiply sums").

## Devir

- **Rules:** the source must start earlier than the destination; they needn't
  be adjacent. Allowed on a Pasif account. (My calls.)
- **Endpoint:** `POST /api/cash-accounts/:id/carry-over` with
  `{ fromPeriodId, toPeriodId }`. In one transaction it computes the source's
  Bakiye now and sets the destination's `opening_balance` and `carried_amount`
  to it, and `carried_from_period_id` to the source. Both periods must belong
  to the account (404 otherwise).
- **Audit:** `cash_account` / `carry_over` (label in `audit-labels.ts`),
  details: source start date, destination start date, old → new Başlangıç
  Bakiyesi. Written even when the amount didn't change (the action happened).
  (My call.)
- **Stale:** a period with a devir link is stale when the source's current
  Bakiye ≠ `carried_amount`. The details API returns, per period, the link,
  the carried amount and the source's current Bakiye, so the page can tell.

## API changes

- `POST /api/cash-accounts`: `{ name, active, periods: [{ startDate,
  openingBalance }] }`, at least one period, start dates distinct.
- `PATCH /api/cash-accounts/:id`: `periods` optional (the Aktif/Pasif toggle
  sends none and leaves periods alone, as `pledges` does on projects). When
  sent, it replaces the list: rows with `id` are updated, rows without are
  inserted, missing ids are deleted. An `id` not belonging to the account (or
  gone meanwhile) refuses the save with 409.
- `GET /api/cash-accounts` (list): current Bakiye per account, plus each
  account's periods with their Bakiye (only a handful), so the ödeme /
  tahsilat form can show the Bakiye of the typed date's period without
  another request.
- `GET /api/cash-accounts/:id`: periods (id, start date, end date for display,
  opening balance, tahsilat total, ödeme total, Bakiye, devir link + carried
  amount + source's current Bakiye), current period id, and the count and
  last date of records outside every period (tahsilatlar and ödemeler
  separately, for the links).
- Validation messages in Turkish, e.g. "En az bir dönem olmalı", "Aynı
  başlangıç tarihli iki dönem olamaz".

## UI

### Form (create / edit): Dönemler section

A row editor in the style of Taahhütler: rows of Başlangıç Tarihi (date input,
`gg.aa.yyyy`) + Başlangıç Bakiyesi (Turkish amount, may be negative, empty =
0), "Dönem ekle", remove per row, at least one row. Rows are kept sorted by
start date on display after save; while editing they stay where typed. A new
account starts with one row dated 01.01 of the current year (my call). Rows
keep their ids across edits.

### Details page

```
Merkez Kasa                        [Pasif yap] [Düzenle] [Sil]
Bakiye 51.100,00   (01.01.2026 dönemi)

01.01.2026 öncesine ait 3 kayıt hiçbir döneme girmiyor  → Tahsilatlar · Ödemeler

┌ Devir ──────────────────────────────────────────────────────┐
│ [01.01.2025 ▾]  →  [01.01.2026 ▾]   [Devir et]              │
│ Geçmiş yıla/döneme ait verilerinizi girdikten sonra dönemi   │
│ devir ediniz, Devir için herhangi bir tarih kıstası yoktur,  │
│ Önceki dönem bittikten sonra herhangi bir tarihte devir      │
│ yapılabilir.                                                 │
└──────────────────────────────────────────────────────────────┘

[ 01.01.2025 ] [ 01.01.2026 ]  [ 01.01.2027 ]
 01.01.2026 – 31.12.2026
 Başlangıç Bakiyesi 12.000,00 · Tahsilatlar 64.300,00 · Ödemeler 25.200,00 · Bakiye 51.100,00
 ⚠ 01.01.2025 döneminden devredilen 12.000,00; kaynağın güncel bakiyesi 12.450,00   [Tekrar devir et]
 [ Tahsilatlar table ]  [ Ödemeler table ]   ← only this period's dates
```

- Header Bakiye is the current one, labeled with its period.
- The "outside every period" line appears only while such records exist; the
  links go to `/collections` and `/payments` filtered by `cashAccount` and
  `to` = the day before the first period (existing filters).
- Devir box: shown when the account has 2+ periods. The note is the user's
  text, verbatim. Destination defaults to the current period (or the second
  period if the current one is the first), source to the period before the
  destination. The source picker lists only periods earlier than the picked
  destination. "Devir et" opens a confirmation: "01.01.2026 başlangıç
  bakiyesi: 0,00 → 48.250,00".
- Tabs (shadcn `tabs`) oldest → newest, titled by start date; opens on the
  current period (else the first). The tab content shows the range ("01.01.2026
  – 31.12.2026", last one "01.01.2027 –"), the four figures, the stale hint
  with "Tekrar devir et" (same confirmation), and the existing
  `CollectionsSection` / `PaymentsSection` limited to the period's dates
  (`from` / `to`). "Ekle" from there works as today.
- The "Bilgiler" box loses Başlangıç Bakiyesi.

### Ödeme / tahsilat forms: Kasa - Banka section

Shows the Bakiye of the period the typed date falls in: "Bakiye (01.01.2026
dönemi): 51.100,00". With no date yet, the current period's. If the date is
before the first period, a non-blocking warning: "Bu tarih hesabın hiçbir
dönemine girmiyor; bakiyelere sayılmaz." The save is not refused.

### Elsewhere

- Kasa - Banka list: Bakiye column = current Bakiye; the "Toplam" footer sums
  the shown values as today (accounts without a current Bakiye count as 0).
- Genel Bakış card: current Bakiye; the "Güncel bakiye" note stays.

## Audit

- Create: periods in `details` (start date and Başlangıç Bakiyesi each).
- Update: one "Dönemler" change when the periods changed, as display strings
  ("01.01.2026: 12.000,00; 01.01.2027: 0,00"), nothing when unchanged.
  Başlangıç Bakiyesi as a field disappears.
- Delete: details include the periods.
- Devir: its own entry (above).

## Migration (production data)

Destructive: drops `cash_account.opening_balance`, so the conversion is in the
same migration, between creating the table and dropping the column:

```sql
INSERT INTO cash_account_period (cash_account_id, start_date, opening_balance)
SELECT id, '2026-01-01', opening_balance FROM cash_account;
```

The user confirmed all production finance belongs to one period starting
01.01.2026. Records dated earlier (none expected) would just be "outside every
period", so the migration doesn't need to stop for them. Flag this again in
the change summary.

## Also in the change

- Release notes: a Yeni entry (Kasa - Banka dönemleri and Devir) and an
  İyileştirildi/Değiştirildi entry for Başlangıç Bakiyesi moving into periods.
- CLAUDE.md domain note for Kasa - Banka updated (periods, devir, current
  Bakiye, outside-period records).
- Tests: period Bakiye boundaries (start day in, next start day out), current
  period selection incl. all-future, out-of-period counts, PATCH replace
  semantics and 409, devir (rules, audit, link cleared on hand edit / re-date /
  source delete), stale detection, list/dashboard balances.

## Left to the builder

- The SQL shape for period balances and the current period.
- Component split for the period editor and the details tabs.
- Exact wording of minor messages and empty states, following the panel's
  existing Turkish.
