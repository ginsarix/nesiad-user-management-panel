# SMS Login Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every panel login needs a 6-digit code texted to the account's verified mobile number (email as backup), and every number is verified by SMS code when an account is created or its number changes.

**Architecture:** better-auth's `twoFactor` plugin (OTP part only) adds the code step after `/sign-in/email`. A local guard plugin closes the plugin's other endpoints, enforces the resend cooldown and account lock, and stops the browser from writing `phone` / `twoFactorEnabled` through the admin endpoints. Number verification is a Hono flow in `panel-users.ts` with its own codes in the `verification` table. Account creation now goes through that Hono route, which calls `auth.api.createUser` server-side with the admin's headers.

**Tech Stack:** Next.js 16, better-auth 1.7.12 (`twoFactor`, `admin`), Hono RPC, Drizzle (Postgres), react-hook-form + zod, NetGSM client in `src/lib/sms/netgsm.ts`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-sms-login-verification-design.md`. Read it first. This plan covers **deploy 1 only**. Deploy 2 (`phone NOT NULL`, removing the "no number → email" path) is a separate later PR.

## Global Constraints

- Code lifetime 5 minutes, for both login and number codes (`otpOptions.period: 5`).
- Codes are 6 digits, stored hashed (`storeOTP: "hashed"`; number codes as SHA-256 hex).
- 5 wrong tries per code (`allowedAttempts: 5`).
- 1 new code per minute per pending login and per (admin session, number).
- 10 wrong login codes in a row lock the account's code step for 15 minutes; a successful login resets the count.
- No "remember this device": `trustDevice` is refused server-side.
- Codes never appear in the audit log or server logs. The only exception is a number code in `SMS_DRY_RUN`, printed with a `DRY RUN` prefix.
- Phone numbers in the audit log are masked to the last 4 digits: `••• ••• 45 67`.
- Phones are stored normalized (`5XXXXXXXXX`) via `normalizePhone` (`src/lib/sms/phone.ts`).
- In `SMS_DRY_RUN`, login codes go by email.
- UI text is Turkish, and code/comments/commits are English. Use pnpm, and run tests only through `pnpm test --run`.
- Test records are named `__test__…` and cleaned up in `afterAll`. Never assert whole-table counts.
- Every Hono mutation writes `recordAudit(tx, …)` in the same transaction.
- No real phone numbers in any committed file. Use `5550000000`-style fakes in tests.

## Review Focus

1. **A person retypes their password while an earlier code is pending.** The old code must stop working and the new one must work, with no 500. Test: Task 3.
2. **A number entered in different formats** (`0532 123 45 67`, `+90 532 123 4567`, `5321234567`). A code sent for one format verifies the same number typed in another. Test: Task 6.
3. **NetGSM throws** (timeout or network error) rather than returning an error code. The login code still goes out by email. Test: Task 2.
4. **The 10-minute pending-login cookie expires** while the person is on the code step. They get a clear "start again" message and are returned to the password step, not shown a generic error. Test: Task 8 (`authErrorMessage`) plus manual check.
5. **The account is locked** and the person presses "e-postayla gönder". This is refused with the lock message and no code is sent. Test: Task 4.

---

### Task 1: Data model and migration

**Files:**
- Modify: `src/db/schema.ts`: add to `userTable` `phone: text("phone")` and `twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull()`. Add `twoFactorTable` (`two_factor`) matching better-auth's two-factor schema (`node_modules/better-auth/dist/plugins/two-factor/schema.mjs`):
  - `id` text pk
  - `secret` text not null
  - `backup_codes` text not null
  - `user_id` text not null, FK `user.id` `on delete cascade`, indexed
  - `verified` boolean default true
  - `failed_verification_count` integer default 0
  - `locked_until` timestamp null
- Modify: `src/lib/auth.ts`: add `twoFactor: twoFactorTable` to the `drizzleAdapter` `schema` map.
- Modify: `src/lib/sms/phone.ts`: add `maskPhone`.
- Test: `src/lib/sms/phone.test.ts`
- Create: `drizzle/<generated>.sql`

**Interfaces:**
- Produces: `userTable.phone`, `userTable.twoFactorEnabled`, `twoFactorTable`, and `maskPhone(phone: string | null): string` in `src/lib/sms/phone.ts`.

- [ ] **Step 1: Write the failing test** in `phone.test.ts`

```ts
describe("maskPhone", () => {
  it("keeps only the last 4 digits", () => {
    expect(maskPhone("5321234567")).toBe("••• ••• 45 67");
  });
  it("shows a dash for no number", () => {
    expect(maskPhone(null)).toBe("—");
  });
});
```

- [ ] **Step 2:** Run `pnpm test --run phone`. Expected: FAIL (`maskPhone` not exported).
- [ ] **Step 3:** Implement `maskPhone` and the schema changes above.
- [ ] **Step 4:** Run `pnpm test --run phone`. Expected: PASS.
- [ ] **Step 5:** Run `pnpm db:push` (development DB). If push stops with `missing_hints`, follow CLAUDE.md. Then set dev rows: `psql "$DATABASE_URL" -c 'UPDATE "user" SET two_factor_enabled = true'`.
- [ ] **Step 6:** Run `pnpm db:generate`. Then **hand-add** to the end of the generated SQL file:

```sql
--> statement-breakpoint
UPDATE "user" SET "two_factor_enabled" = true;
```

- [ ] **Step 7:** Check the migration. `grep -n 'two_factor_enabled\|"phone"\|CREATE TABLE "two_factor"' drizzle/*.sql | tail` must show all three, and the file must contain no `DROP` or `ALTER COLUMN … TYPE`.
- [ ] **Step 8:** Run `pnpm exec tsc --noEmit`. Expected: no errors.
- [ ] **Step 9:** Commit with the message `feat: add phone and two-factor columns to panel users`.

---

### Task 2: Login code delivery

**Files:**
- Create: `src/lib/login-code.ts`
- Test: `src/lib/login-code.test.ts`

**Interfaces:**
- Consumes: `netgsmClient()` and `decodeSendResponse()` from `src/lib/sms/netgsm.ts`, and `sendEmail` from `src/lib/mail.ts`.
- Produces:

```ts
export type LoginCodeChannel = "sms" | "email" | "email_fallback";
/** Sends `code`; never throws for SMS problems (falls back to email). Throws only if the email also fails. */
export async function deliverLoginCode(input: {
  user: { name: string; email: string; phone: string | null };
  code: string;
  emailOnly: boolean;
}): Promise<LoginCodeChannel>;
/** Exact copy, used by Task 6 too */
export function loginCodeSms(code: string): string; // "Dernek Üye Paneli giriş kodunuz: 123456. Kod 5 dakika geçerlidir."
export function phoneCodeSms(code: string): string; // "Dernek Üye Paneli telefon doğrulama kodunuz: 123456. Kod 5 dakika geçerlidir."
```

Rules:
- `emailOnly` → `"email"`.
- No phone, `client.dryRun`, a send that throws, or `decodeSendResponse` returning `ok: false` → email, and the result is `"email_fallback"`. The cause is `console.error`'d **without** the code.
- Otherwise → `"sms"`.
- Email subject: `Dernek Üye Paneli Giriş Kodu`. Body: `Merhaba {name}, giriş kodunuz: {code}. Kod 5 dakika geçerlidir. Bu girişi siz yapmadıysanız şifrenizi değiştirin.`

- [ ] **Step 1: Write failing tests.** `vi.mock("@/lib/mail")` and `vi.mock("@/lib/sms/netgsm", async (orig) => ({ ...(await orig()), netgsmClient: vi.fn() }))`. One `it` per row:
  - real client returning `{ status: 200, body: { code: "00", jobid: "1" } }` → `"sms"`, `send` called with `[{ no: "5550000000", msg: loginCodeSms("123456") }]`, `sendEmail` not called
  - `emailOnly: true` → `"email"`, `send` not called
  - `phone: null` → `"email_fallback"`
  - `fakeNetgsmClient` (dry run) → `"email_fallback"`, `send` not called
  - `send` rejects with `new Error("timeout")` → `"email_fallback"` (Review Focus 3)
  - NetGSM code `"30"` → `"email_fallback"`
  - In every email case, `sendEmail.mock.calls[0][0].text` contains `"123456"`.
- [ ] **Step 2:** Run `pnpm test --run login-code`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/login-code.ts`.
- [ ] **Step 4:** Run `pnpm test --run login-code`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: deliver login codes by SMS with email fallback`.

---

### Task 3: Turn on the code step

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth-client.ts`: add `twoFactorClient()` with no `onTwoFactorRedirect`.
- Create: `src/test/login.ts` (test helper)
- Create: `src/lib/two-factor-login.test.ts`
- Modify: `src/lib/auth.test.ts`, `src/lib/auth-plugins/audit.test.ts`, `src/lib/auth-plugins/initial-password.test.ts`. Any test that expects a session straight from `signInEmail` now uses the helper.

**Interfaces:**
- Consumes: `deliverLoginCode` (Task 2) and `userTable.phone` (Task 1).
- Produces:
  - **Auth config:**
    - `twoFactor({ otpOptions: { sendOTP, period: 5, digits: 6, allowedAttempts: 5, storeOTP: "hashed" } })`, placed **before** `auditLog()` in `plugins`.
    - `user.additionalFields.phone = { type: "string", required: false, input: false }`.
    - `databaseHooks.user.create.before` returns `{ data: { ...user, twoFactorEnabled: true } }`.
  - **Email-only channel:** `sendOTP` reads it from the request query `channel=email` (`ctx?.query?.channel === "email"`). If the test in Step 1 shows the query doesn't reach `sendOTP`, use the header `x-login-code-channel: email` instead, and note it in the Task 8 client call.
  - **Hand-off to Task 5:** `sendOTP` records the channel it used with `rememberLoginCodeChannel(ctx, channel)` (Task 5 creates it). Until then, leave a `// Task 5` placeholder call to a no-op exported from `src/lib/auth-plugins/audit.ts`.
  - **Test helpers** in `src/test/login.ts`:
    - `startLogin(email, password): Promise<Headers>`: cookie headers carrying the pending `two_factor` cookie.
    - `lastEmailedCode(): string`: the newest 6-digit code in the mocked `sendEmail` calls.
    - `completeLogin(email, password): Promise<Headers>`: session cookie headers. It calls `sendTwoFactorOTP` and then `verifyTwoFactorOTP` with `lastEmailedCode()`.
    - Callers must `vi.mock("@/lib/mail")`.

- [ ] **Step 1: Write failing tests** in `two-factor-login.test.ts`. Mock mail. Users are created with `auth.api.createUser` (`__test__` emails) and their email is marked verified via `db.update`.
  - `signInEmail` with the right password: the response body has `twoFactorRedirect: true`, there is no `better-auth.session_token` in set-cookie, and the user row has `twoFactorEnabled === true`. This is set by the database hook, not by the test.
  - `sendTwoFactorOTP` then `verifyTwoFactorOTP({ code: lastEmailedCode() })`: 200, and a session cookie is set.
  - Wrong code 5 times, then the right code: the last call fails with code `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`.
  - Expired code: `vi.setSystemTime(Date.now() + 5 * 60_000 + 1000)` before verify. The call fails with `OTP_HAS_EXPIRED`.
  - Send with `?channel=email` while the user has a phone and a mocked real NetGSM client: `sendEmail` is called and `send` is not.
  - Review Focus 1: `startLogin` and send (code A), then a second `startLogin` and send (code B). Verifying A with the second cookie fails with 4xx. Verifying B succeeds.
- [ ] **Step 2:** Run `pnpm test --run two-factor-login`. Expected: FAIL.
- [ ] **Step 3:** Implement the auth config, the client plugin and `src/test/login.ts`. Update the three existing test files to use `completeLogin` where they need a session.
- [ ] **Step 4:** Run `pnpm test --run two-factor-login auth initial-password`. Expected: PASS. The `audit` login cases may still fail until Task 5. Mark those with `it.todo` there **only** if they assert the old `login` row from `/sign-in/email`, and Task 5 restores them.
- [ ] **Step 5:** Commit with the message `feat: require an SMS code after the password`.

---

### Task 4: Guard plugin

**Files:**
- Create: `src/lib/auth-plugins/two-factor-guard.ts`, added to `plugins` in `auth.ts` right after `twoFactor(...)`.
- Create: `src/lib/auth-plugins/pending-login.ts`
- Test: `src/lib/auth-plugins/two-factor-guard.test.ts`
- Modify: `src/lib/auth-errors.ts`

**Interfaces:**
- Produces:
  - `pendingLoginUser(ctx): Promise<{ key: string; user: { id: string; name: string; email: string } } | null>` in `pending-login.ts`. It reads the signed `two_factor` cookie: `ctx.getSignedCookie(ctx.context.createAuthCookie("two_factor").name, ctx.context.secret)`, then `internalAdapter.findVerificationValue(key)`, then `findUserById`. Task 5 uses it too.
  - `twoFactorGuard(): BetterAuthPlugin`, with id `"two-factor-guard"`.
  - Error codes:
    - `LOGIN_CODE_RESEND_TOO_SOON` (429)
    - `ACCOUNT_TEMPORARILY_LOCKED` (429, the plugin's code reused)
    - `NOT_ALLOWED` (403)

**Before hooks:**

| Path | Rule |
|---|---|
| `/two-factor/enable`, `/disable`, `/get-totp-uri`, `/verify-totp`, `/generate-backup-codes`, `/verify-backup-code` | always 404 `NOT_FOUND` |
| `/two-factor/send-otp`, `/two-factor/verify-otp` | `body.trustDevice` truthy → 403; no pending login (`pendingLoginUser` null) → 401 `INVALID_TWO_FACTOR_COOKIE`; account locked → 429 `ACCOUNT_TEMPORARILY_LOCKED` |
| `/two-factor/send-otp` | a verification row `login-code-sent:{key}` with `expiresAt > now` → 429 `LOGIN_CODE_RESEND_TOO_SOON`; otherwise create it with `expiresAt = now + 60s` |
| `/admin/create-user` | `ctx.request` present (a browser call) → 403. Server-side `auth.api.createUser` calls pass. |
| `/admin/update-user` | any key of `body.data` other than `name` → 403 |
| `/update-user` | `phone` or `twoFactorEnabled` in body → 403 |

**After hook on `/two-factor/verify-otp`:**
- Failure with `INVALID_CODE` increments the verification row `login-code-failures:{userId}`. The value is the count. `expiresAt` is `now + 24h`, and when the count reaches 10 it becomes `now + 15min`.
- Success deletes that row.
- "Locked" means the row exists, its value is ≥ 10, and its `expiresAt` is in the future.

**`auth-errors.ts`:** check `code` **before** the generic 429 message, and add these codes:
- `LOGIN_CODE_RESEND_TOO_SOON`: "Yeni kod istemek için bir dakika bekleyin."
- `ACCOUNT_TEMPORARILY_LOCKED`: "Çok fazla hatalı kod girildi. 15 dakika sonra tekrar deneyin."
- `INVALID_CODE`: "Kod hatalı."
- `OTP_HAS_EXPIRED`: "Kodun süresi doldu. Yeni kod isteyin."
- `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`: "Bu kod için deneme hakkınız doldu. Yeni kod isteyin."
- `INVALID_TWO_FACTOR_COOKIE`: "Giriş süresi doldu. Lütfen e-posta ve şifrenizle yeniden giriş yapın."

- [ ] **Step 1: Write failing tests.** Use the Task 3 helpers and a mocked mail module. One `it` each:
  - each blocked `/two-factor/*` path → 404. Call through `auth.handler(new Request("http://localhost:3000/api/auth/two-factor/enable", { method: "POST", headers, body: "{}" }))`, with the session headers from `completeLogin`.
  - `verifyTwoFactorOTP({ body: { code, trustDevice: true } })` → 403, and no `trust_device` cookie
  - `sendTwoFactorOTP({ body: { trustDevice: true } })` → 403
  - send twice within a minute → the second is 429 `LOGIN_CODE_RESEND_TOO_SOON`. After `vi.setSystemTime(+61s)` it is allowed.
  - 10 wrong codes across fresh logins → the 11th verify **and** a send with `?channel=email` both give 429 `ACCOUNT_TEMPORARILY_LOCKED`, and `sendEmail` is not called (Review Focus 5). After `+15min` the right code works, and the failure row is gone.
  - a browser `POST /api/auth/admin/create-user` via `auth.handler` with admin session headers → 403. `auth.api.createUser({ body, headers })` → OK.
  - `admin.updateUser` with `data: { phone: "5550000000" }` → 403, and with `data: { twoFactorEnabled: false }` → 403. With `data: { name: "__test__ Yeni" }` → OK.
  - `/update-user` with `{ phone }` → 403
- [ ] **Step 2:** Run `pnpm test --run two-factor-guard`. Expected: FAIL.
- [ ] **Step 3:** Implement `pending-login.ts`, `two-factor-guard.ts` and the `auth-errors.ts` changes.
- [ ] **Step 4:** Run `pnpm test --run two-factor-guard two-factor-login auth`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: lock down two-factor and admin endpoints`.

---

### Task 5: Audit entries for the code step

**Files:**
- Modify: `src/lib/auth-plugins/audit.ts`
- Modify: `src/lib/audit-labels.ts`
- Modify: `src/lib/auth-plugins/audit.test.ts`

**Interfaces:**
- Consumes: `pendingLoginUser` (Task 4) and `LoginCodeChannel` (Task 2).
- Produces: `rememberLoginCodeChannel(ctx: { context: object }, channel: LoginCodeChannel): void`. This is a WeakMap keyed by `ctx.context`, the same pattern as `usersBefore`. It replaces the Task 3 no-op.

**Behavior:**
- `/sign-in/email`:
  - failed (APIError ≥ 400) → `login_failed`, as today
  - not failed and no `newSession` → **no entry**, because the code step is pending
  - `newSession` present → `login`, as today; this only happens for a user with 2FA off
- before `/two-factor/verify-otp`: store `pendingLoginUser(ctx)` in a WeakMap.
- after `/two-factor/send-otp`, success → `login_code_sent`. Actor and entity are the pending user, `entityType: "auth"`. Details: `[{ label: "Kanal", value: "SMS" | "E-posta" | "E-posta (SMS gönderilemedi)" }]`.
- after `/two-factor/verify-otp`:
  - success → `login`, with the actor from `newSession.user`
  - failure → `login_code_failed`, with details `[{ label: "Neden", value: authErrorMessage(...) }]`
- Labels in `auth`:
  - `login_code_sent`: "Giriş kodu gönderildi"
  - `login_code_failed`: "Hatalı giriş kodu"
- Labels in `panel_user`:
  - `phone_code_sent`: "Telefon doğrulama kodu gönderildi"
  - `phone_change`: "Panel kullanıcısının telefonu değiştirildi"

  The `panel_user` labels are used in Task 6.

- [ ] **Step 1: Write failing tests** (audit rows filtered by the test user's id):
  - correct password only → no `auth` row for that user
  - full `completeLogin` → exactly one `login_code_sent` (Kanal `E-posta (SMS gönderilemedi)` under dry run) and exactly one `login`
  - a wrong code → one `login_code_failed`
  - no row's `details` / `changes` JSON contains the code
- [ ] **Step 2:** Run `pnpm test --run audit`. Expected: FAIL.
- [ ] **Step 3:** Implement the changes, and restore any `it.todo` from Task 3.
- [ ] **Step 4:** Run `pnpm test --run audit two-factor`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: audit login codes and record logins after the code`.

---

### Task 6: Number verification API

**Files:**
- Create: `src/lib/phone-code.ts` (number codes in the `verification` table)
- Modify: `src/app/api/[[...route]]/panel-users.ts`
- Modify: `src/lib/zod-schemas/panel-user.ts`
- Test: `src/lib/phone-code.test.ts`, `src/app/api/[[...route]]/panel-users.test.ts`
- Modify: `CLAUDE.md`. The "panel-user changes go through `better-auth/client` admin calls" sentence gets: "except creating an account and changing its phone, which go through `/api/panel-users` because the number must be SMS-verified first."

**Interfaces:**
- Consumes: `phoneCodeSms` (Task 2), `maskPhone` and `normalizePhone`, `netgsmClient` / `decodeSendResponse`.
- Produces `src/lib/phone-code.ts`:

```ts
/** identifier: `phone-code:{sessionId}:{phone}`; value: `{sha256hex(code)}:{attempts}`; expires in 5 min */
export async function issuePhoneCode(sessionId: string, phone: string):
  Promise<{ ok: true } | { ok: false; reason: "too_soon" | "sms_failed"; message?: string }>;
/** Consumes on success; counts a wrong try; 5 tries max */
export async function checkPhoneCode(sessionId: string, phone: string, code: string):
  Promise<"ok" | "wrong" | "expired" | "too_many">;
```

- Rules for `issuePhoneCode`:
  - "Too soon" means the row's `createdAt` is within the last 60s.
  - In dry run, `console.info("DRY RUN phone code for", maskPhone(phone), code)`.
  - An SMS failure deletes the row and returns `sms_failed` with NetGSM's message.
- Zod (`panel-user.ts`):
  - `panelUserPhoneSchema`: a string, `normalizePhone`, transformed to the normalized number. Errors: landline → "Cep telefonu numarası girin", otherwise "Geçerli bir cep telefonu numarası girin".
  - `phoneCodeSchema`: strips whitespace and must match `/^\d{6}$/`, with the message "6 haneli kodu girin".
  - `addPanelUserSchema` gains `phone` and `code`.
  - New `changePanelUserPhoneSchema = { phone, code }`.
  - API body schemas reuse these.
- Hono routes (added to the `panelUsersRoute` chain; the session is `c.get("session")`):

| Route | Body | Result |
|---|---|---|
| `POST /phone-codes` | `{ phone, userId? }` | 200 `{ message: "Kod gönderildi" }`, 429 `{ error: "Yeni kod için bir dakika bekleyin" }`, 502 `{ error: "SMS gönderilemedi: …" }`. Audit `panel_user/phone_code_sent`: entityId = userId ?? null, entityLabel = that user's name ?? "Yeni kullanıcı", details `[{ label: "Telefon", value: maskPhone(phone) }]` |
| `POST /` | `{ name, email, password, phone, code }` | `checkPhoneCode` not `ok` → 400 with the Turkish message for the reason. Otherwise `auth.api.createUser({ body: { name, email, password, role: "admin", data: { phone } }, headers: c.req.raw.headers })` → 201 `{ id }`. The audit `create` entry comes from the auth audit plugin. Add `{ label: "Telefon", value: maskPhone(user.phone) }` to its `userFields`. |
| `PUT /:id/phone` | `{ phone, code }` | 404 if no user. Code check as above. In one transaction: update `userTable.phone` and `recordAudit(tx, { action: "phone_change", changes: [change("Telefon", maskPhone(old), maskPhone(new))] })`. 200. |

Messages for `checkPhoneCode` reasons:
- `wrong`: "Kod hatalı"
- `expired`: "Kodun süresi doldu, yeni kod isteyin"
- `too_many`: "Deneme hakkı doldu, yeni kod isteyin"

- [ ] **Step 1: Write failing tests.**
  - `phone-code.test.ts`, with NetGSM mocked as in Task 2:
    - issue then check with the code captured from `send` → `"ok"`, and a second check → `"expired"`, because the code was consumed
    - wrong ×5 then right → `"too_many"`
    - issue twice within 60s → `too_soon`
    - code issued for `5550000001` and checked for `5550000002` → `"expired"`, because there is no row for that number
    - `+61s` after the first issue → allowed
  - `panel-users.test.ts`: wrap the route in a test app that sets `session` to a real admin's session from `completeLogin` (Task 3 helper). `POST /` must forward real cookies, so build the request with those headers.
    - `POST /phone-codes` with `"0555 000 00 01"`, then `POST /` with `phone: "+90 555 000 0001"` and the captured code → 201. The row's `phone === "5550000001"` and `twoFactorEnabled === true` (Review Focus 2).
    - `POST /` with a wrong code → 400 "Kod hatalı", and no user with that email exists
    - `PUT /:id/phone` with a valid code → 200, the row is updated, and a `phone_change` audit row's changes are `[{ label: "Telefon", from: "—", to: "••• ••• 00 02" }]`
    - `POST /phone-codes` with `"0384 213 00 00"` → 400 "Cep telefonu numarası girin"
    - no audit row for the test user contains the code
- [ ] **Step 2:** Run `pnpm test --run phone-code panel-users`. Expected: FAIL.
- [ ] **Step 3:** Implement `phone-code.ts`, the schemas, the routes and the audit-plugin `userFields` change. Update `CLAUDE.md`.
- [ ] **Step 4:** Run `pnpm test --run phone-code panel-users audit`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: verify panel user phone numbers by SMS code`.

---

### Task 7: Default admin phone

**Files:**
- Modify: `src/lib/env.ts`: add `DEFAULT_ADMIN_PHONE: z.string().min(1).optional()`.
- Modify: `src/lib/default-admin.ts`
- Modify: `src/lib/default-admin.test.ts`
- Modify: `.env.example`: add `DEFAULT_ADMIN_PHONE=`.
- Modify: `docs/deploy.md`: list the new env var and its meaning.

**Behavior:** when set, `DEFAULT_ADMIN_PHONE` is normalized with `normalizePhone`. If it's invalid, `ensureDefaultAdmin` throws `"DEFAULT_ADMIN_PHONE is not a valid Turkish mobile number"`. The phone is passed as `data: { phone }` to `auth.api.createUser`, and is trusted without a code. When it's unset, the admin is created without a phone and gets codes by email (deploy 1 only).

- [ ] **Step 1: Write failing tests:**
  - with `DEFAULT_ADMIN_PHONE="0555 000 00 03"` → the created row has `phone "5550000003"` and `twoFactorEnabled true`
  - with `"0384 213 00 00"` → throws
- [ ] **Step 2:** Run `pnpm test --run default-admin`. Expected: FAIL.
- [ ] **Step 3:** Implement the change.
- [ ] **Step 4:** Run `pnpm test --run default-admin`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: seed the default admin's phone from env`.

---

### Task 8: Login screen code step

**Files:**
- Modify: `src/app/(auth)/login/login-form.tsx`
- Create: `src/app/(auth)/login/code-step.tsx`
- Modify: `src/lib/auth-errors.test.ts` (create it if missing)

**Behavior:**
- On `signIn.email` success with `data.twoFactorRedirect`, the form calls `authClient.twoFactor.sendOtp()` and swaps the card content to `<CodeStep>`. The card title is "Doğrulama kodu".
- The text reads: "Telefonunuza gönderilen 6 haneli kodu girin. Kod 5 dakika geçerlidir."
- The code input uses `inputMode="numeric"` and `autoComplete="one-time-code"`.
- **Actions:**
  - "Doğrula": `twoFactor.verifyOtp({ code })`, then `router.replace(next)` and `router.refresh()`
  - "Yeni kod gönder": `sendOtp()`
  - "Kod gelmedi, e-postayla gönder": `sendOtp` with the channel from Task 3
  - "Geri" returns to the password step
- **After a send:** each successful send shows "Kod gönderildi." or "Kod e-posta adresinize gönderildi." It also disables both send links for 60s, with a countdown in the link text.
- **Errors** show through `authErrorMessage`. On `INVALID_TWO_FACTOR_COOKIE` the form returns to the password step and shows that message there (Review Focus 4).
- Use react-hook-form + zod with `phoneCodeSchema` from Task 6.

- [ ] **Step 1: Write failing tests** in `auth-errors.test.ts`:
  - `authErrorMessage({ code: "LOGIN_CODE_RESEND_TOO_SOON", status: 429 })` is the resend message, not the generic 429 one
  - the same check for `ACCOUNT_TEMPORARILY_LOCKED`
  - `INVALID_TWO_FACTOR_COOKIE` gives "Giriş süresi doldu…"
- [ ] **Step 2:** Run `pnpm test --run auth-errors`. Expected: PASS if Task 4 already did this, otherwise FAIL. Then fix it.
- [ ] **Step 3:** Implement `code-step.tsx` and the form changes.
- [ ] **Step 4: Manual check** with `pnpm dev`, logging in as a dev user. Dry run, so the code arrives by email from the dev SMTP:
  - the code step appears
  - a wrong code shows "Kod hatalı."
  - the right code lands on the panel
  - the resend is disabled for 60s
  - "Geri" works
- [ ] **Step 5:** Run `pnpm lint` and `pnpm exec tsc --noEmit`. Expected: clean.
- [ ] **Step 6:** Commit with the message `feat: add the code step to the login screen`.

---

### Task 9: Panel Kullanıcıları phone UI

**Files:**
- Modify: `src/lib/fetches/panel-user.ts`
- Create: `src/app/(panel)/panel-users/_components/phone-verification-fields.tsx`
- Modify: `src/app/(panel)/panel-users/_components/add-user-dialog.tsx`
- Create: `src/app/(panel)/panel-users/_components/change-phone-dialog.tsx`
- Modify: `src/app/(panel)/panel-users/_components/row-actions.tsx`
- Modify: `src/app/(panel)/panel-users/panel-users.tsx`

**Interfaces:**
- Consumes: the Task 6 routes via `rpcClient`, and `throwResponseError` for errors.
- Produces, in `fetches/panel-user.ts`:
  - `sendPhoneCode(input: { phone: string; userId?: string }): Promise<void>`
  - `createPanelUser(values: { name; email; password; phone; code }): Promise<{ emailError: string | null }>`. This now `POST`s `/api/panel-users`, then sends the verification email as before.
  - `changePanelUserPhone(userId: string, values: { phone; code }): Promise<void>`
- `PhoneVerificationFields` takes the react-hook-form `control` and an optional `userId`. It renders:
  - the phone input
  - a "Kod gönder" button with a 60s cooldown and "Kod gönderildi" feedback
  - the 6-digit code input, shown after a send
  - help text: "Kod bu numaraya SMS ile gider. Telefonun sahibinden kodu alıp buraya girin."

  Changing the phone after a send hides the code input again.
- The add dialog gets these fields after the email field. Its submit button becomes "Doğrula, ekle ve e-posta gönder".
- The row actions get "Telefonu değiştir", which opens the dialog with the same fields.
- The table gets a "Telefon" column showing the number formatted `0532 123 45 67`, or the text "Numara yok" via `orDash`. It joins the "Sütunlar" toggle.
- Mutations invalidate `["panel-users"]`.

- [ ] **Step 1:** Implement the fetches and components.
- [ ] **Step 2:** Run `pnpm lint` and `pnpm exec tsc --noEmit`. Expected: clean.
- [ ] **Step 3: Manual check** with `pnpm dev`. Dry run, so the number code is printed in the dev server console with `DRY RUN`:
  - add a user with a verified number
  - change a number
  - a wrong code shows "Kod hatalı"
  - the table shows the number, and "Numara yok" for a user without one
- [ ] **Step 4:** Commit with the message `feat: add and change panel user phones with SMS verification`.

---

### Task 10: Docs and full verification

**Files:**
- Modify: `docs/deploy.md`. Add a "SMS login rollout" note:
  1. Deploy 1 turns on codes; accounts without a number get them by email.
  2. Right after deploy, enter and verify the 4 staff numbers on Panel Kullanıcıları.
  3. Deploy 2 (a separate PR) makes the phone required. Before merging it, check that no production account has an empty phone, with `SELECT count(*) FROM "user" WHERE phone IS NULL` returning 0.
- Modify: `docs/production-sms.md`. Login and verification codes use the same NetGSM account and header and spend credit. If the credit runs out, login codes go by email.

- [ ] **Step 1:** Write the doc changes.
- [ ] **Step 2:** Run `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm test --run`. Expected: all pass. Report any failure with its output.
- [ ] **Step 3:** Run `pnpm build`. Expected: success.
- [ ] **Step 4:** Commit with the message `docs: SMS login rollout and production notes`.
