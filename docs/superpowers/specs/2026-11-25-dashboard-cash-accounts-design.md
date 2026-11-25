# Kasa - Banka on Genel Bakış

## Intent

Staff want to see Kasa - Banka balances on the dashboard without opening the
Kasa - Banka page. Show at most 5 accounts, in the same default order the
Kasa - Banka list uses.

## Goals

- A "Kasa - Banka" panel on Genel Bakış listing up to 5 accounts with their
  Bakiye. It uses the list's default view: Aktif accounts only, sorted by
  İsim A→Z, Turkish-aware (`compareTr`).
- Each name links to its account. Negative balances are red, as on the list.

## Non-goals

- A total balance. With more than 5 accounts, a total of only the ones shown
  would mislead. (My call; easy to add later as a total of all Aktif accounts,
  summed in Postgres.)
- Pasif accounts, or any setting for which accounts appear.

## Approaches

Compared with mockups (the superpowers visual companion):

- A. A section of its own above Finans, one tile per account.
- B. Tiles inside Finans, under Tahsilat / Ödeme / Fark.
- C. A list in the right column beside the monthly chart, above "Bu yıl
  tahsilatı olmayan aktif yetkililer". That either leaves empty space under
  the chart or squeezes the yetkililer list to about 2 visible names.
- **D. A fourth column in Finans' bottom row (picked).** It goes next to
  Tahsilat türleri / Ödeme türleri / Aktif projeler. The chart row stays as it
  is, and all four lists are about 5 lines long, so the row barely gets
  taller.

## Design

- **API:** `GET /api/dashboard` (`dashboard.ts`) returns
  `money.cashAccounts: { count, top: { id, name, balance }[] }`.
  - `count` is the number of Aktif accounts.
  - `top` is the first 5 Aktif accounts by `compareTr` on İsim. Bakiye comes
    from `cashAccountBalance()` (summed in Postgres) and travels as a string.
  - Sorting happens in JS, the way the list does it, so the order matches the
    list exactly. There are only a handful of accounts.
  - The 5 lives in `src/lib/dashboard.ts` with the other size constants.
- **UI** (`dashboard.tsx`):
  - The panel is first in the bottom Finans row, made with the existing
    `Panel`.
  - Title "Kasa - Banka", with the count shown as "(8)" when there are more
    than 5 (the same pattern as "Bekleyen başvurular (n)").
  - The note says "Güncel bakiye", because the section heading says 2026 but
    Bakiye is all-time.
  - The action is a `PanelLink` "Tümü" to `/cash-accounts`.
  - Rows are name ↔ `formatAmount(balance)` (tabular figures, red when
    negative), in the same list markup as Bekleyen başvurular.
  - Empty state: "Aktif hesap yok".
- **Layout:** the row goes from `lg:grid-cols-3` to `md:grid-cols-2
  xl:grid-cols-4`. Four columns at `lg` would be too narrow next to the
  sidebar for names and balances like "₺84.200,00". (My call.)
- **Release note:** a "Yeni" entry in `RELEASE_VERSIONS` saying the Genel
  Bakış page shows Kasa - Banka balances.
- **Tests:**
  - extend the dashboard route test: only Aktif accounts appear, in
    Turkish İsim order, at most 5, the count is right, and Bakiye includes
    tahsilatlar and ödemeler
  - scope the assertions to `__test__` accounts, since the dev data has
    others

## Left to the builder

The exact markup and the test fixtures.
