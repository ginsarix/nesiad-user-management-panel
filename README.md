# NESIAD Üye Yönetim Paneli

Internal member management panel for NESIAD (Nevşehir Sanayici ve İş İnsanları Derneği): members, yetkililer, sectors, SMS, panel users, and an audit log.

Next.js 16 · Hono · better-auth · Drizzle · PostgreSQL · NetGSM

## Requirements

- Node.js and pnpm
- PostgreSQL
- An SMTP account (verification and password reset emails)
- A NetGSM account (SMS)

## Setup

```bash
pnpm install
cp .env.example .env   # then fill it in
pnpm db:push           # create the tables
pnpm db:seed           # create the first admin and email them a verification link
pnpm dev               # http://localhost:3000
```

## Environment

All variables are validated at startup (`src/lib/env.ts`); the app won't start with a required one missing.

| Variable | |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public URL of the panel: base for auth, API calls, and email links. Read at build time |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Random secret, e.g. `openssl rand -hex 32` |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outgoing mail. Optional: `SMTP_PORT`, `SMTP_SECURE` |
| `NETGSM_USERNAME`, `NETGSM_PASSWORD`, `NETGSM_HEADER` | NetGSM API user and registered sender name. Required even in dry run |
| `SMS_DRY_RUN` | Defaults to `true`: no SMS is sent. Set to `false` in production |
| `CRON_SECRET` | 32+ characters. Needed for automatic SMS (`POST /api/cron/sms`) |
| `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` | Only for `pnpm db:seed` |

## Commands

```bash
pnpm dev               # dev server
pnpm build && pnpm start
pnpm lint              # biome
pnpm exec tsc --noEmit # typecheck
pnpm test --run        # vitest, against the DATABASE_URL database
pnpm db:push           # apply src/db/schema.ts
pnpm db:seed           # create the default admin
pnpm cron:sms          # call the SMS cron endpoint every minute (development)
```

Tests run against the real database in `DATABASE_URL` and clean up after themselves. Don't point them at production.

## Production

Runs as a Node.js app on Plesk behind nginx.

- `pnpm install && pnpm build && pnpm start`, after `pnpm db:push` against the production database.
- `uploads/` holds member logos. Keep it across deploys and back it up with the database.
- nginx must set `X-Real-IP`; it's the only source of the client IP in the audit log.
- Accounts are created from Panel Kullanıcıları; there is no sign-up.
- SMS setup (env, NetGSM IP restriction, Plesk scheduled task): [docs/production-sms.md](docs/production-sms.md).
