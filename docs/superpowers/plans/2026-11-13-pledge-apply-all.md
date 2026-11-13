# Taahhütler apply-to-all Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A checkbox in `PledgesEditor` that spreads Adet/Tutar edits to every row.
**Spec:** `docs/superpowers/specs/2026-11-13-pledge-apply-all-design.md`

## Global Constraints
- Label "Adet ve tutarı tüm satırlara uygula"; unticked on load; Yetkili untouched.
- No API, schema or audit change.

## Review Focus
1. Spread values mark the form dirty (save bar appears on the details page) and are saved.
2. The input being typed in keeps focus while other rows update.
3. Tutar reformatting on blur ("1250" → "1.250,00") spreads consistently.
4. A row added while ticked copies the last row's Adet/Tutar; unticked it starts at Adet 1, empty Tutar.
5. Field errors on other rows clear when the spread value is valid.

### Task 1: New-row helper
- [ ] Test in `src/lib/pledges.test.ts`: `newPledgeRow([], true)` → `{ representativeId: null, quantity: "1", amount: "" }`; `newPledgeRow(rows, false)` same; `newPledgeRow([{…, quantity: "3", amount: "50,00"}], true)` → quantity "3", amount "50,00", representativeId null. RED → implement `newPledgeRow(rows: readonly PledgeFormRow[], applyToAll: boolean): PledgeFormRow` in `src/lib/pledges.ts` → GREEN.

### Task 2: Editor
- [ ] `PledgesEditor` gets `setValue: UseFormSetValue<T>` (callers: `project-form.tsx`, `project-pledges.tsx`), a `Checkbox` with the label, and on Adet/Tutar change while ticked calls `setValue` for every other row with `{ shouldDirty: true, shouldValidate: <row field currently has an error> }`. "Taahhüt ekle" uses `newPledgeRow`.
- [ ] tsc, lint; dev panel check of the Review Focus items on the details page and the create form. Commit.
