# Kasa - Banka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kasa - Banka accounts (`cash_account`) with a computed Bakiye, and replace Ödeme Tipi / Tahsilat Tipi with a required Kasa - Banka on every ödeme and tahsilat.

**Architecture:** One new table with `opening_balance`; Bakiye is computed in Postgres from correlated sums of the account's tahsilatlar and ödemeler, never stored. A new Hono route `/api/cash-accounts` follows `projects.ts`; payments/collections swap `method_id` for `cash_account_id` end to end (schema, API, filters, exports, notices, UI). Pages follow Projeler (list / new / [id] / [id]/edit).

**Tech Stack:** Next.js 16 App Router, Hono RPC, Drizzle (Postgres), zod, react-hook-form, TanStack Query/Table v9, vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-cash-accounts-design.md`

## Global Constraints

- UI text Turkish, code/comments/commits English. pnpm only. `pnpm test --run`, `pnpm lint`, `pnpm exec tsc --noEmit` must pass at the end of every task.
- Menu label "Kasa - Banka", route `/cash-accounts`, first child of Finans, icon `Vault` (lucide).
- Code name `cash_account` (table), `cashAccount` / `cashAccountId` (TS), entity type `cash_account`, audit filter label "Kasa - Banka".
- Field labels: "İsim", "Başlangıç Bakiyesi", "Bakiye", "Durum" (Aktif/Pasif). Form section heading "Kasa - Banka"; link text "Hesaba git".
- Amounts travel as strings ("1250.50", may be "-1250.50" for opening balance and Bakiye); never add money as JS numbers (Postgres sums or `sumAmounts`).
- Bakiye = `opening_balance + Σ collection.amount − Σ payment.amount` of that account. Never stored.
- New ödeme/tahsilat needs an Aktif account; an edit may keep its current Pasif one.
- Notice placeholders: `{tip}` removed, `{kasa}` added ("kasa - banka hesabı").
- Every mutation audits in its transaction (`recordAudit`, `actorOf(c)`).
- Destructive migration (Task 2) is user-approved; point it out again in the final summary.

## Review Focus

1. **Bakiye with both tahsilatlar and ödemeler on one account**: a join-then-sum would multiply rows; expected exact sum. Test in Task 1 (`balance with several of each`).
2. **Negative balances and totals** ("-0.50", "-1250.00"): `fromKurus`, `sumAmounts`, `formatAmount`, the list Toplam row must show the sign correctly. Tests in Task 1 (money).
3. **Editing a record whose account is now Pasif**: the form must still show it (labelled "(Pasif)") and the API must accept it; a new record on it is refused. Test in Task 2.
4. **Moving a record to another account** updates both Bakiyes. Test in Task 2 (`moving a payment moves its amount`).
5. **Deleting an account with records**, including one added between count and delete (FK restrict): 409, not 500. Test in Task 1.

---

### Task 1: `cash_account` table, signed money helpers, `/api/cash-accounts`

**Files:**
- Modify: `src/db/schema.ts` (new `cashAccountTable` before `collectionTable`; nullable `cashAccountId` on `collectionTable` and `paymentTable`, FK restrict, indexed `collection_cash_account_idx` / `payment_cash_account_idx`)
- Create: `drizzle/<generated>_cash_account/` (via `pnpm db:push` then `pnpm db:generate`; additive)
- Modify: `src/lib/money.ts`, `src/lib/money.test.ts`
- Create: `src/lib/zod-schemas/cash-account.ts`
- Create: `src/app/api/[[...route]]/cash-accounts.ts`, `src/app/api/[[...route]]/cash-account-queries.ts`
- Modify: `src/app/api/[[...route]]/app.ts` (`.route("/cash-accounts", cashAccountsRoute)`)
- Modify: `src/lib/audit-filters.ts`, `src/lib/audit-labels.ts` (`cash_account`: "Kasa - Banka"; "Kasa - Banka eklendi/güncellendi/silindi")
- Create: `src/lib/fetches/cash-account.ts`
- Create: `src/test/cash-accounts.ts` (fixture helper)
- Test: `src/app/api/[[...route]]/cash-accounts.test.ts`

**Interfaces:**
- Produces:
  - `cashAccountTable`: `id`, `name`, `nameKey` (`name_key`, unique, `name.toLocaleLowerCase("tr")` like `counterparty.title_key`), `openingBalance` (`opening_balance` `numeric(12,2)` mode string, not null, default `"0"`), `active` (default true), `createdAt`, `updatedAt`.
  - `src/lib/money.ts`: `SIGNED_AMOUNT_PATTERN = /^-?\d{1,10}\.\d{2}$/`; `parseSignedAmountInput(text: string): string | null` ("-1.250,5" → "-1250.50", also accepts "−"; "-0" → "0.00"); `toKurus`/`fromKurus` sign-safe.
  - `src/lib/zod-schemas/cash-account.ts`: `cashAccountSchema` (API: `name` trim 1–200 "İsim boş olamaz" / "İsim en fazla 200 karakter olabilir", `openingBalance` string matching `SIGNED_AMOUNT_PATTERN` "Geçerli bir tutar girin", `active` boolean); `cashAccountFormSchema` (form: `name`, `openingBalance` string where `""` is allowed and anything else must parse with `parseSignedAmountInput`, `active`); `cashAccountToApi(values: CashAccountFormValues): CashAccountApiValues` (`""` → `"0.00"`); types `CashAccountApiValues`, `CashAccountFormInput`, `CashAccountFormValues`.
  - `cash-account-queries.ts`: `cashAccountBalance(): SQL<string>` and `cashAccountUsage(): { paymentCount: SQL<number>; collectionCount: SQL<number> }`, both correlated to `cash_account.id`.
  - API: `GET /` → `CashAccountListItem[]` = `{ id, name, openingBalance, active, balance, paymentCount, collectionCount }[]` sorted by `compareTr(name)`; `GET /:id` → same shape or 404 "Kasa - Banka bulunamadı"; `POST /` → 201 `{ id, message: "Kasa - Banka kaydedildi" }`; `PATCH /:id` → `{ id, message: "Kasa - Banka güncellendi" }`; `DELETE /:id` → `{ message: "Kasa - Banka silindi" }` or 409.
  - `src/lib/fetches/cash-account.ts`: `getCashAccounts(options?)`, `getCashAccount(id, options?)` (null on 404), `createCashAccount(values): Promise<number>`, `updateCashAccount(id, values)`, `deleteCashAccount(id)`, types `CashAccountListItem`, `CashAccount`. Query keys used by pages: `["cash-accounts"]`, `["cash-accounts", id]`.
  - `src/test/cash-accounts.ts`: `insertTestCashAccount(name: string, ids: number[], values?: { active?: boolean; openingBalance?: string }): Promise<number>` (inserts directly, pushes the id) and `deleteTestCashAccounts(ids: number[])`.

- [ ] **Step 1: Load the drizzle skill** (`pnpm-drizzle-kit-drizzle`) before editing `schema.ts`.

- [ ] **Step 2: Write failing money tests** in `src/lib/money.test.ts`:

```ts
it("fromKurus keeps the sign", () => {
  expect(fromKurus(-50n)).toBe("-0.50");
  expect(fromKurus(-125050n)).toBe("-1250.50");
  expect(fromKurus(0n)).toBe("0.00");
});
it("toKurus reads negative amounts", () => {
  expect(toKurus("-0.50")).toBe(-50n);
  expect(toKurus("-1250.50")).toBe(-125050n);
});
it("sumAmounts goes below zero", () => {
  expect(sumAmounts(["100.00", "-250.25"])).toBe("-150.25");
});
it("parseSignedAmountInput", () => {
  expect(parseSignedAmountInput("-1.250,5")).toBe("-1250.50");
  expect(parseSignedAmountInput("−10")).toBe("-10.00");
  expect(parseSignedAmountInput("1.250,50")).toBe("1250.50");
  expect(parseSignedAmountInput("-0")).toBe("0.00");
  expect(parseSignedAmountInput("--5")).toBeNull();
  expect(parseSignedAmountInput("")).toBeNull();
});
```

- [ ] **Step 3: Run `pnpm test --run money`**, expect the new cases to FAIL.

- [ ] **Step 4: Make `toKurus` / `fromKurus` sign-safe and add `parseSignedAmountInput` / `SIGNED_AMOUNT_PATTERN`.** `fromKurus` formats the absolute value and prefixes "-" when negative. Run `pnpm test --run money`, expect PASS.

- [ ] **Step 5: Schema.** Add `cashAccountTable` and the nullable `cashAccountId` columns as listed (nullable only until Task 2). `pnpm db:push`, then `pnpm db:generate` (name it `cash_account`). Check the SQL is additive only.

- [ ] **Step 6: Write failing route tests** in `cash-accounts.test.ts` (accounts named `__test__ … ${suffix}`, cleaned in `afterAll`; payments/collections inserted directly with `db.insert`, with `cashAccountId` set, using a test cari, yetkili and parameters made in `beforeAll` like `payments.test.ts`):
  - `creates with opening balance empty → "0.00"`: POST `{ name, openingBalance: "0.00", active: true }` → 201; GET `/:id` → `balance: "0.00"`, `active: true`.
  - `opening balance may be negative`: POST `openingBalance: "-500.00"` → GET `balance: "-500.00"`.
  - `balance with several of each`: opening `"1000.00"`, tahsilatlar `"200.00"`, `"300.50"`, ödemeler `"100.25"`, `"50.00"`, `"25.00"` → `balance: "1325.25"`, `paymentCount: 3`, `collectionCount: 2`; same numbers in the `GET /` row.
  - `balance ignores other accounts' records`.
  - `name is unique ignoring Turkish case`: "__test__ İş Bankası x" then "__test__ iş bankası x" → 409 `{ error: "Bu isimde bir Kasa - Banka zaten var", field: "name" }`; PATCH to a taken name → same 409.
  - `patch audits field changes`: change openingBalance "0.00" → "1250.00" and active → false → one audit row `entityType: "cash_account"`, action `update`, changes include `{ label: "Başlangıç Bakiyesi", before: "₺0,00", after: "₺1.250,00" }` and `Durum`. A PATCH with identical values writes no audit row.
  - `create and delete store the record` (details contain İsim, Başlangıç Bakiyesi, Durum).
  - `refuses to delete an account with records`: one payment + one collection → 409 `{ error: "Bu hesaba ait 1 ödeme ve 1 tahsilat var. Silmek yerine pasif yapabilirsiniz." }`; account still there.
  - `404s`: GET/PATCH/DELETE of an unknown id → 404 "Kasa - Banka bulunamadı".

- [ ] **Step 7: Run `pnpm test --run cash-accounts`**, expect FAIL (route missing).

- [ ] **Step 8: Implement `cash-account-queries.ts` and `cash-accounts.ts`.** Bakiye as correlated scalar subqueries (a join of both tables would multiply sums):

```sql
(cash_account.opening_balance
  + coalesce((select sum(c.amount) from collection c where c.cash_account_id = cash_account.id), 0)
  - coalesce((select sum(p.amount) from payment p where p.cash_account_id = cash_account.id), 0)
)::numeric(14,2)::text
```

  Counts the same way (`(select count(*)::int …)`). Audit spec: `name` "İsim" text, `openingBalance` "Başlangıç Bakiyesi" shown with `formatAmount`, `active` "Durum" `formatAudit.active`; entity label = name. Duplicate name → 409 via `pgErrorCode(error) === UNIQUE_VIOLATION`. Delete mirrors `projects.ts` delete: count both inside the transaction, refuse when either > 0, and map `FOREIGN_KEY_VIOLATION` to the same 409 with unknown counts ("Bu hesaba ait ödeme veya tahsilat var. Silmek yerine pasif yapabilirsiniz."). The 409 text joins only the non-zero parts ("2 ödeme", "1 tahsilat", "1 ödeme ve 1 tahsilat"). Mount in `app.ts`; add the audit labels.

- [ ] **Step 9: Run `pnpm test --run cash-accounts`**, expect PASS.

- [ ] **Step 10: Fetches + test helper.** Write `src/lib/fetches/cash-account.ts` like `fetches/project.ts` (errors through `throwResponseError`; messages "Kasa - Banka kaydedilemedi/güncellenemedi/silinemedi"). Write `src/test/cash-accounts.ts`.

- [ ] **Step 11: `pnpm lint && pnpm exec tsc --noEmit && pnpm test --run`**, all green.

- [ ] **Step 12: Commit** `feat: Kasa - Banka accounts with a computed balance (API)`.

---

### Task 2: Replace Ödeme Tipi / Tahsilat Tipi with Kasa - Banka

Everything that names `method` changes together so the build stays green.

**Files:**
- Modify: `src/db/schema.ts` (drop `methodId` from `paymentTable`/`collectionTable`; `cashAccountId` `.notNull()`; narrow `parameter_kind_valid` to `('collection_category','payment_category','association_role')`; update comments)
- Create: `drizzle/<generated>_drop_method/` (generated, then SQL edited, see Step 3)
- Modify: `src/lib/parameters.ts`, `src/lib/parameters.test.ts`
- Modify: `src/lib/zod-schemas/payment.ts`, `src/lib/zod-schemas/collection.ts`
- Modify: `src/lib/payment-filters.ts`, `src/lib/collection-filters.ts`
- Modify: `src/app/api/[[...route]]/payment-queries.ts`, `payments.ts`, `collection-queries.ts`, `collections.ts`, `parameters.ts`
- Modify: `src/lib/collection-notices.ts`, `src/lib/sms/templates.ts`
- Modify: `src/lib/payment-prerequisites.ts` (+ test), `src/lib/collection-prerequisites.ts` (+ test), both `missing-prerequisites-notice.tsx`, both `prefetch-form-lists.ts`
- Create: `src/components/cash-account-section.tsx`
- Modify: `src/app/(panel)/payments/_components/payment-form.tsx`, `src/app/(panel)/collections/_components/collection-form.tsx`
- Modify: `src/app/(panel)/payments/payments.tsx`, `src/app/(panel)/collections/collections.tsx`, `src/app/(panel)/counterparties/[id]/counterparty-details.tsx`, `src/components/collections-section.tsx`, `src/app/(panel)/settings/settings.tsx`
- Test: `payments.test.ts`, `collections.test.ts`, `parameters.test.ts`, `counterparties.test.ts`, `dashboard.test.ts`, `projects.test.ts`, `representatives.test.ts`, `organizations.test.ts`, `accruals.test.ts`, `src/lib/collection-notices.test.ts`, `src/lib/sms/gsm.test.ts` (if it checks defaults)

**Interfaces:**
- Consumes: `cashAccountTable`, `insertTestCashAccount`, `getCashAccounts`, `CashAccountListItem` (Task 1).
- Produces:
  - `paymentSchema` / `collectionSchema`: `cashAccountId: idSchema("Kasa - Banka seçin")` replaces `methodId`; form schemas `cashAccountId: pickedSchema("Kasa - Banka seçin")`.
  - Rows from `selectPayment(s)` / `selectCollection(s)`: `cashAccountId`, `cashAccountName` replace `methodId`, `methodName`.
  - `PaymentFilters.cashAccount` / `CollectionFilters.cashAccount: number | null` replace `method`; URL/API param `cashAccount`.
  - `CashAccountSection({ control, accounts, currentId }: { control: Control<{ cashAccountId: number | null }>; accounts: CashAccountListItem[] | undefined; currentId: number | null })`: the bordered "Kasa - Banka" section with a `SearchCombobox` of Aktif accounts plus `currentId` (label "İsim (Pasif)"), and under it "Bakiye: ₺… · Hesaba git" for the selected account (link `/cash-accounts/:id`).
  - `COLLECTION_NOTICE_PLACEHOLDERS.kasa = "kasa - banka hesabı"`; `tip` removed. Notice values `kasa: collection.cashAccountName`.
  - `missingForPayments(counterparties, parameters, cashAccounts)` → `{ counterparty, parameters, cashAccount }` (`parameters` now means only `payment_category`; `cashAccount` = loaded and no Aktif account). Collections the same with its own lists.

- [ ] **Step 1: Point dev rows at an account.** The dev database has payments/collections with null `cash_account_id`. Insert one dev account "Merkez Kasa" (opening 0) and set every dev payment/collection's `cash_account_id` to it, with a one-off `pnpm exec tsx` script in the scratchpad (dev data only; do not commit the script).

- [ ] **Step 2: Schema edits** as listed under Files, then `pnpm db:push` (dev) and `pnpm db:generate` (name `cash_account_required`).

- [ ] **Step 3: Edit the generated migration SQL** so its order is: drop both `method_id` FKs and columns; `ALTER … cash_account_id SET NOT NULL` on both tables (fails, and stops the deploy, if production has rows: that's the intended guard, so add no default and no backfill); `DELETE FROM "parameter" WHERE "kind" IN ('payment_method','collection_method');`; replace the check constraint; then rewrite saved notices:

```sql
UPDATE "collection_notice_settings" SET
  "representative_sms" = replace(replace("representative_sms", ' ({tip})', ''), '{tip}', ''),
  "representative_email_subject" = replace(replace("representative_email_subject", ' ({tip})', ''), '{tip}', ''),
  "representative_email_body" = replace(replace("representative_email_body", ' ({tip})', ''), '{tip}', ''),
  "staff_sms" = replace(replace("staff_sms", 'Tahsilat Tipi: {tip}', 'Kasa - Banka: {kasa}'), '{tip}', '{kasa}'),
  "staff_email_subject" = replace(replace("staff_email_subject", 'Tahsilat Tipi: {tip}', 'Kasa - Banka: {kasa}'), '{tip}', '{kasa}'),
  "staff_email_body" = replace(replace("staff_email_body", 'Tahsilat Tipi: {tip}', 'Kasa - Banka: {kasa}'), '{tip}', '{kasa}');
```

  Apply the same `UPDATE` to the dev database once (push doesn't run it). Don't run `db:migrate` on dev.

- [ ] **Step 4: Update the API tests first.** Switch fixtures from `payment_method`/`collection_method` parameters to `insertTestCashAccount` in every listed test file. Add to `payments.test.ts` (and the same three to `collections.test.ts`, with tahsilat adding instead of subtracting):
  - `a new payment needs an Aktif account`: Pasif account → 400 `{ error: "Seçilen Kasa - Banka aktif değil", field: "cashAccountId" }`; unknown id → 400 "Seçilen Kasa - Banka bulunamadı".
  - `an edit keeps its Pasif account`: create on Aktif, set account Pasif directly in db, PATCH with the same `cashAccountId` and a new amount → 200.
  - `balance follows create, edit and delete`: opening "1000.00"; create "250.00" → GET `/api/cash-accounts/:id` (via `cashAccountsRoute.request`) `balance: "750.00"`; PATCH amount "300.00" → "700.00"; DELETE → "1000.00".
  - `moving a payment moves its amount`: PATCH `cashAccountId` A → B: A back to its opening, B reduced by the amount; audit change `{ label: "Kasa - Banka", before: "A name", after: "B name" }`.
  - `filters by cashAccount`: `?cashAccount=<A>` lists only A's payments.
  - `export has a Kasa - Banka column` (header row cell 5 is "Kasa - Banka", the row holds the account name).
  - `parameters.test.ts`: POST a `payment_method` kind → 400.
  - `collection-notices.test.ts`: the staff templates fill `{kasa}` with the account name; `DEFAULT_COLLECTION_NOTICE_TEMPLATES` contains no `{tip}` and `representative*` contain no `{kasa}`.

- [ ] **Step 5: Run `pnpm test --run`**, expect FAIL (method still wired).

- [ ] **Step 6: Server swap.** `resolveReferences` in both routes checks the account (`cashAccountTable`; missing → "Seçilen Kasa - Banka bulunamadı"; Pasif and `existing?.cashAccountId !== values.cashAccountId` → "Seçilen Kasa - Banka aktif değil"; field `cashAccountId`; payments' error class gains a `field` like `CollectionInputError` so the form shows it under the picker). Audit spec key `cashAccount` label "Kasa - Banka" replaces `method`. Queries join `cashAccountTable` instead of the `method` alias. Filters `cashAccount`. Excel header "Kasa - Banka" in place of the Tip column. `PARAMETER_KINDS`/labels/`parameterUsageNouns` drop the two kinds. Notices: placeholder and defaults:
  - `representativeEmailBody`: "Sayın {yetkili},\n\n{tarih} tarihli {tutar} tutarındaki {tur} ödemeniz alınmıştır. Teşekkür ederiz.\n\nNevşehir Sanayici ve İş İnsanları Derneği"
  - `staffSms`: "Yeni tahsilat: {yetkili}, {tutar} ({tur}, {kasa}), {tarih}. Proje: {proje}"
  - `staffEmailBody`: "…\nTahsilat Türü: {tur}\nKasa - Banka: {kasa}\nProje: {proje}"

- [ ] **Step 7: Run `pnpm test --run`**, expect PASS.

- [ ] **Step 8: UI swap.**
  - Both forms: remove the Tip field; render `CashAccountSection` after the main section (tahsilat: before `ProjectSection`). Default `cashAccountId`: the record's, else the only Aktif account when there is exactly one, else null. Add `"cashAccountId"` to the collection form's `FIELDS`; the payment form shows the API's `field` errors the same way. On success also invalidate `["cash-accounts"]`. Prefetch `["cash-accounts"]` in both `prefetch-form-lists.ts`.
  - Missing-prerequisites notices: ask for "Kasa - Banka" with a link to `/cash-accounts/new` when there is no Aktif account; Tür wording loses "ve tipi".
  - Lists (`payments.tsx`, `collections.tsx`): column `cashAccountName` header "Kasa - Banka", filter combobox over all accounts (Pasif labelled), param `cashAccount`. Saved column-visibility cookies holding `methodName` are harmless (unknown ids are ignored); confirm in the browser.
  - `counterparty-details.tsx` and `collections-section.tsx`: "Kasa - Banka" column from `cashAccountName`; filter objects use `cashAccount: null`.
  - `settings.tsx`: the Parametreler tab shows only the remaining kinds (driven by `PARAMETER_KINDS`; remove any hard-coded Tip references).

- [ ] **Step 9: Verify in the browser** (dev session script per memory "test panel in dev"): create an ödeme and a tahsilat, check that the section shows the Bakiye, that the "(Pasif)" account stays on an edit page, and that the filter and export work. Then `pnpm lint && pnpm exec tsc --noEmit && pnpm test --run`.

- [ ] **Step 10: Commit** `feat!: Kasa - Banka replaces Ödeme Tipi and Tahsilat Tipi` (body names the destructive migration: drops `method_id`, deletes the Tip parameters, rewrites saved notice templates).

---

### Task 3: Kasa - Banka pages and sidebar

**Files:**
- Create: `src/app/(panel)/cash-accounts/page.tsx`, `cash-accounts.tsx` (list), `new/page.tsx`, `_components/cash-account-form.tsx`, `[id]/page.tsx`, `[id]/cash-account-details.tsx`, `[id]/delete-cash-account-button.tsx`, `[id]/toggle-active-button.tsx`, `[id]/not-found.tsx`, `[id]/edit/page.tsx`
- Create: `src/components/payments-section.tsx` (extracted from `counterparty-details.tsx`)
- Modify: `src/components/collections-section.tsx` (`of: "representative" | "project" | "cashAccount"`)
- Modify: `src/app/(panel)/counterparties/[id]/counterparty-details.tsx` (use `PaymentsSection`)
- Modify: payment/collection new + edit `page.tsx` files and both forms: accept `?cashAccount=<id>` as the origin (preselect if Aktif, back link "Hesaba dön" to `/cash-accounts/:id`)
- Modify: `src/lib/nav.ts`
- Modify: `src/components/amount-input.tsx` (`allowNegative?: boolean`: tidy with `parseSignedAmountInput`)

**Interfaces:**
- Consumes: fetches and types from Task 1; `cashAccount` filters and `cashAccountName` from Task 2.
- Produces: `PaymentsSection({ of, id }: { of: "counterparty" | "cashAccount"; id: number })`, which leaves out the column that is always the same (Cari on a cari page, Kasa - Banka on an account page) and links rows to `/payments/:pid/edit?<of>=<id>`.

- [ ] **Step 1: Nav.** `{ title: "Kasa - Banka", href: "/cash-accounts", icon: Vault }` as the first Finans child.

- [ ] **Step 2: List page** like `projects.tsx`: columns İsim (link to details; `PassiveTag` when Pasif), Bakiye (right-aligned, `formatAmount`, negative shown in `text-destructive`), Durum; search with `foldTr`; status select "Aktif hesaplar / Pasif hesaplar / Tümü" (default Aktif, `?status=`); Sütunlar toggle with table id `cash-accounts`; `TableTotalFooter` over Bakiye; "Kasa - Banka Ekle" button; `rememberListSearch`. Server `page.tsx` prefetches `["cash-accounts"]` and reads `getSavedColumnVisibility("cash-accounts")`.

- [ ] **Step 3: Form** (new/edit): İsim *, Başlangıç Bakiyesi (`AmountInput allowNegative`, empty allowed; on edit shows `amountToInput(openingBalance)`), Aktif checkbox (default on). `cashAccountFormSchema` + `cashAccountToApi`; a 409 `field: "name"` shows under İsim. Invalidate `["cash-accounts"]`, `["payments"]`, `["collections"]` on success.

- [ ] **Step 4: Details page:** header card with İsim, Bakiye (large), `InfoFields` Başlangıç Bakiyesi / Durum, buttons Düzenle, Aktif/Pasif toggle (PATCH with the current fields), Sil (`delete-cash-account-button.tsx` like Projeler's, showing the 409 text). Below: `PaymentsSection of="cashAccount"` and `CollectionsSection of="cashAccount"`, whose "Ödeme Ekle" / "Tahsilat Ekle" links pass `?cashAccount=<id>` (hidden when the account is Pasif).

- [ ] **Step 5: `pnpm exec next typegen`**, then lint, tsc, `pnpm test --run`.

- [ ] **Step 6: Verify in the browser:** the sidebar order; create an account with "-1.250,50"; check that the list, details and Toplam show "−₺1.250,50" correctly; add an ödeme from the details page and check that you land back there and the Bakiye moves; check the delete refusal message; check Pasif hides it from the form picker.

- [ ] **Step 7: Commit** `feat: Kasa - Banka pages under Finans`.

---

### Task 4: Docs

**Files:**
- Modify: `CLAUDE.md` (Domain notes: new Kasa - Banka bullet with the computed Bakiye rule, Aktif/Pasif rule, delete refusal and `{kasa}`; Ödemeler/Tahsilatlar bullets say Kasa - Banka instead of Ödeme/Tahsilat Tipi; Parametreler bullet: "five name-only lists" → three, Tahsilat Türü / Ödeme Türü say what the money is for, the Tipi sentence goes)
- Modify: `docs/superpowers/specs/2026-11-23-cash-accounts-design.md` only if implementation diverged

- [ ] **Step 1: Edit CLAUDE.md** as listed. Check `grep -rn "Tipi\|method" CLAUDE.md docs/*.md` returns nothing stale (old specs stay as history).
- [ ] **Step 2: Commit** `docs: Kasa - Banka in CLAUDE.md` together with the spec, plan and `docs/could-have.md` entry if not yet committed.
