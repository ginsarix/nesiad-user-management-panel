# Kasa - Banka Periods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split each Kasa - Banka into staff-created dated periods with their own Başlangıç Bakiyesi and computed Bakiye, plus a manual "Devir et" that carries one period's Bakiye into a later one.

**Architecture:** A new `cash_account_period` table (start date, opening balance, last devir source + amount); ödemeler/tahsilatlar are untouched and fall into a period by date. Period balances are summed in Postgres on read; picking the period for a date / "today" is a pure client-safe helper shared by server and browser. `cash_account.opening_balance` is dropped after the migration copies it into a 01.01.2026 period.

**Tech Stack:** Next.js 16 App Router, Hono RPC, Drizzle (Postgres), zod, react-hook-form, TanStack Query/Table v9, shadcn (Base UI), vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-cash-account-periods-design.md`

## Global Constraints

- Work on branch `feat/cash-account-periods` (create it from `main` first). Don't push.
- Use `pnpm`. Tests only via `pnpm test --run <pattern>`. Lint `pnpm lint`, types `pnpm exec tsc --noEmit`.
- Money: `numeric(12,2)` strings ("1250.50"), may be negative for balances; never add money as JS numbers (sum in Postgres server-side, `sumAmounts` / BigInt kuruş client-side).
- Dates: API `yyyy-MM-dd`, forms `gg.aa.yyyy`; convert with `src/lib/dates.ts`. Period start dates may be in the future (unlike ödeme/tahsilat dates).
- A period runs from its `start_date` up to the day before the next period's `start_date`; the last is open-ended. A record dated exactly on a start date belongs to that (new) period.
- Records dated before the account's first period are allowed and count in no Bakiye.
- "Current" period = the latest period with `start_date ≤ todayInIstanbul()`; none → current Bakiye `null`, shown "—".
- Devir: source must start earlier than destination; any earlier period, allowed on Pasif accounts; repeatable; always audited.
- Devir note, verbatim: `Geçmiş yıla/döneme ait verilerinizi girdikten sonra dönemi devir ediniz, Devir için herhangi bir tarih kıstası yoktur, Önceki dönem bittikten sonra herhangi bir tarihte devir yapılabilir.`
- Messages: `En az bir dönem olmalı`, `Aynı başlangıç tarihli iki dönem olamaz`, `Dönem bulunamadı`, `Kaynak dönem, hedef dönemden önce olmalı`, `Bu tarih hesabın hiçbir dönemine girmiyor; bakiyelere sayılmaz.`
- Every mutation writes `recordAudit(tx, …)` in the same transaction, `actorOf(c)`.
- UI text Turkish; code, comments, commits English. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Swapping two periods' start dates in one edit must save (no transient uniqueness clash) → Task 3 test `swaps two periods' start dates`.
2. An account with zero periods (dev rows after `db:push`, or inserted directly) must not crash list, detail or dashboard → Task 2 test `an account without periods has no Bakiye`.
3. Editing a tahsilat's date across a period boundary moves its amount to the other period → Task 2 test `a record moves between periods with its date`.
4. A negative source Bakiye carries over as a negative opening balance → Task 4 test `carries a negative Bakiye`.
5. Pasif/Aktif toggle must keep periods (it sends no `periods`) → Task 3 test `PATCH without periods leaves them alone`.

---

### Task 1: Period helpers (client-safe)

**Files:**
- Create: `src/lib/cash-account-periods.ts`
- Test: `src/lib/cash-account-periods.test.ts`
- Also commit the spec and this plan.

**Interfaces:**
- Produces (all take periods sorted by `startDate` ascending, dates `yyyy-MM-dd`):
  - `periodIndexFor(periods: readonly { startDate: string }[], date: string): number` — index of the period containing `date`, `-1` before the first (or no periods).
  - `currentPeriodOf<T extends { startDate: string }>(periods: readonly T[], today: string): T | null`
  - `periodEndDate(nextStartDate: string | null): string | null` — the day before (use date-fns `subDays` + `parseIsoDate`/`format(…, ISO_FORMAT)`).
  - `periodRangeText(startDate: string, nextStartDate: string | null): string`
  - `isCarryStale(period: { carriedFromPeriodId: number | null; carriedAmount: string | null }, sourceBalance: string | null): boolean` — compare with `toKurus`.
  - `periodsAuditText(periods: readonly { startDate: string; openingBalance: string }[]): string` — sorts by date itself.
  - `defaultCarryPair<T extends { id: number }>(periods: readonly T[], currentIndex: number): { fromId: number; toId: number } | null` — destination = current period, or the second when current is the first or `-1`; source = the one before destination; `null` with fewer than 2 periods.

- [ ] **Step 1: Create the branch** — `git switch -c feat/cash-account-periods`
- [ ] **Step 2: Write the failing tests**

```ts
const P = [{ id: 1, startDate: "2025-01-01" }, { id: 2, startDate: "2026-01-01" }, { id: 3, startDate: "2027-01-01" }];
it("finds the period a date falls in", () => {
  expect(periodIndexFor(P, "2024-12-31")).toBe(-1);
  expect(periodIndexFor(P, "2025-12-31")).toBe(0);
  expect(periodIndexFor(P, "2026-01-01")).toBe(1);
  expect(periodIndexFor(P, "2030-05-05")).toBe(2);
  expect(periodIndexFor([], "2026-01-01")).toBe(-1);
});
it("current period is null when every period is in the future", () => {
  expect(currentPeriodOf(P, "2026-11-25")?.id).toBe(2);
  expect(currentPeriodOf(P, "2024-06-01")).toBeNull();
});
it("ends a period the day before the next", () => {
  expect(periodEndDate("2027-01-01")).toBe("2026-12-31");
  expect(periodEndDate("2024-03-01")).toBe("2024-02-29");
  expect(periodEndDate(null)).toBeNull();
});
it("writes the range", () => {
  expect(periodRangeText("2026-01-01", "2027-01-01")).toBe("01.01.2026 – 31.12.2026");
  expect(periodRangeText("2027-01-01", null)).toBe("01.01.2027 –");
});
it("tells a stale devir", () => {
  const link = { carriedFromPeriodId: 1, carriedAmount: "100.00" };
  expect(isCarryStale(link, "100.00")).toBe(false);
  expect(isCarryStale(link, "150.00")).toBe(true);
  expect(isCarryStale({ carriedFromPeriodId: null, carriedAmount: null }, "150.00")).toBe(false);
  expect(isCarryStale(link, null)).toBe(false);
});
it("audits periods sorted by date", () => {
  expect(periodsAuditText([
    { startDate: "2026-01-01", openingBalance: "-50.00" },
    { startDate: "2025-01-01", openingBalance: "1250.50" },
  ])).toBe("01.01.2025: 1.250,50 TL; 01.01.2026: -50,00 TL");
  expect(periodsAuditText([])).toBe("—");
});
it("picks the default devir pair", () => {
  expect(defaultCarryPair(P.slice(0, 1), 0)).toBeNull();
  expect(defaultCarryPair(P, 1)).toEqual({ fromId: 1, toId: 2 });
  expect(defaultCarryPair(P, 0)).toEqual({ fromId: 1, toId: 2 });
  expect(defaultCarryPair(P, -1)).toEqual({ fromId: 1, toId: 2 });
  expect(defaultCarryPair(P, 2)).toEqual({ fromId: 2, toId: 3 });
});
```

- [ ] **Step 3: Run** `pnpm test --run cash-account-periods` — expect FAIL (module missing).
- [ ] **Step 4: Implement** the functions above in `src/lib/cash-account-periods.ts` (no server imports; uses `isoToDisplay`, `formatAmountText`, `toKurus`).
- [ ] **Step 5: Run** `pnpm test --run cash-account-periods` — expect PASS.
- [ ] **Step 6: Commit** — `git add docs/superpowers src/lib/cash-account-periods*` ; `feat: Kasa - Banka period helpers`

---

### Task 2: Period table, migration, reads and create

**Files:**
- Modify: `src/db/schema.ts` (add `cashAccountPeriodTable`, drop `openingBalance` from `cashAccountTable`)
- Create: `drizzle/<generated>/migration.sql` (+ snapshot)
- Modify: `src/app/api/[[...route]]/cash-account-queries.ts`, `cash-accounts.ts`, `dashboard.ts`
- Modify: `src/lib/zod-schemas/cash-account.ts` (API schemas only here; form schema in Task 5)
- Modify: `src/test/cash-accounts.ts`; tests in `cash-accounts.test.ts`, `dashboard.test.ts`, `payments.test.ts`, `collections.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces:
  - `cashAccountPeriodTable` (`cash_account_period`): `id` identity; `cashAccountId` → `cash_account.id` on delete cascade; `startDate` date string not null; `openingBalance` numeric(12,2) string not null; `carriedFromPeriodId` → `cash_account_period.id` on delete set null, nullable; `carriedAmount` numeric(12,2) nullable; `createdAt`/`updatedAt` like other tables; non-unique index on `(cashAccountId, startDate)`. **No DB unique constraint**: uniqueness is enforced by the API under a row lock (Task 3) so a date swap can save.
  - `type PeriodBalanceRow = { id: number; cashAccountId: number; startDate: string; nextStartDate: string | null; openingBalance: string; collected: string; paid: string; balance: string; carriedFromPeriodId: number | null; carriedAmount: string | null }`
  - `selectPeriodBalances(executor: Executor, accountIds?: number[]): Promise<PeriodBalanceRow[]>` — ordered by `cashAccountId, startDate`; `nextStartDate` via `lead(start_date) over (partition by cash_account_id order by start_date)` in a subquery; `collected`/`paid` via correlated subqueries on `cash_account_id` and `date >= start_date and (next is null or date < next)` (no joins that multiply sums); `balance = opening + collected − paid`, all `::numeric(14,2)::text`.
  - `selectOutsidePeriods(executor: Executor, accountId: number): Promise<{ before: string | null; collectionCount: number; paymentCount: number }>` — records dated before the first period's start; `before` null (counts 0) without periods.
  - `cashAccountBalance()` is removed.
  - `GET /api/cash-accounts` item: `{ id, name, active, paymentCount, collectionCount, balance: string | null, currentPeriodStart: string | null, periods: { id: number; startDate: string; balance: string }[] }`, sorted by `compareTr(name)`.
  - `GET /api/cash-accounts/:id`: `{ id, name, active, paymentCount, collectionCount, balance: string | null, currentPeriodId: number | null, periods: DetailPeriod[], outside: { before: string | null; collectionCount: number; paymentCount: number } }` with `DetailPeriod = { id, startDate, endDate: string | null, openingBalance, collected, paid, balance, carriedFromPeriodId, carriedAmount, sourceBalance: string | null }` (`sourceBalance` = current Bakiye of `carriedFromPeriodId`, else null).
  - `POST /api/cash-accounts` body `cashAccountCreateSchema`: `{ name, active, periods: { startDate: string; openingBalance: string }[] }`; `periods` min 1 (`En az bir dönem olmalı`), distinct `startDate` (`Aynı başlangıç tarihli iki dönem olamaz`); start date any valid `yyyy-MM-dd` (future allowed — write a local schema, the shared ones refuse future dates); amount `SIGNED_AMOUNT_PATTERN`. Validation errors report `field: "periods"`.
  - `cashAccountPeriodApiSchema`, `cashAccountCreateSchema`, `cashAccountUpdateSchema` (Task 3), exported types `CashAccountCreateValues`, `CashAccountUpdateValues`.
  - Audit for create/delete: `describeFields` of `{ name, active }` plus `{ label: "Dönemler", value: periodsAuditText(periods) }`. The spec's `openingBalance` entry is removed.
  - Dashboard `money.cashAccounts.top[].balance: string | null` (current period).
  - Test helper: `insertTestCashAccount(name, ids, values: { active?: boolean; openingBalance?: string; startDate?: string } = {})` inserts the account plus one period (`startDate` default `"2000-01-01"`, `openingBalance` default `"0.00"`) — so existing callers keep their balances; and `insertTestPeriod(cashAccountId: number, startDate: string, openingBalance = "0.00"): Promise<number>`.

- [ ] **Step 1: Write failing tests** in `cash-accounts.test.ts` (give `addPayment` / `addCollection` a `date` parameter, default `"2026-11-01"`; `create()` posts `periods: [{ startDate: "2026-01-01", openingBalance: "0.00" }]` by default):
  - `creates an account with its periods` — POST periods `[{2026-01-01, "-50.00"}, {2025-01-01, "100.00"}]` → 201; GET `periods.map(p => [p.startDate, p.openingBalance])` equals `[["2025-01-01","100.00"],["2026-01-01","-50.00"]]`; create audit details contain `{ label: "Dönemler", value: "01.01.2025: 100,00 TL; 01.01.2026: -50,00 TL" }`.
  - `refuses an account without periods` → 400, `error` `En az bir dönem olmalı`.
  - `refuses two periods with the same start date` → 400, `Aynı başlangıç tarihli iki dönem olamaz`.
  - `period balances count records by date` — periods 2025-01-01 (100.00), 2026-01-01 (1000.00); tahsilat 50.00 on 2025-12-31, tahsilat 30.00 on 2026-01-01, ödeme 10.00 on 2026-06-01, tahsilat 999.00 on 2024-12-31 → period 1 `balance "150.00"`, `endDate "2025-12-31"`; period 2 `collected "30.00"`, `paid "10.00"`, `balance "1020.00"`, `endDate null`; `balance "1020.00"`; `currentPeriodId` = period 2; `outside` `{ before: "2025-01-01", collectionCount: 1, paymentCount: 0 }`; list item `balance "1020.00"`, `currentPeriodStart "2026-01-01"`, `periods` with both balances.
  - `a record moves between periods with its date` — move the 2025-12-31 tahsilat to 2026-02-01 by direct update → period 1 `"100.00"`, period 2 `"1070.00"`.
  - `current Bakiye is null when every period starts in the future` — single period 2999-01-01 → detail and list `balance null`, `currentPeriodId null`.
  - `an account without periods has no Bakiye` — insert `cash_account` row directly with no period → GET detail 200 with `periods []`, `balance null`, `outside.before null`; it appears in the list with `balance null`.
  - Delete test: delete audit details include the `Dönemler` entry.
  - `dashboard.test.ts`: its Kasa - Banka assertions use the current period's Bakiye (helper `startDate` default keeps them as before; adjust only where `openingBalance` was read).
- [ ] **Step 2: Run** `pnpm test --run cash-accounts` — expect FAIL.
- [ ] **Step 3: Schema + dev DB** — edit `schema.ts`; `pnpm db:push` (drops dev `opening_balance`; dev data is disposable); then give dev accounts a period: `insert into cash_account_period (cash_account_id, start_date, opening_balance) select id, '2026-01-01', 0 from cash_account c where not exists (select 1 from cash_account_period p where p.cash_account_id = c.id);` (psql with `DATABASE_URL`).
- [ ] **Step 4: Migration** — `pnpm db:generate`; edit the generated `migration.sql` so that, after the table and its FKs are created and **before** `ALTER TABLE "cash_account" DROP COLUMN "opening_balance"`, it runs:

```sql
INSERT INTO "cash_account_period" ("cash_account_id", "start_date", "opening_balance")
SELECT "id", '2026-01-01', "opening_balance" FROM "cash_account";
```

- [ ] **Step 5: Implement** queries, list/detail/POST/DELETE (delete reads periods before deleting for its audit details), dashboard, zod API schemas, test helper; replace `insertTestCashAccount` callers that pass `openingBalance` only if they break.
- [ ] **Step 6: Run** `pnpm test --run cash-accounts dashboard payments collections cash-account-periods` — expect PASS; `pnpm exec tsc --noEmit` may still fail in UI files (fixed in Tasks 5–7) — server files must be clean.
- [ ] **Step 7: Commit** — `feat: Kasa - Banka periods table, balances per period`

---

### Task 3: Edit periods (PATCH)

**Files:**
- Modify: `src/app/api/[[...route]]/cash-accounts.ts`, `src/lib/zod-schemas/cash-account.ts`
- Test: `src/app/api/[[...route]]/cash-accounts.test.ts`

**Interfaces:**
- Consumes: Task 2 table, `periodsAuditText`.
- Produces: `PATCH /api/cash-accounts/:id` body `cashAccountUpdateSchema = { name, active, periods?: { id?: number; startDate: string; openingBalance: string }[] }` (same `periods` rules as create when present).
  - Locks the account row (`.for("update")`, as `projects.ts:271` does) before touching periods.
  - With `periods`: an `id` not among the account's periods → 409 `Dönem bulunamadı` (`field: "periods"`), nothing saved. Clear the devir link (`carriedFromPeriodId`, `carriedAmount` → null) on every row pointing at a period about to be deleted; delete missing ids; update kept rows; insert new rows.
  - Kept row whose `openingBalance` differs from the saved one → its devir link is cleared. Same amount → kept.
  - After the writes, clear the link on every period of the account whose source starts on or after it.
  - Audit: one `update` entry with `diffFields` for name/active plus `change("Dönemler", before, after)` using `periodsAuditText`; no entry when nothing changed.

- [ ] **Step 1: Write failing tests**:
  - `PATCH without periods leaves them alone` — PATCH `{ name, active: false }` → periods unchanged, audit changes only `Durum`.
  - `PATCH replaces periods` — account with periods A (2025-01-01, 100.00), B (2026-01-01, 0.00); PATCH `[{ id: A, startDate: "2025-01-01", openingBalance: "200.00" }, { startDate: "2027-01-01", openingBalance: "5.00" }]` → A updated, B deleted, a new 2027 period; audit change `{ label: "Dönemler", from: "01.01.2025: 100,00 TL; 01.01.2026: 0,00 TL", to: "01.01.2025: 200,00 TL; 01.01.2027: 5,00 TL" }`.
  - `swaps two periods' start dates` — swap A and B dates in one PATCH → 200, ids keep their new dates.
  - `refuses a period of another account` → 409 `Dönem bulunamadı`, periods unchanged.
  - `a hand-typed opening balance drops the devir link` — set B's link to A directly in DB (`carriedAmount "100.00"`); PATCH B with `"100.00"` → link kept; PATCH B with `"120.00"` → both link fields null.
  - `moving a period before its devir source drops the link` — B linked to A; PATCH B's date to 2024-01-01 → link null.
  - `deleting a devir source clears the link` — B linked to A; PATCH without A → B's `carriedFromPeriodId` and `carriedAmount` null.
  - `PATCH without changes writes no audit entry`.
- [ ] **Step 2: Run** `pnpm test --run cash-accounts` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --run cash-accounts` — expect PASS.
- [ ] **Step 5: Commit** — `feat: edit Kasa - Banka periods`

---

### Task 4: Devir endpoint

**Files:**
- Modify: `src/app/api/[[...route]]/cash-accounts.ts`, `src/lib/zod-schemas/cash-account.ts`, `src/lib/audit-labels.ts`, `src/lib/fetches/cash-account.ts`
- Test: `src/app/api/[[...route]]/cash-accounts.test.ts`

**Interfaces:**
- Consumes: `selectPeriodBalances`.
- Produces:
  - `POST /api/cash-accounts/:id/carry-over`, body `carryOverSchema = { fromPeriodId: number; toPeriodId: number }` (`idSchema`). Locks the account row; both periods must belong to the account (else 404 `Dönem bulunamadı`); source `startDate` < destination's (else 400 `Kaynak dönem, hedef dönemden önce olmalı`). Computes the source Bakiye in the transaction, sets destination `openingBalance` and `carriedAmount` to it and `carriedFromPeriodId` to the source. Responds `{ message: "Devir yapıldı", openingBalance }`.
  - Audit: `entityType "cash_account"`, `action "carry_over"`, `details`: `Kaynak Dönem` (`01.01.2025`), `Hedef Dönem`, `Önceki Başlangıç Bakiyesi`, `Yeni Başlangıç Bakiyesi` (`formatAmountText`). Always written.
  - Label `cash_account.carry_over: "Kasa - Banka devri yapıldı"` in `audit-labels.ts`.
  - Fetch `carryOver(id: number, values: { fromPeriodId: number; toPeriodId: number }): Promise<void>` (throws the API error).

- [ ] **Step 1: Write failing tests**:
  - `carries the source's Bakiye` — A 2025-01-01 (100.00) + tahsilat 50.00 on 2025-06-01; B 2026-01-01 (0.00) → POST → B `openingBalance "150.00"`, `carriedFromPeriodId A`, `carriedAmount "150.00"`; audit `carry_over` details as above with `Önceki … "0,00 TL"`, `Yeni … "150,00 TL"`.
  - `carries a negative Bakiye` — A with ödeme 125.00 and opening 100.00 → B `"-25.00"`.
  - `a devir goes stale when the source changes` — after carrying, add a tahsilat 10.00 to A → GET detail: B `carriedAmount "150.00"`, `sourceBalance "160.00"`.
  - `repeating a devir is audited even without a change` — second POST → a second `carry_over` entry.
  - `refuses a source that isn't earlier` → 400; also from = to → 400.
  - `refuses periods of another account` → 404.
  - `carries into a future period` — B 2999-01-01 → 200.
- [ ] **Step 2: Run** `pnpm test --run cash-accounts` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --run cash-accounts` — expect PASS.
- [ ] **Step 5: Commit** — `feat: Kasa - Banka devir between periods`

---

### Task 5: Form period manager

**Files:**
- Create: `src/app/(panel)/cash-accounts/_components/periods-editor.tsx`
- Modify: `cash-account-form.tsx`, `[id]/toggle-active-button.tsx`, `src/lib/zod-schemas/cash-account.ts`, `src/lib/fetches/cash-account.ts`

**Interfaces:**
- Consumes: Task 2/3 API shapes.
- Produces:
  - Form schema `cashAccountFormSchema = { name, active, periods: { id?: number; startDate: string /* gg.aa.yyyy, any valid date */; openingBalance: string /* Turkish, may be empty or negative */ }[] }` — min 1 (`En az bir dönem olmalı`), duplicate start dates get an issue on each later duplicate's `periods.<i>.startDate` (`Aynı başlangıç tarihli iki dönem olamaz`).
  - `cashAccountToApi(values)` → `CashAccountCreateValues | CashAccountUpdateValues` (empty amount → `"0.00"`, dates via `displayToIso`, `id` kept when present).
  - `createCashAccount(values: CashAccountCreateValues)`, `updateCashAccount(id, values: CashAccountUpdateValues)`.
  - `PeriodsEditor` (`useFieldArray` on `periods`): rows Başlangıç Tarihi (`DatePickerInput allowFuture`) | Başlangıç Bakiyesi (`AmountInput allowNegative`) | remove (disabled on the only row); "Dönem ekle" appends `{ startDate: "", openingBalance: "" }`. Under the rows: `Boş bırakılan bakiye 0 olur. Bir dönemin bakiyesi, başlangıç bakiyesine o dönemdeki tahsilatlar eklenip ödemeleri çıkarılarak hesaplanır.`
  - The form's "Dönemler" section replaces the Başlangıç Bakiyesi input and its help text. Create defaults to one row `01.01.<year of todayInIstanbul()>`; edit loads saved periods (date ascending). An API error with `field: "periods"` shows under the section.
  - Saving invalidates `["cash-accounts"]`, `["payments"]`, `["collections"]`, `["dashboard"]`.
  - `ToggleActiveButton` sends `{ name, active: !active }` only.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Verify** `pnpm exec tsc --noEmit` clean for these files and `pnpm exec biome check --write <changed files>`.
- [ ] **Step 3: Click through** in dev (`pnpm dev`, dev session script per memory): create an account with 2 periods incl. a future one; duplicate dates show the error on the row; edit, remove a period, save; Pasife al keeps periods.
- [ ] **Step 4: Commit** — `feat: period manager in the Kasa - Banka form`

---

### Task 6: Details page — tabs, devir, outside records

**Files:**
- Create in `src/app/(panel)/cash-accounts/[id]/`: `period-tabs.tsx`, `carry-over-box.tsx`, `carry-over-dialog.tsx`, `outside-periods-notice.tsx`
- Modify: `cash-account-details.tsx`, `src/components/collections-section.tsx`, `src/components/payments-section.tsx`

**Interfaces:**
- Consumes: detail API (Task 2), `carryOver` (Task 4), Task 1 helpers.
- Produces:
  - `CollectionsSection` / `PaymentsSection` take optional `from?: string | null; to?: string | null` (iso, inclusive) passed into their filters.
  - Header: `Bakiye <amount>` (red when negative, "—" when null) then `(<dd.MM.yyyy> dönemi)` for the current period. "Bilgiler" keeps only Durum.
  - `OutsidePeriodsNotice`: shown when `outside.collectionCount + outside.paymentCount > 0`: `<before> öncesine ait <n> kayıt hiçbir döneme girmiyor` with links "Tahsilatlar" → `/collections?cashAccount=<id>&to=<day before before>` and "Ödemeler" → `/payments?…` (only for the non-zero kinds).
  - `CarryOverBox` (2+ periods): two `Select`s source → destination (default `defaultCarryPair`; source lists only periods earlier than the destination; changing the destination resets an invalid source to the one just before it), "Devir et", and the verbatim note.
  - `CarryOverDialog` (AlertDialog): `<dest start> başlangıç bakiyesi: <old> → <new>` where new = the source's `balance`; confirm calls `carryOver`, then invalidates `["cash-accounts"]` and `["dashboard"]`; errors shown in the dialog.
  - `PeriodTabs` (shadcn `tabs`): oldest → newest, titled `dd.MM.yyyy`; opens on `currentPeriodId` else the first. Content: `periodRangeText`, `Başlangıç Bakiyesi · Tahsilatlar · Ödemeler · Bakiye`, the stale hint when `isCarryStale` — `<source start> döneminden devredilen <carriedAmount>; kaynağın güncel bakiyesi <sourceBalance>` + "Tekrar devir et" (same dialog, pair = source → this period) — and the two sections limited to `from = startDate`, `to = endDate`. Without periods: an empty-state line `Bu hesabın dönemi yok. Düzenle'den dönem ekleyin.`
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** tsc + biome on changed files.
- [ ] **Step 3: Click through** in dev: tabs open on today's period; a tahsilat dated on a start date shows in the new tab; devir then add a tahsilat to the source → stale hint, "Tekrar devir et" clears it; a record dated before the first period shows the notice and its links filter the lists.
- [ ] **Step 4: Commit** — `feat: Kasa - Banka details by period with devir`

---

### Task 7: List, Genel Bakış and the ödeme/tahsilat forms

**Files:**
- Modify: `src/app/(panel)/cash-accounts/cash-accounts.tsx`, `src/app/(panel)/dashboard.tsx`, `src/components/cash-account-section.tsx`, `src/app/(panel)/payments/_components/payment-form.tsx`, `src/app/(panel)/collections/_components/collection-form.tsx`

**Interfaces:**
- Consumes: list item shape (Task 2), `periodIndexFor`.
- Produces:
  - List Bakiye column: "—" for `null`; `sortByBalance` puts `null` lowest; the Toplam footer and toolbar sum `balance ?? "0.00"`.
  - Dashboard row shows "—" for `null`.
  - `CashAccountSection` gets `date: string` (the form's typed `gg.aa.yyyy`, via `useWatch`). Valid date: index = `periodIndexFor(picked.periods, iso)`; `-1` → the warning `Bu tarih hesabın hiçbir dönemine girmiyor; bakiyelere sayılmaz.` (muted/amber, not an error, doesn't block); else `Bakiye (<dd.MM.yyyy> dönemi): <amount>`. Invalid/empty date → current period's (`balance`, `currentPeriodStart`), "—" when null.
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `pnpm exec tsc --noEmit` clean, `pnpm lint` passes.
- [ ] **Step 3: Click through** in dev: list sorts/sums with a future-only account; new tahsilat form shows the period label and switches when the date crosses a start date; a pre-period date shows the warning and still saves.
- [ ] **Step 4: Commit** — `feat: period-aware Kasa - Banka balances across the panel`

---

### Task 8: Release notes, docs, full verification

**Files:**
- Modify: `src/lib/release-notes.ts`, `CLAUDE.md`, memory `cash-account-decisions.md`

- [ ] **Step 1: Release notes** — check `git log origin/main`: if the `2026-11-25` version isn't deployed yet, add to it; otherwise add a new version dated the push day with the next `revision`. Entries:
  - `new`: `Kasa - Banka dönemleri: her hesaba başlangıç tarihi ve başlangıç bakiyesi olan dönemler eklenebilir; hesap sayfasında her dönem kendi sekmesinde görünür.`
  - `new`: `Kasa - Banka sayfasında Devir: bir dönemin bakiyesi "Devir et" ile sonraki bir döneme aktarılır; kaynak dönem sonradan değişirse sayfa uyarır.`
  - `changed`: `Başlangıç Bakiyesi artık hesabın dönemlerinde tutulur; mevcut hesapların bakiyesi 01.01.2026 dönemine taşındı ve listede, Genel Bakış'ta bugünün döneminin bakiyesi gösterilir.`
- [ ] **Step 2: CLAUDE.md** — rewrite the Kasa - Banka domain bullet: periods (`cash_account_period`, start date + Başlangıç Bakiyesi, ≥1, end = next start − 1), Bakiye per period summed in Postgres (`selectPeriodBalances`), current period = latest started, records before the first period allowed and shown as outside, manual Devir with stale hint (`carried_from_period_id` / `carried_amount`, cleared on hand edit / re-date / source delete), no DB unique on start date (API under row lock), `cash-account-periods.ts` helpers.
- [ ] **Step 3: Memory** — update `cash-account-decisions.md`: periods replace opening_balance; devir manual by user/staff choice (automatic inheritance dropped after the December late-entries problem); records before the first period allowed for flexibility; don't re-propose balances flowing forward automatically.
- [ ] **Step 4: Full verification** — `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test --run`, `pnpm build`; all pass.
- [ ] **Step 5: Commit** — `docs: Kasa - Banka periods in CLAUDE.md` (release notes in the same commit as `feat:` if preferred: `feat: release notes for Kasa - Banka periods`).
- [ ] **Step 6: Report** — remind the user the migration drops `cash_account.opening_balance` after copying it into 01.01.2026 periods, and that merging to `main` applies it to production.
