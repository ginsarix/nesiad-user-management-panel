# Kasa - Banka on Genel Bakış Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show up to 5 Aktif Kasa - Banka accounts with their Bakiye, as a fourth panel in the bottom Finans row of Genel Bakış.

**Architecture:**
- `GET /api/dashboard` loads every Aktif account with its Bakiye, which `cashAccountBalance()` sums in Postgres.
- A pure helper in `src/lib/dashboard.ts` sorts the accounts with `compareTr`, the same as the Kasa - Banka list, and keeps the first 5 plus the total count.
- `dashboard.tsx` renders them in a `Panel`.

**Tech Stack:** Hono route, Drizzle, TanStack Query (existing `["dashboard"]` query), Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-dashboard-cash-accounts-design.md`

## Global Constraints

- Aktif accounts only. The order is İsim A→Z by `compareTr`, exactly as `/cash-accounts` opens.
- At most 5 rows (`CASH_ACCOUNT_LIST_SIZE = 5`).
- Money travels as strings like `"1250.50"`. It is never added up as JS numbers, and Bakiye always comes from `cashAccountBalance()`.
- No total balance.
- UI copy:
  - title "Kasa - Banka", with " (n)" appended only when n > 5
  - note "Güncel bakiye"
  - action "Tümü" → `/cash-accounts`
  - empty state "Aktif hesap yok"
- The bottom Finans row goes from `lg:grid-cols-3` to `md:grid-cols-2 xl:grid-cols-4`. Kasa - Banka is the first panel in it.
- Release note: a new version `{ date: "2026-11-25" }` at the top of `RELEASE_VERSIONS`. 2026-11-24 is deployed, so don't add to it. Check the date again before pushing.
- Tests run with `pnpm test --run <pattern>` against the dev database. Never assert on whole-table counts: other test files create `__test__` accounts in parallel.

## Review Focus

1. **Turkish order:** "İş Bankası" sorts after "Isparta" and "Çarşı" after "Cadde", the way the list shows them, not by code point. Task 1's helper test pins this.
2. **Pasif accounts:** a Pasif account with a big balance never shows and isn't counted. Task 1's route test pins this with a Pasif `__test__` account.
3. **Exactly 5, fewer, or none:** no "(n)" at 5 or fewer, and "Aktif hesap yok" at 0. Task 1's helper test covers the count. Task 2 checks the title and empty state in the browser.
4. **Negative Bakiye:** shown red with its minus sign, as on the list (`balance.startsWith("-")`). Task 2 checks it in the browser with a negative opening balance.
5. **Long names in the narrower column:** the name truncates and the amount stays whole on one line (`min-w-0 truncate` on the name, `shrink-0` on the amount). Task 2 checks it at `md` and `xl` widths.

---

### Task 1: Dashboard API returns the first 5 Aktif accounts

**Files:**
- Modify: `src/lib/dashboard.ts`: the constant and the helper
- Modify: `src/lib/dashboard.test.ts`
- Modify: `src/app/api/[[...route]]/dashboard.ts`: a new query, and `money.cashAccounts` in the response
- Modify: `src/app/api/[[...route]]/dashboard.test.ts`

**Interfaces:**
- Produces:
  - `CASH_ACCOUNT_LIST_SIZE = 5` (exported from `src/lib/dashboard.ts`)
  - `firstCashAccounts<T extends { name: string }>(accounts: T[]): { count: number; top: T[] }`: sorts a copy with `compareTr` on `name`, takes the first `CASH_ACCOUNT_LIST_SIZE`, and `count` is `accounts.length`
  - The response field `money.cashAccounts: { count: number; top: { id: number; name: string; balance: string }[] }`. Task 2 reads it through the existing `Dashboard` type, which picks it up automatically.

- [ ] **Step 1: Write the failing helper test** in `src/lib/dashboard.test.ts`, inside `describe("dashboard helpers")`:

```ts
it("keeps the first 5 cash accounts in Turkish name order, counting all", () => {
  const names = ["Ziraat", "İş Bankası", "Isparta", "Çarşı Kasa", "Cadde", "Akbank", "Vakıfbank"];
  const { count, top } = firstCashAccounts(names.map((name) => ({ name })));
  expect(count).toBe(7);
  expect(top.map((a) => a.name)).toEqual(["Akbank", "Cadde", "Çarşı Kasa", "Isparta", "İş Bankası"]);
  expect(names[0]).toBe("Ziraat"); // input not reordered
});

it("returns every account when there are 5 or fewer", () => {
  expect(firstCashAccounts([])).toEqual({ count: 0, top: [] });
  expect(firstCashAccounts([{ name: "B" }, { name: "A" }]).top.map((a) => a.name)).toEqual(["A", "B"]);
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `pnpm test --run src/lib/dashboard.test.ts`
Expected: FAIL, because `firstCashAccounts` is not exported.

- [ ] **Step 3: Add `CASH_ACCOUNT_LIST_SIZE` and `firstCashAccounts` to `src/lib/dashboard.ts`.** Write a doc comment like the neighbouring constants. Import `compareTr` from `./turkish`, which keeps the file client-safe with no db imports.

- [ ] **Step 4: Run it and check that it passes**

Run: `pnpm test --run src/lib/dashboard.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing route test** in `dashboard.test.ts`.
  - **Fixture:** in `beforeAll`, add a Pasif account with `insertTestCashAccount(\`__test__ Dashboard Pasif ${tag}\`, cashAccountIds, { active: false, openingBalance: "999999.00" })` and keep its id as `passiveCashAccountId`. The existing Aktif fixture account (`cashAccountId`, which gets the tahsilat and ödeme) stays.
  - **Test:**

```ts
it("lists at most 5 Aktif cash accounts in Turkish name order", async () => {
  const { count, top } = (await getDashboard()).money.cashAccounts;
  expect(top.length).toBeLessThanOrEqual(5);
  expect(count).toBeGreaterThanOrEqual(Math.max(top.length, 1)); // our Aktif fixture
  const names = top.map((a: { name: string }) => a.name);
  expect(names).toEqual([...names].sort(compareTr));
  expect(top.map((a: { id: number }) => a.id)).not.toContain(passiveCashAccountId);
  for (const a of top) expect(a.balance).toMatch(/^-?\d+\.\d{2}$/);
  // every listed account is Aktif in the database
  const rows = await db.select({ active: cashAccountTable.active }).from(cashAccountTable)
    .where(inArray(cashAccountTable.id, top.map((a: { id: number }) => a.id)));
  expect(rows.every((row) => row.active)).toBe(true);
});
```

  Declare `let passiveCashAccountId = 0;` next to `cashAccountIds`. Import `compareTr` from `@/lib/turkish` and add `cashAccountTable` to the `@/db/schema` import. Its cleanup is already handled: `deleteTestCashAccounts(cashAccountIds)` runs in `afterAll`.

  The Bakiye arithmetic already has tests through `cashAccountBalance()` in `cash-accounts.test.ts`. This test only checks that the route uses that helper, which the string format shows.

- [ ] **Step 6: Run it and check that it fails**

Run: `pnpm test --run dashboard`
Expected: the new test FAILs because `money.cashAccounts` is undefined. The other tests still PASS.

- [ ] **Step 7: Implement the route side** in `src/app/api/[[...route]]/dashboard.ts`.
  - Add `async function activeCashAccounts()` with the doc comment "Aktif Kasa - Banka accounts with their Bakiye; the first few by name". It selects `{ id: cashAccountTable.id, name: cashAccountTable.name, balance: cashAccountBalance() }` where `active` is true, then `return firstCashAccounts(rows)`.
  - Add it to the `Promise.all` destructuring.
  - Add `cashAccounts` to `money` in the response.
  - Import `cashAccountBalance` from `./cash-account-queries`, and `cashAccountTable` and `firstCashAccounts`.

- [ ] **Step 8: Run the tests, typecheck and lint**

Run: `pnpm test --run dashboard && pnpm exec tsc --noEmit && pnpm lint`
Expected: all PASS, with no type or lint errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/dashboard.ts src/lib/dashboard.test.ts "src/app/api/[[...route]]/dashboard.ts" "src/app/api/[[...route]]/dashboard.test.ts"
git commit -m "feat: dashboard API lists the first Aktif Kasa - Banka accounts"
```

---

### Task 2: Kasa - Banka panel on Genel Bakış, with the release note

**Files:**
- Modify: `src/app/(panel)/dashboard.tsx`: a new `CashAccounts` component and the grid change of the bottom Finans row
- Modify: `src/lib/release-notes.ts`
- Add: `docs/superpowers/specs/2026-11-25-dashboard-cash-accounts-design.md` and this plan, committed with the change

**Interfaces:**
- Consumes: `data.money.cashAccounts` (`{ count, top: { id, name, balance }[] }`) and `CASH_ACCOUNT_LIST_SIZE` from Task 1. Existing `Panel`, `PanelLink` and `formatAmount`.

- [ ] **Step 1: Add `function CashAccounts({ data }: { data: DashboardData })`** in `dashboard.tsx`, after `RepresentativesWithoutCollection`.
  - `Panel` props:
    - title: `` `Kasa - Banka${count > CASH_ACCOUNT_LIST_SIZE ? ` (${count})` : ""}` ``
    - `note="Güncel bakiye"`
    - `action={<PanelLink href="/cash-accounts">Tümü</PanelLink>}`
  - Body when there are no accounts: `<p className="py-1 text-sm text-muted-foreground">Aktif hesap yok</p>`.
  - Otherwise, use the `ul.divide-y` markup from `Candidates`:
    - each name is a `Link` to `/cash-accounts/${id}` with `min-w-0 truncate text-primary hover:underline`
    - the amount is `formatAmount(balance)` in a `shrink-0 tabular-nums` span, with `text-destructive` when `balance.startsWith("-")`

- [ ] **Step 2: Put it first in the bottom Finans row and change that row's grid** from `grid gap-4 lg:grid-cols-3` to `grid gap-4 md:grid-cols-2 xl:grid-cols-4`.

- [ ] **Step 3: Add the release note** as a new first element of `RELEASE_VERSIONS`:

```ts
{
  date: "2026-11-25",
  entries: [
    {
      type: "new",
      text: "Genel Bakış sayfasında Kasa - Banka bakiyeleri: aktif hesapların ilk beşi, isme göre sıralı.",
    },
  ],
},
```

- [ ] **Step 4: Typecheck, lint and run the release-notes and dashboard tests**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test --run release-notes dashboard`
Expected: all PASS

- [ ] **Step 5: Check it in the running panel.** Use `pnpm dev`, log in with a dev session (not with credentials), and open `/`. To make the session, write a scratchpad `.mts` script run with `pnpm exec tsx --env-file=.env`. It uses better-auth's `internalAdapter.createSession` for the DEFAULT_ADMIN_EMAIL user and puts the signed cookie in the Playwright context. Delete the session row afterwards. Then check:
  - The panel is the first in the bottom Finans row and shows ≤5 accounts in the same order as `/cash-accounts`.
  - "Tümü" opens `/cash-accounts`, and each name opens its account.
  - Make a test Aktif account with Başlangıç Bakiyesi `-50` and a long name. Its amount is red and on one line, and the name truncates. Check at 1280px+ (4 columns) and about 900px (2 columns). Delete the account afterwards.
  - With more than 5 Aktif accounts, the title shows "(n)". Add temporary accounts if the dev data has fewer, and delete them afterwards.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(panel)/dashboard.tsx" src/lib/release-notes.ts docs/superpowers/specs/2026-11-25-dashboard-cash-accounts-design.md docs/superpowers/plans/2026-11-25-dashboard-cash-accounts.md
git commit -m "feat: Kasa - Banka balances on Genel Bakış"
```
