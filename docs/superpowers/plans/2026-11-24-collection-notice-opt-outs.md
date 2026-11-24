# Tahsilat Notice Opt-outs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two switches per panel user, Tahsilat SMS'i and Tahsilat E-postası. Each one stops that user's staff tahsilat notice on that channel.

**Architecture:** Two boolean columns on `user`, read by `sendCollectionNotices` and set through a new Hono route that audits in the same transaction. Panel Kullanıcıları shows them in a column and flips them from the row menu.

**Tech Stack:** Next.js 16, Hono, Drizzle (Postgres), better-auth (admin plugin), TanStack Query / Table v9, vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-collection-sms-opt-out-design.md`

## Global Constraints

- Columns: `collection_sms` and `collection_email`, both `boolean NOT NULL DEFAULT true`. The migration only adds columns; existing accounts keep getting both.
- Only the **staff** tahsilat SMS/email change. Login codes, phone verification codes, verification links, password reset emails and the yetkili's notices are untouched.
- Audit labels: "Tahsilat SMS'i" / "Tahsilat E-postası", values "Açık" / "Kapalı".
- UI text is Turkish; code, comments and commits are English. Run tests through `pnpm test --run`.
- Every task ends with `pnpm lint` and `pnpm exec tsc --noEmit` clean.

## Calls settled while planning (from the spec's "left to the builder")

- An opted-out user is **left out** of that channel's staff list, so they don't appear in the `collection_notice` counts at all (no new outcome kind).
- No hint on the Ayarlar → Bildirimler templates (YAGNI; the Panel Kullanıcıları column says it).

## Review Focus

- A disabled (banned) user with both switches on still gets nothing, and the recorder still gets nothing (existing rules must survive the new filter). Covered in Task 1's test.
- A PATCH body `{}` or with non-boolean values → 400, not a silent no-op. Task 2.
- Flipping your **own** row is allowed (unlike disable/delete): staff opt themselves out. Task 3 shows the actions on every row.
- `input: false` on the additional fields: better-auth's `admin.updateUser` must not be a second, unaudited way to change them. Task 2's test.
- A user with both off: the column says "Kapalı" and the notice goes to nobody else by mistake. Task 1's test covers the sending side.

---

### Task 1: Columns and sending filter

**Files:**
- Modify: `src/db/schema.ts` (`userTable`, after `twoFactorEnabled`)
- Modify: `src/lib/auth.ts` (`user.additionalFields`)
- Modify: `src/lib/collection-notices.ts` (`sendCollectionNotices`)
- Create: `drizzle/<timestamp>_<name>/` (generated)
- Test: `src/lib/collection-notices.test.ts`

**Interfaces:**
- Produces: `userTable.collectionSms` and `userTable.collectionEmail` (boolean, not null, default true); better-auth user fields `collectionSms` / `collectionEmail` (`type: "boolean"`, `required: false`, `defaultValue: true`, `input: false`).

- [ ] **Step 1: Write the failing test** in `collection-notices.test.ts`. Extend `insertUser(key, phone, banned = false, prefs: { collectionSms?: boolean; collectionEmail?: boolean } = {})` to spread `prefs` into the insert. In `beforeAll` add users `smsKapali` (`+905320000004`, `{ collectionSms: false }`), `epostaKapali` (`+905320000005`, `{ collectionEmail: false }`) and `ikisiKapali` (`+905320000006`, both false). The existing banned user `engelli` already covers disabled accounts.

```ts
it("leaves each panel user out of the channels they turned off", async () => {
  await sendCollectionNotices(collection(), actor);

  expect(emailsTo(`__test__smsKapali-${suffix}@example.com`)).toHaveLength(1);
  expect(sentSms.some((sms) => sms.no === "5320000004")).toBe(false);

  expect(emailsTo(`__test__epostaKapali-${suffix}@example.com`)).toEqual([]);
  expect(sentSms.some((sms) => sms.no === "5320000005")).toBe(true);

  expect(emailsTo(`__test__ikisiKapali-${suffix}@example.com`)).toEqual([]);
  expect(sentSms.some((sms) => sms.no === "5320000006")).toBe(false);

  // the existing rules still hold
  expect(emailsTo(`__test__engelli-${suffix}@example.com`)).toEqual([]);
  expect(sentSms.some((sms) => sms.no === "5320000001")).toBe(false);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test --run collection-notices`
Expected: FAIL. It fails as a TS/DB error on the unknown `collectionSms` column, or on the assertions once the insert ignores it.

- [ ] **Step 3: Add the columns** to `userTable`: `collectionSms: boolean("collection_sms").default(true).notNull()` and `collectionEmail: boolean("collection_email").default(true).notNull()`. Add them to `additionalFields` in `auth.ts`, with a comment: set only through `PATCH /api/panel-users/:id/collection-notices`, which audits.

- [ ] **Step 4: Apply and generate**

Run: `pnpm db:push`, then `pnpm db:generate`.
Expected: the migration SQL is exactly two `ALTER TABLE "user" ADD COLUMN … boolean DEFAULT true NOT NULL`, with no drops.

- [ ] **Step 5: Filter in `sendCollectionNotices`.** Select `collectionSms` / `collectionEmail` in the staff query. Map emails over `staff.filter((u) => u.collectionEmail)` and SMS over `staff.filter((u) => u.collectionSms)`. Update the doc comment: users who turned a channel off get nothing on it.

- [ ] **Step 6: Run the tests and see them pass**

Run: `pnpm test --run collection-notices collections`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/lib/auth.ts src/lib/collection-notices.ts src/lib/collection-notices.test.ts drizzle/
git commit -m "feat: panel users can be left out of tahsilat SMS or email"
```

### Task 2: Route to flip the switches

**Files:**
- Modify: `src/lib/zod-schemas/panel-user.ts`
- Modify: `src/app/api/[[...route]]/panel-users.ts`
- Modify: `src/lib/audit-labels.ts` (`panel_user` actions)
- Test: `src/app/api/[[...route]]/panel-users.test.ts`

**Interfaces:**
- Consumes: `userTable.collectionSms` / `collectionEmail` (Task 1).
- Produces: `collectionNoticesSchema = z.object({ sms: z.boolean().optional(), email: z.boolean().optional() })`, refined so at least one is present ("Değiştirilecek bir ayar seçin"). The route is `PATCH /api/panel-users/:id/collection-notices` → `200 { message: "Tahsilat bildirimleri güncellendi" }`, `404 { error: "Kullanıcı bulunamadı" }`, `400` on a bad body. Audit action: `collection_notices`.

- [ ] **Step 1: Write the failing tests** in a new `describe("PATCH /api/panel-users/:id/collection-notices")`. Use the existing `request`, `newUser` and `lastEntry` helpers.

```ts
it("turns the SMS off and logs only that change", async () => {
  const target = await newUser();
  const res = await request("PATCH", `/${target.id}/collection-notices`, { sms: false });
  expect(res.status).toBe(200);
  const [user] = await db
    .select({ sms: userTable.collectionSms, email: userTable.collectionEmail })
    .from(userTable).where(eq(userTable.id, target.id));
  expect(user).toEqual({ sms: false, email: true });
  expect(await lastEntry("collection_notices", target.id)).toMatchObject({
    entityType: "panel_user",
    entityLabel: "__test__ Kullanıcı",
    changes: [{ label: "Tahsilat SMS'i", from: "Açık", to: "Kapalı" }],
  });
});

it("turns the email off and back on, one entry each", async () => { /* email:false then email:true; the last entry is
  [{ label: "Tahsilat E-postası", from: "Kapalı", to: "Açık" }] */ });

it("logs nothing when nothing changes", async () => {
  const target = await newUser();
  const res = await request("PATCH", `/${target.id}/collection-notices`, { sms: true, email: true });
  expect(res.status).toBe(200);
  expect(await lastEntry("collection_notices", target.id)).toBeUndefined();
});

it("refuses an empty body or non-boolean values", async () => {
  // {} → 400; { sms: "false" } → 400
});

it("returns 404 for an unknown user", async () => { /* "/__test__nobody/collection-notices", { sms: false } → 404 */ });

it("can't be changed through better-auth's update-user", async () => {
  const target = await newUser();
  await auth.api.adminUpdateUser({ headers: cookies, body: { userId: target.id, data: { collectionSms: false } } }).catch(() => {});
  // still true, whether better-auth rejected the field or ignored it
  const [user] = await db.select({ sms: userTable.collectionSms }).from(userTable).where(eq(userTable.id, target.id));
  expect(user.sms).toBe(true);
});
```

(If `auth.api.adminUpdateUser` has a different name in the installed better-auth version, look it up via the better-auth MCP docs. It's the server form of `/admin/update-user`.)

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test --run panel-users`
Expected: the new tests FAIL with 404 (route missing). The update-user test may already pass.

- [ ] **Step 3: Implement the route** after `.put("/:id/phone", …)`, validated with `collectionNoticesSchema`. Read `{ name, collectionSms, collectionEmail }` and return 404 if the user is missing. In `db.transaction`, update only the given keys, then compute `diffFields(COLLECTION_NOTICE_FIELDS, { sms: before.collectionSms, email: before.collectionEmail }, body)` with
  `COLLECTION_NOTICE_FIELDS = { sms: { label: "Tahsilat SMS'i", format: onOff }, email: { label: "Tahsilat E-postası", format: onOff } }` and `onOff = (v: unknown) => (v ? "Açık" : "Kapalı")`. When the diff isn't empty, call `recordAudit(tx, { actor: actorOf(c), action: "collection_notices", entityType: "panel_user", entityId: id, entityLabel: name, changes })`. Update the comment above `panelUsersRoute` to list this route.

- [ ] **Step 4: Add the audit label**: `collection_notices: "Panel kullanıcısının tahsilat bildirimleri değiştirildi"` under `panel_user`.

- [ ] **Step 5: Run the tests and see them pass**

Run: `pnpm test --run panel-users audit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/zod-schemas/panel-user.ts "src/app/api/[[...route]]/panel-users.ts" "src/app/api/[[...route]]/panel-users.test.ts" src/lib/audit-labels.ts
git commit -m "feat: route to switch a panel user's tahsilat notices"
```

### Task 3: Panel Kullanıcıları column and row actions

**Files:**
- Modify: `src/lib/fetches/panel-user.ts`
- Modify: `src/app/(panel)/panel-users/panel-users.tsx`
- Modify: `src/app/(panel)/panel-users/_components/row-actions.tsx`

**Interfaces:**
- Consumes: the route from Task 2; `collectionSms` / `collectionEmail` on listed users (Task 1's additional fields).
- Produces: `PanelUser` gains `collectionSms: boolean; collectionEmail: boolean`. Adds `setPanelUserCollectionNotices(userId: string, values: { sms?: boolean; email?: boolean }): Promise<void>` (RPC `$patch`, `throwResponseError(res, "Tahsilat bildirimleri güncellenemedi")`).

- [ ] **Step 1: Fetch function and type.** Add both fields to `PanelUser` and update its doc comment (they're additional fields too). Add `setPanelUserCollectionNotices`.

- [ ] **Step 2: Column.** After "Durum", add `helper.accessor(collectionNoticesLabel, { id: "collectionNotices", header: "Tahsilat Bildirimleri", enableSorting: false })`, where `collectionNoticesLabel(user)` is `"SMS, E-posta"`, `"SMS"`, `"E-posta"` or `"Kapalı"`. Render "Kapalı" with `text-muted-foreground`. It's hideable through the existing Sütunlar toggle (no default change).

- [ ] **Step 3: Row actions, on every row including your own.** Add two `DropdownMenuItem`s after "Telefonu değiştir", each backed by its own `useMutation`, invalidating `["panel-users"]`:
  - `user.collectionSms ? "Tahsilat SMS'ini kapat" : "Tahsilat SMS'ini aç"`, icon `MessageSquareOff` / `MessageSquare`. The success notice is `` `${user.name} artık tahsilat SMS'i almayacak.` `` / `` `${user.name} tekrar tahsilat SMS'i alacak.` ``
  - `user.collectionEmail ? "Tahsilat e-postasını kapat" : "Tahsilat e-postasını aç"`, icon `MailX` / `Mail`. The notice says "tahsilat e-postası" in the same way.

  Errors go to `onNotice({ tone: "error", … })` like `toggleDisabled`. Update the component's doc comment: your own row also offers the tahsilat switches.

- [ ] **Step 4: Static checks**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm test --run panel-users collection-notices`
Expected: all clean / PASS

- [ ] **Step 5: Click through in dev.** Log in with a dev session (memory: test-panel-in-dev) and open `/panel-users`. Flip both switches on a row: the column updates and a toast shows. Check the newest Denetim Kayıtları entries say "Panel kullanıcısının tahsilat bildirimleri değiştirildi" with the right change. Flip them back, then delete the dev session row.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fetches/panel-user.ts "src/app/(panel)/panel-users/"
git commit -m "feat: switch tahsilat SMS and email per panel user"
```

### Task 4: Docs

- [ ] **Step 1:** In `CLAUDE.md`, in the paragraph on tahsilat notices ("A new tahsilat notifies the yetkili … and every other active panel user …"), add: panel users who have Tahsilat SMS'i or Tahsilat E-postası off (Panel Kullanıcıları row actions, `user.collection_sms` / `collection_email`, audited as `panel_user` / `collection_notices`) get nothing on that channel; account messages (login codes, verification) are unaffected.
- [ ] **Step 2: Commit** `docs: note the tahsilat notice opt-outs`
