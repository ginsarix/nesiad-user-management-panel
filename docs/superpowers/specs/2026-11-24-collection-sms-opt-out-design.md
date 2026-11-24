# Tahsilat notice opt-outs for panel users

## Intent

Some panel users don't want a message for every new tahsilat. Let a panel user
be taken off the staff tahsilat SMS, the staff tahsilat email, or both. These
are two separate switches, so each is its own decision.

## Goals

- Every panel user has two switches, Tahsilat SMS'i and Tahsilat E-postası.
  Both are on by default. `sendCollectionNotices` skips the staff SMS and/or
  the staff email for users who have them off.
- Staff flip them for any account from Panel Kullanıcıları (no roles, same as
  rename / disable / phone change). Everyone can see who's opted out of what.
- Every flip is audited.

## Non-goals

- Account messages. These always go out: login codes (by SMS, and by email
  as the fallback), phone verification codes, verification links and password
  reset emails.
- Any opt-out for members, yetkililer or applicants (celebration, manual,
  application or yetkili tahsilat notices).
- A self-service "my account" switch.

## Approaches

- **A. Row actions on Panel Kullanıcıları (picked).** It fits how accounts
  are managed today and is visible to all staff.
- B. Each user flips their own in Ayarlar → Bildirimler. This would be a new
  kind of per-user setting, and staff can't see who's opted out.
- Both A and B. That's more UI than 2–3 users need.

## Design

- **Schema:** `user.collection_sms` and `user.collection_email`, both
  `boolean NOT NULL DEFAULT true`. This is an additive migration: existing
  accounts keep getting both, and no production data changes.
- **better-auth:** declare both in `user.additionalFields` with
  `input: false`, so `admin.listUsers` returns them and no better-auth
  endpoint can set them.
- **API:** `PATCH /api/panel-users/:id/collection-notices`
  `{ sms?: boolean, email?: boolean }` (at least one) in the Hono
  `panel-users` route. It updates the given flags and calls `recordAudit` in
  the same transaction (`panel_user` / `update`, using `diffFields`: changes
  "Tahsilat SMS'i" / "Tahsilat E-postası", Açık ↔ Kapalı, only for fields
  that actually changed; nothing changed → no entry). Unknown id → 404.
- **Sending:** the staff query in `sendCollectionNotices` also selects both
  flags. Each staff email and SMS goes only to users with that flag on. A
  skipped message doesn't count as a failure in the `collection_notice` audit
  outcome.
- **UI:** a "Tahsilat Bildirimleri" column, part of the Sütunlar toggle. It
  shows what the user gets: "SMS, E-posta", "SMS", "E-posta" or "Kapalı".
  There are two row actions, "Tahsilat SMS'ini kapat/aç" and "Tahsilat
  e-postasını kapat/aç". Each applies right away with a toast, the same as
  Devre dışı bırak, and invalidates the list query.
- **Tests:**
  - a route test: each flag on its own, and the audit entry for each
  - no audit entry when nothing changed
  - a `collection-notices` test: an SMS-off user gets the email only, an
    email-off user gets the SMS only, and a user with both off gets nothing

## Left to the builder

- Whether the Ayarlar → Bildirimler staff templates get a one-line hint
  ("Panel Kullanıcıları'ndan kapatılabilir").
- How skipped messages show up in the notice outcome (a separate "skipped"
  count or just left out), following `notice-outcome.ts`.
