# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NESIAD (Nevşehir Sanayici ve İş İnsanları Derneği) member management panel: an internal tool for 2–3 staff replacing an Excel sheet. UI text is Turkish; code, comments, and commits are English. See `AGENTS.md` — Next.js 16 differs from older versions; check `node_modules/next/dist/docs/` before writing Next code.

## Commands

Use pnpm (there's a `pnpm-lock.yaml`).

```bash
pnpm dev                        # Next dev server (Turbopack) on :3000
pnpm build && pnpm start        # production build (start warns about standalone output; it still works. Deploys run .next/standalone/server.js, see docs/deploy.md)
pnpm lint                       # biome check (skips src/components/ui/*, vendored shadcn; CI requires it to pass)
pnpm exec biome check --write <paths>   # format + fix specific files
pnpm exec tsc --noEmit          # typecheck
pnpm test --run                 # all tests (vitest)
pnpm test --run audit-logs      # tests whose path matches a pattern
pnpm db:push                    # apply src/db/schema.ts to the development database
pnpm db:generate                # write the migration for a schema change into drizzle/ (commit it; CI fails without it)
pnpm db:seed                    # create the default admin from DEFAULT_ADMIN_* if missing (sends a real verification email); the server also does this at every start
```

- Always run tests through `pnpm test`: it preloads `.env` (`dotenv/config`). Plain `vitest` fails on env validation.
- Tests run against the real development database from `DATABASE_URL`. Test records are named `__test__…` and removed in `afterAll`; audit rows they cause are removed once by `src/test/global-teardown.ts`. Test files run in parallel, so never assert on whole-table counts or reuse unique names (sector names are unique) — scope assertions to the test's own records.
- Tests that give a user a phone must mock `@/lib/sms/netgsm`; the local `.env` may send real SMS (`SMS_DRY_RUN=false`). Mock `@/lib/mail` too.
- Schema changes: `db:push` on the development database, then `db:generate` for the migration that production gets (the deploy runs `db:migrate` over an SSH tunnel, see `docs/deploy.md`). Don't run `db:migrate` on the development database: push built it, so the migrations would try to create existing tables. When push or generate stops with `missing_hints` (e.g. rename vs. create), rerun with `--output json --hints '[…]'`. Never edit or delete a migration that production has run; write a new one. Development data is disposable, production data isn't: when a change would lose or break existing rows (drop, rename, type change, new required column), put the conversion in the migration's SQL.
- **Destructive schema changes need a decision first.** Once a migration is merged to `main`, CI applies it to production with no prompt and no undo. Before generating a migration that drops or renames a table or column, changes a column's type, or adds a required column to a table with rows, tell the user what production data it touches and how it's handled (conversion SQL, a rename hint, or deploying when nobody is using the panel). Point it out again in the summary of the change. Never let one through silently.
- After adding or moving pages, `pnpm exec next typegen` regenerates the `PageProps<"/route">` types.

## Architecture

**Next.js App Router, Node runtime only, no server actions.** `src/app/(panel)/*` are the logged-in pages (shell in `(panel)/layout.tsx`, sidebar items in `src/lib/nav.ts`); `src/app/(auth)/*` are login, forgot/reset password, and `/welcome`. `/uyelik` (the public application form, `src/app/(public)/`) and `POST /api/applications` are the only routes that need no session; everything else is the panel. `src/proxy.ts` only checks that a session cookie exists; pages call `requireSession()` (`src/lib/session.ts`) and the API checks the session for real.

**API: one Hono app** at `src/app/api/[[...route]]/` (`app.ts` mounts the route files). Its middleware returns 401 without a session and puts the session in the context (`AppEnv` in `env.ts`; `actorOf(c)` gives the audit actor). better-auth has its own handler under `/api/auth`. The browser and server talk to Hono through the typed RPC client `src/lib/rpc-client.ts`; the calls live in `src/lib/fetches/*` (one file per entity), which throw the API's `{ error }` message.

**Data fetching pattern** (every list/detail page): the server `page.tsx` prefetches into TanStack Query with `queryClient.query({ queryKey, queryFn: () => fetchX(await forwardedRequestOptions()) })` and wraps the client component in `<HydrationBoundary state={dehydrate(queryClient)}>`; the client component calls `useQuery` with the same key. Don't fetch data directly in server components. Mutations invalidate every query key whose page shows the changed data (e.g. member changes also invalidate `["sectors"]` and `["representatives"]`).

**Validation:** `src/lib/zod-schemas/*` has separate API schemas (dates as `yyyy-aa-gg`, blank text → `null`, multipart strings) and form schemas (dates as `gg.aa.yyyy` as typed). Forms use react-hook-form + `zodResolver` (not TanStack Form). Dates are Postgres `date` columns; convert with `src/lib/dates.ts`. Turkish-aware sorting/search uses `compareTr` / `foldTr` from `src/lib/turkish.ts`.

**Auth: better-auth** (`src/lib/auth.ts`) with the admin plugin. There are no roles: every account has role `admin` (`defaultRole: "admin"`) and can manage the others. Sign-up is disabled; accounts are created from the Panel Kullanıcıları page and get an emailed verification link that logs them in once and lands on `/welcome` (custom plugin `src/lib/auth-plugins/initial-password.ts`). Use better-auth's own endpoints wherever they cover a need; panel-user changes go through `better-auth/client` admin calls (`src/lib/fetches/panel-user.ts`), except creating an account and changing its phone, which go through `/api/panel-users` because the number must be SMS-verified first. The client IP is read only from `x-real-ip`, set by the Plesk nginx front end.

**Audit log (Denetim Kayıtları) is append-only and mandatory for changes:**
- Every Hono mutation writes `recordAudit(tx, …)` (`src/lib/audit.ts`) in the same transaction as the change, with `actorOf(c)`. Updates store field-level changes as display strings built with `diffFields` / `change` from `src/lib/audit-diff.ts` (only fields present in the update; write nothing when nothing changed). Creates and deletes store the whole record in `details`; deletes read related data (links, names) before deleting. **Exception:** a public application submission writes no audit entry, and the applicant-only fields (names, contact, TC number, birth data, documents…) never have their values written to `details` or `changes`; staff edits to them record only the field label with "•••" (`diffRedacted`). Decision entries record each notice channel's outcome, never the address, number or text.
- Logins, logouts, password events, and panel-user actions are recorded by the better-auth plugin `src/lib/auth-plugins/audit.ts` (failures there are logged, never block auth); password resets come from `onPasswordReset` in `auth.ts`.
- Labels for new actions go in `src/lib/audit-labels.ts`.

**Tables** use TanStack Table v9 (`useTable`, `tableFeatures`, `createColumnHelper` — not the v8 API; the bundled skills in `.claude/skills/pnpm-@tanstack+react-table-*` are authoritative). Every table has the "Sütunlar" column toggle (`src/components/column-toggle.tsx`) with visibility stored in a cookie: the page reads it with `getSavedColumnVisibility(tableId)` and passes it to `usePersistedColumnVisibility`, so the server renders the right columns. Shared pieces: `SortableTableHeader`, `SearchCombobox` (Turkish-aware searchable select), `info-fields.tsx` (`orDash`, `formatDate`, `PassiveTag`, `InfoFields`). List filters are mirrored into the URL with `history.replaceState`, and `rememberListSearch` / `listHref` (`src/lib/list-href.ts`) make "… dön" links return to the same filtered list.

**UI:** shadcn `base-nova` style on Base UI (not Radix): `render` props instead of `asChild`, `Select` takes an `items` prop. Add components with `pnpm dlx shadcn@latest add <name>`, declining overwrites of existing files. Member logos are stored in `UPLOAD_DIR` (default `uploads/`, gitignored) and served by the authenticated `/api/files/:filename` route.

## Domain notes

- Members (üyeler) are hard-deleted; the audit log keeps the deleted record. Their `status` is `active` (Aktif), `passive` (Pasif), `candidate` (Aday) or `rejected` (Reddedildi); lists default to Aktif. Aday and Reddedildi are applications from `/uyelik`: they are left out of Aktif lists, sector counts, the yetkili picker and SMS, and only the decision actions (Kabul Et → Aktif, Pasif olarak ekle → Pasif, Reddet → Reddedildi, Tekrar Aday yap → Aday, `POST /api/members/:id/decision`) move a member out of them. The applicant gets an email and SMS from editable templates (SMS page, Ayarlar tab) when the application is saved ("Başvurunuz alındı", not awaited, no audit entry) and, after commit, on Aday → Aktif and Aday → Reddedildi (audited as `application_notice`); no other move sends anything. Kıdem is computed from Üye Giriş Tarihi ("5 Yıl", "10 Yıl"…), not stored.
- Yetkililer (authorized representatives) are linked to members from the yetkili form (`members_representatives`, with a per-link `role` = görev), never from the member form.
- Sectors are a managed list (Sektörler section of the Ayarlar page, `/settings`) referenced by id; names are unique ignoring Turkish case (`name_key`). Deleting a sector sets members' `sector_id` to null.
- SMS goes through NetGSM (`src/lib/sms/`). Automatic celebration SMS run when a Plesk scheduled task calls `POST /api/cron/sms`; `sms_send` makes each one go out at most once. Production setup: `docs/production-sms.md`.
