# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NESIAD (Nevşehir Sanayici ve İş İnsanları Derneği) member management panel: an internal tool for 2–3 staff replacing an Excel sheet. UI text is Turkish; code, comments, and commits are English. See `AGENTS.md` — Next.js 16 differs from older versions; check `node_modules/next/dist/docs/` before writing Next code.

## Commands

Use pnpm (there's a `pnpm-lock.yaml`).

```bash
pnpm dev                        # Next dev server (Turbopack) on :3000
pnpm build && pnpm start        # production build
pnpm lint                       # biome check (src/components/ui/* is vendored shadcn and isn't lint-clean; judge only your own files)
pnpm exec biome check --write <paths>   # format + fix specific files
pnpm exec tsc --noEmit          # typecheck
pnpm test --run                 # all tests (vitest)
pnpm test --run audit-logs      # tests whose path matches a pattern
pnpm db:push                    # apply src/db/schema.ts to the database
pnpm db:seed                    # create the default admin from DEFAULT_ADMIN_* in .env (sends a real verification email)
```

- Always run tests through `pnpm test`: it preloads `.env` (`dotenv/config`). Plain `vitest` fails on env validation.
- Tests run against the real development database from `DATABASE_URL`. Test records are named `__test__…` and removed in `afterAll`; audit rows they cause are removed once by `src/test/global-teardown.ts`. Test files run in parallel, so never assert on whole-table counts or reuse unique names (sector names are unique) — scope assertions to the test's own records.
- The schema is applied with `drizzle-kit push`, not migrations. When push stops with `missing_hints` (e.g. rename vs. create), rerun with `pnpm exec drizzle-kit push --output json --hints '[…]'`. Development data is disposable: don't write data conversions for schema changes.
- After adding or moving pages, `pnpm exec next typegen` regenerates the `PageProps<"/route">` types.

## Architecture

**Next.js App Router, Node runtime only, no server actions.** `src/app/(panel)/*` are the logged-in pages (shell in `(panel)/layout.tsx`, sidebar items in `src/lib/nav.ts`); `src/app/(auth)/*` are login, forgot/reset password, and `/welcome`. `src/proxy.ts` only checks that a session cookie exists; pages call `requireSession()` (`src/lib/session.ts`) and the API checks the session for real.

**API: one Hono app** at `src/app/api/[[...route]]/` (`app.ts` mounts the route files). Its middleware returns 401 without a session and puts the session in the context (`AppEnv` in `env.ts`; `actorOf(c)` gives the audit actor). better-auth has its own handler under `/api/auth`. The browser and server talk to Hono through the typed RPC client `src/lib/rpc-client.ts`; the calls live in `src/lib/fetches/*` (one file per entity), which throw the API's `{ error }` message.

**Data fetching pattern** (every list/detail page): the server `page.tsx` prefetches into TanStack Query with `queryClient.query({ queryKey, queryFn: () => fetchX(await forwardedRequestOptions()) })` and wraps the client component in `<HydrationBoundary state={dehydrate(queryClient)}>`; the client component calls `useQuery` with the same key. Don't fetch data directly in server components. Mutations invalidate every query key whose page shows the changed data (e.g. member changes also invalidate `["sectors"]` and `["representatives"]`).

**Validation:** `src/lib/zod-schemas/*` has separate API schemas (dates as `yyyy-aa-gg`, blank text → `null`, multipart strings) and form schemas (dates as `gg.aa.yyyy` as typed). Forms use react-hook-form + `zodResolver` (not TanStack Form). Dates are Postgres `date` columns; convert with `src/lib/dates.ts`. Turkish-aware sorting/search uses `compareTr` / `foldTr` from `src/lib/turkish.ts`.

**Auth: better-auth** (`src/lib/auth.ts`) with the admin plugin. There are no roles: every account has role `admin` (`defaultRole: "admin"`) and can manage the others. Sign-up is disabled; accounts are created from the Panel Kullanıcıları page and get an emailed verification link that logs them in once and lands on `/welcome` (custom plugin `src/lib/auth-plugins/initial-password.ts`). Use better-auth's own endpoints wherever they cover a need; panel-user changes go through `better-auth/client` admin calls (`src/lib/fetches/panel-user.ts`). The client IP is read only from `x-real-ip`, set by the Plesk nginx front end.

**Audit log (Denetim Kayıtları) is append-only and mandatory for changes:**
- Every Hono mutation writes `recordAudit(tx, …)` (`src/lib/audit.ts`) in the same transaction as the change, with `actorOf(c)`. Updates store field-level changes as display strings built with `diffFields` / `change` from `src/lib/audit-diff.ts` (only fields present in the update; write nothing when nothing changed). Creates and deletes store the whole record in `details`; deletes read related data (links, names) before deleting.
- Logins, logouts, password events, and panel-user actions are recorded by the better-auth plugin `src/lib/auth-plugins/audit.ts` (failures there are logged, never block auth); password resets come from `onPasswordReset` in `auth.ts`.
- Labels for new actions go in `src/lib/audit-labels.ts`.

**Tables** use TanStack Table v9 (`useTable`, `tableFeatures`, `createColumnHelper` — not the v8 API; the bundled skills in `.claude/skills/pnpm-@tanstack+react-table-*` are authoritative). Every table has the "Sütunlar" column toggle (`src/components/column-toggle.tsx`) with visibility stored in a cookie: the page reads it with `getSavedColumnVisibility(tableId)` and passes it to `usePersistedColumnVisibility`, so the server renders the right columns. Shared pieces: `SortableTableHeader`, `SearchCombobox` (Turkish-aware searchable select), `info-fields.tsx` (`orDash`, `formatDate`, `PassiveTag`, `InfoFields`). List filters are mirrored into the URL with `history.replaceState`, and `rememberListSearch` / `listHref` (`src/lib/list-href.ts`) make "… dön" links return to the same filtered list.

**UI:** shadcn `base-nova` style on Base UI (not Radix): `render` props instead of `asChild`, `Select` takes an `items` prop. Add components with `pnpm dlx shadcn@latest add <name>`, declining overwrites of existing files. Member logos are stored in `uploads/` (gitignored) and served by the authenticated `/api/files/:filename` route.

## Domain notes

- Members (üyeler) are hard-deleted; the audit log keeps the deleted record. They also have Aktif/Pasif (`active`), and lists default to Aktif. Kıdem is computed from Üye Giriş Tarihi ("5 Yıl", "10 Yıl"…), not stored.
- Yetkililer (authorized representatives) are linked to members from the yetkili form (`members_representatives`, with a per-link `role` = görev), never from the member form.
- Sectors are a managed list (Sektörler page) referenced by id; names are unique ignoring Turkish case (`name_key`). Deleting a sector sets members' `sector_id` to null.
- SMS goes through NetGSM (`src/lib/sms/`). Automatic celebration SMS run when a Plesk scheduled task calls `POST /api/cron/sms`; `sms_send` makes each one go out at most once. Production setup: `docs/production-sms.md`.
