# SMS login verification: design

Status: draft for review, 2026-11-09.

Decisions marked **(staff)** came from the user or NESİAD management during design. Decisions marked **(my call)** are the designer's defaults and can be overruled. Everything else is left to the builder.

## Why

NESİAD management asked for a second login step as a routine security requirement, not because of an incident **(staff)**: after the correct email and password, a code texted to the person's phone. Panel accounts have no phone number today, so this also adds one to every account and makes sure that number really belongs to that person.

## What gets built

1. A required, verified mobile number on every panel account.
2. An SMS code step after the password on every login. The code also goes by email when the SMS fails or the person asks for it.
3. SMS code verification of the number whenever an account is created or its number is changed.
4. A rollout in two deploys, so no real phone numbers are committed to the repository.

## Goals

- Nobody reaches the panel with only an email and password.
- Nobody can be locked out just because NetGSM is down, the SMS credit ran out or a phone was lost. The email backup always works.
- A number is stored on an account only after a code sent to that number was entered correctly. The server enforces this, not only the form.
- The 4 existing production accounts keep working through the whole rollout.

## Non-goals

- Authenticator apps (TOTP), backup codes and passkeys.
- "Remember this device": every login asks for a code **(staff: "every login")**.
- A code step after the emailed account link. That link signs a new person in once without a password and lands on `/welcome`, and it stays as it is **(staff)**. The number was already verified when the account was created.
- A code step after a password reset. The reset doesn't sign anyone in (`revokeSessionsOnPasswordReset`), so the next normal login asks for a code anyway.
- Letting a person turn the code step off for their own account.
- Logging everyone out at deploy **(staff)**. Sessions already open when deploy 1 ships stay valid until they expire. The code step applies from each person's next login.

## Anti-goals

- Real phone numbers in a migration file or anywhere else in git **(staff)**.
- Locking everyone out on deploy day. Between the two deploys, accounts without a number get their code by email.
- Writing a code, or a full phone number, into the audit log or the server logs.

## Decisions

### Phone number on the account

- A new `phone` column on `user`, holding the normalized number (same format as members' numbers; reuse `normalizePhone` from `src/lib/sms/phone.ts`).
- Any admin can set or change any account's number, because there are no roles **(my call, follows existing panel rules)**. The person can also change their own number.
- The Panel Kullanıcıları page shows the number and has a way to set or change it.

### Verifying a number (account creation and number change) **(staff)**

- The admin enters the number and clicks a "Kod gönder" style button. A 6-digit code goes by SMS to **that number** (not by email, since the point is to prove the phone).
- Whoever holds the phone (normally the new person) reads the code to the admin, who types it in. The number is saved only if the code is right.
- On creation, the account is not created until the number is verified. The admin fills in name, email, password and number, verifies the number, and then the account is created with the number in one step. The existing verification email still goes out after that.
- The server must refuse to store a number that wasn't verified this way. That means the number can't be passed through better-auth's `admin.createUser` / `admin.updateUser` from the browser. The builder decides how: a Hono endpoint that checks the code and calls `auth.api.createUser` / updates the column, or a better-auth plugin endpoint. This is a deliberate exception to "panel-user changes go through better-auth/client admin calls" in CLAUDE.md, and the CLAUDE.md line should be updated to say so.
- A verification code is tied to the admin's session **and** the exact number, so a code sent to one number can't be used to save a different one.

### Login code step

- Uses better-auth's `twoFactor` plugin (installed version 1.7.12) with only its OTP part (`otpOptions.sendOTP`). The plugin only triggers for users with `twoFactorEnabled = true`, so that column is `true` for every account: existing rows in the migration, new accounts at creation, and the default admin.
- After a correct email and password, `signIn.email` returns `twoFactorRedirect`. The login page then shows a "Doğrulama kodu" step in the same card, with:
  - a 6-digit code box
  - a resend link
  - "Kod gelmedi, e-postayla gönder"

  Mockup-level design is left to the builder, following the current login form's look.
- `sendOTP` sends the code by SMS to the user's number. If the account has no number yet, or NetGSM reports a failure, it sends the same code by email instead **(staff: email backup)**. The plugin runs `sendOTP` in the background and ignores its errors, so the fallback has to happen inside `sendOTP`.
- "Kod gelmedi, e-postayla gönder" is always available and sends a fresh code by email only **(staff)**. Management accepts that this makes email inbox access (with a password reset) enough to log in, in exchange for never locking anyone out.
- The button shares the 1-minute resend limit with the resend link. `/two-factor/send-otp`'s body has only `trustDevice`, so the builder needs a way to pass the channel (for example, a query parameter or header read inside `sendOTP`, or a small separate endpoint that reuses the plugin's pending-2FA cookie).
- Code lifetime: **5 minutes (staff)**, for both login codes and number verification codes (`otpOptions.period: 5`).
- Codes are stored hashed (`storeOTP: "hashed"`) **(my call)**.
- Wrong attempts: 5 per code (plugin default `allowedAttempts`), then the code stops working and the person must request a new one.
- Resend: at most one new code per minute per pending login (and per number being verified) **(my call)**. The plugin's built-in limit (3 requests per 10 seconds) isn't enough to stop SMS cost from repeated clicks.
- Account lock: after 10 wrong codes in a row across logins, the account's code step is locked for 15 minutes **(my call)**. The plugin's own lock only runs for users with a `two_factor` row holding a TOTP secret, so this is done in the local plugin, not by faking `two_factor` rows. A successful login resets the count.
- `SMS_DRY_RUN` (on by default in development): the fake NetGSM client "succeeds" without sending anything, so in dry run `sendOTP` treats SMS as not delivered and emails the login code. For number verification in dry run, the code is written to the server console with a clear "DRY RUN" prefix, and never when dry run is off **(my call: the only exception to "codes never in server logs", and it never applies in production)**.
- The `twoFactorEnabled` column can't be set through better-auth's API input, so it's set directly (migration for existing rows, after-create for new accounts).
- The SMS text is short and Turkish, for example "NESİAD panel giriş kodunuz: 123456. 5 dakika geçerlidir." It goes through the existing NetGSM client (`src/lib/sms/netgsm.ts`). Whether to use NetGSM's dedicated OTP endpoint is left to the builder. Check `docs/production-sms.md` and note any production setup needed there.

### Locking down the plugin

The `twoFactor` plugin also exposes endpoints this panel must not allow, because they would let someone weaken their own login:

- `trustDevice: true` on `/two-factor/verify-otp` (or send-otp) would skip the code on later logins. It has to be rejected or stripped server-side, not just left out of the UI.
- `/two-factor/disable` would turn the code step off with just the password. Block it.
- `/two-factor/enable`, TOTP endpoints and backup-code endpoints are unused. Block them so nobody can, for example, add an authenticator that bypasses SMS.

A `before` hook in a small local plugin (like `src/lib/auth-plugins/*`) is the expected place. Tests must prove each of these is refused.

### Audit log (Denetim Kayıtları)

New actions, with labels in `src/lib/audit-labels.ts`. Written through the better-auth audit plugin (`src/lib/auth-plugins/audit.ts`) for login events and in the same transaction as the change for number changes:

- Login code sent, with the channel (SMS / e-posta) and, for SMS failures, that it fell back to email.
- Login code entered wrong.
- Login completed. **The existing "login" entry must move**: with 2FA, `/sign-in/email` no longer creates a session (the plugin deletes it and sets `newSession` to null), so the login is complete at `/two-factor/verify-otp`. A correct password with no code yet is not a login, and it must not be logged as `login_failed` either (today the audit plugin would, because it sees no session).
- Number verification code sent (to which account, masked number).
- Number set or changed on an account, with the old and new number masked.

Numbers in the log show only the last 4 digits (`••• ••• 12 34` style) **(my call)**. Codes never appear anywhere in the log or server logs.

### Default admin

- New optional env var `DEFAULT_ADMIN_PHONE`, validated like the other `DEFAULT_ADMIN_*`. Once the phone column is required, `ensureDefaultAdmin` needs it to create the account and treats it like the others when it's missing ("not_configured").
- The seeded number is trusted without an SMS check, since whoever sets the env controls the deploy **(my call)**.
- Update `.env.example`, `docs/deploy.md` and the GitHub Actions/production env notes.

## Rollout (two deploys) **(staff)**

**Deploy 1** (this feature):

- Migration: add nullable `user.phone`, add the plugin's `user.two_factor_enabled` and set it to `true` for all existing rows, and add the plugin's `two_factor` table (`/two-factor/verify-otp` reads it on every login, even with no rows).
- From this deploy on, every login asks for a code. Accounts without a number get it by email.
- Production already sends real SMS (`SMS_DRY_RUN=false`) **(staff)**, so number verification works right after the deploy.
- After deploy, someone enters and verifies the 4 staff numbers on the Panel Kullanıcıları page (each person reads their own code to whoever is typing).

**Deploy 2** (a separate later PR, after all 4 numbers are in):

- Migration: `user.phone` becomes `NOT NULL`. This fails if any production row is still empty, so before merging, check that production has no account without a number.
- Remove the "no number → email" path from `sendOTP`. SMS failure still falls back to email.

Neither migration loses or rewrites existing data. Deploy 1 does change how production logs in the moment it ships, so ship it when the staff know it's coming.

## Tests

Per project conventions (`pnpm test`, real dev DB, `__test__` names):

- Login with password returns the 2FA redirect and no session; correct code gives a session; wrong code 5 times locks that code; expired code (5 minutes) is refused.
- SMS failure and no-number both send the code by email; the email-only request sends only email.
- Resend within a minute is refused.
- `trustDevice`, disable, enable, TOTP and backup-code endpoints are refused.
- Creating an account or changing a number without a valid code for that exact number is refused, and nothing is saved.
- Audit entries for each new action, and no code or full number in them.
- The NetGSM client is faked in tests (`fakeNetgsmClient`), as existing SMS tests do.

## Left to the builder

- How the number verification endpoint is shaped (Hono route vs. better-auth plugin endpoint), as long as the server enforces verification.
- How the "email only" channel is passed to `sendOTP`.
- Where the resend cooldown is stored (the `verification` table is the obvious place).
- Exact Turkish wording of the SMS, email and screen texts, matching the panel's existing tone.
- The visual design of the code step and the number field, following the existing login form and panel-user forms.
