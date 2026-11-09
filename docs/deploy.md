# Deploying to Plesk

`.github/workflows/deploy.yml` runs on every push and pull request:

1. **check**: lint, typecheck, and the tests against a throwaway Postgres.
2. **deploy** (only `main`, only after check passes): builds the standalone server, applies new database migrations, copies the server to the Plesk app folder with `rsync` over SSH, and restarts the app. A smoke test then waits until `/login` is served by the new build, and fails the run if it isn't within a minute.

Plesk only runs the app; nothing is installed or built there. Migrations run from GitHub through the same SSH connection (section 4); the app creates the first admin itself when it starts (section 5).

## 1. Plesk: SSH access for the deploy

- **Websites & Domains → Hosting & DNS → Hosting → SSH access**: `/bin/bash`. A chrooted shell usually has no `rsync`, and the upload fails.
- Create a key pair used only by GitHub Actions, on your machine:

  ```bash
  ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f nesiad-deploy
  ```

  Add `nesiad-deploy.pub` to the subscription user's `~/.ssh/authorized_keys` on the server. The private key `nesiad-deploy` goes to GitHub (section 3); delete both local files afterwards.
- Get the server's host key for `SSH_KNOWN_HOSTS`, and compare its fingerprint with the one the server shows (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` there):

  ```bash
  ssh-keyscan -p 22 <ssh-host>   # your SSH_PORT if it isn't 22
  ```

## 2. Plesk: the Node.js app

On a domain used only for the panel, the app folder is the domain's `httpdocs` (production: `/var/www/vhosts/yonetim.nesiad.org.tr/httpdocs`). Each deploy replaces that folder's contents, so never use the `httpdocs` of a domain that serves anything else. Logos go in a folder **outside** it. Create `<app folder>/public` and the logo folder before the settings below (the document root has to exist):

```bash
mkdir -p /var/www/vhosts/<domain>/httpdocs/public /var/www/vhosts/<domain>/nesiad-data/uploads
```

**Websites & Domains → Node.js.** The page shows folders relative to the domain's home (`/var/www/vhosts/<domain>`), so `httpdocs` appears as `/httpdocs`:

| Setting | Value |
| --- | --- |
| Node.js version | The `NODE_VERSION` in the workflow (22) |
| Application mode | production |
| Application root | the app folder: `/httpdocs` here, while `DEPLOY_PATH` in GitHub is the full path |
| Document root | `/httpdocs/public`. Not the app folder itself: Plesk serves the document root's files directly, which would expose the server code |
| Application startup file | `server.js`. Plesk fills in `app.js`, which doesn't exist |

**Environment variables** (same page): everything in the README's Environment table, plus:

- `UPLOAD_DIR`: the absolute logo folder from above. Left unset, logos go into the app folder; the deploy is told to keep `uploads/` there, but backups and moves are easier outside it.
- `NEXT_PUBLIC_APP_URL`: exactly the same value as the GitHub `APP_URL` variable. The build bakes in GitHub's value; the server reads Plesk's.
- `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`, `DEFAULT_ADMIN_PHONE`: the first admin (section 5).
- `DEFAULT_ADMIN_PHONE`: the first admin's Turkish mobile number (e.g. `05xx xxx xx xx`). Every account needs a number, so without it the admin isn't created, just as without the email or password. Login codes go to it by SMS and it is trusted without a code. An invalid number stops the admin from being created. It only applies when the default admin is first created; it never changes an account that already exists. Production's admin already exists, so change its number on Panel Kullanıcıları instead.

The app checks these when it starts. A missing or invalid one is printed in the app's log (Node.js page → logs) and every request fails with 500 until it's fixed. Restart the app after changing them.

Also needed, from the README: nginx must set `X-Real-IP`, and for SMS see [production-sms.md](production-sms.md).

Then click **Enable Node.js**; saving the settings doesn't turn the app on. If it's off, Plesk serves `public/` as a static site: `/login` gives Plesk's own 404 page and `/` a 403. After the first deploy has put `server.js` there, **Restart App** once.

Plesk starts the app through `.plesk-secrets.cjs`, a file it writes into the app folder: it loads the environment variables, then `server.js`. The deploy leaves it in place (`--exclude` in the workflow's upload step). If it's ever missing, every request is a 502 and the log says `no startup file at …/.plesk-secrets.cjs`; **Restart App** writes it again.

## 3. GitHub: the production environment

**Settings → Environments → New environment** `production`.

Variables:

| Name | Value |
| --- | --- |
| `APP_URL` | public URL of the panel, e.g. `https://panel.nesiad.org.tr` (no trailing slash) |
| `SSH_HOST` | server host name |
| `SSH_PORT` | optional, default 22 |
| `SSH_USER` | the subscription's system user |
| `DEPLOY_PATH` | the app folder, absolute |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan` from section 1 |

Secrets:

| Name | Value |
| --- | --- |
| `SSH_PRIVATE_KEY` | the contents of `nesiad-deploy` |
| `DATABASE_URL` | the same value as in Plesk (section 4) |

Optional: **Required reviewers** on the environment makes each deploy wait for an approval.

## 4. Database schema: migrations

Schema changes ship as migrations: SQL files in `drizzle/`, written by `pnpm db:generate` and reviewed in the pull request. The deploy job applies the ones production hasn't run yet (`pnpm db:migrate`), after the build and before the upload. Applied migrations are recorded in the database table `drizzle.__drizzle_migrations`. The first deploy creates every table.

**Setup:** the `DATABASE_URL` secret from section 3, with the same value as the Plesk variable. Postgres only listens on the server, so the deploy forwards the runner's `localhost:5432` to the server's `localhost:5432` over SSH. The URL therefore has to use `localhost` (or `127.0.0.1`) and port 5432, which a Plesk-created database on the same server does.

The database user has to own the database: migrations create the `drizzle` schema and the tables. Plesk makes the Postgres admin the owner, so the first migration fails with `permission denied for database …`. Once, as root on the server (`sudo -u postgres psql`), or as the Postgres admin from **Tools & Settings → Database Servers**:

```sql
ALTER DATABASE <db name> OWNER TO <db user>;
\c <db name>
ALTER SCHEMA public OWNER TO <db user>;
```

**When a migration fails,** the run stops before the upload and the old version keeps running. The error is in the "Migrate the database" step. `channel … open failed: administratively prohibited` means the server's SSH doesn't allow port forwarding for this user (`AllowTcpForwarding`); the host has to allow it.

**Changing the schema:**

1. Edit `src/db/schema.ts` and apply it to your development database with `pnpm db:push`, as before.
2. `pnpm db:generate` writes the migration. It asks when it can't tell a rename from a drop and create; answer carefully, a wrong "create" loses that column's production data.
3. Read `drizzle/<time>_<name>/migration.sql` and commit the folder with the schema change. CI fails when a schema change has no migration.

A migration that production has run is never edited or deleted: fix it with a new one. When existing rows need converting (a new required column, a type change), add the SQL to `migration.sql` before committing, or write it in an empty migration from `pnpm exec drizzle-kit generate --custom --name <name>`.

The migration runs a few seconds before the new code is live. Adding tables or columns is harmless; a drop or rename can break requests to the old version during those seconds, so deploy those when nobody is using the panel.

## 5. The first admin

Every time the app starts, it checks for an account with `DEFAULT_ADMIN_EMAIL`. If there is none, it creates one (name "Admin User", password `DEFAULT_ADMIN_PASSWORD`, number `DEFAULT_ADMIN_PHONE`) and emails the verification link, which logs them in and leads to `/welcome` to choose their own password. The app log says `Default admin: created`. If the account exists, nothing happens. The tables exist by then: the deploy migrates before it starts the new version.

- **The email didn't arrive** (the log says `created_email_failed`): sign in with the email and `DEFAULT_ADMIN_PASSWORD`. Login is refused until the address is verified, but each attempt sends a new link.
- **It comes back:** as long as the three variables are set, deleting that account on Panel Kullanıcıları recreates it at the next start, and Plesk starts the app again after every idle period. Remove the variables in Plesk once the admin has logged in, unless that's what you want.
- `pnpm db:seed` does the same check from a machine, using its `.env`.

## 6. After the first deploy with the membership application

Submit one real application at `/uyelik` with three files of about 5 MB each, to confirm nothing in front of the app (LiteSpeed, nginx) rejects a request of roughly 16 MB. Accept or delete it afterwards. Once it works, point the old site's form link to `/uyelik`.

Also check:

- `curl -sI https://<domain>/uyelik`: `Cache-Control` must be `private, no-store` and there must be no `x-litespeed-cache: hit`. A cached page would load broken after the next deploy, which deletes the old `/_next/static` chunks.
- Accept one application with `SMS_DRY_RUN` off, using an email address and a phone number you own, and confirm the acceptance email and SMS actually arrive. The automated tests prove those paths only with mocks.

## 7. SMS login rollout

Login asks for a code after the password, sent by SMS to the account's number. It falls back to email when the SMS can't be sent (NetGSM error, no credit, `SMS_DRY_RUN` on), and "Kod gelmedi, e-postayla gönder" on the code step sends it by email on request. It shipped in two deploys; both are done.

**Deploy 1** (the feature):

- The migration added `user.phone` (nullable then) and the two-factor tables, and marked all existing accounts as two-factor enabled. It lost and rewrote no data.
- From then on every login asked for a code; accounts without a number got it by email until their number was entered and verified on Panel Kullanıcıları.
- Nobody was logged out at the deploy: sessions that were already open stayed valid. A session lasts 30 days but is renewed once a day while it's in use, so a session opened before deploy 1 that keeps being used never expires on its own and never goes through the code step. Ending those sessions was deliberately not done (management's decision, 2026-11-09).

**Deploy 2** (after all 4 staff numbers were in):

- The migration makes `user.phone` required (`ALTER TABLE "user" ALTER COLUMN "phone" SET NOT NULL`). It changes no data. If any account still had no number it would fail, and the deploy would stop before uploading the new code; production had none.
- The "no number, send by email" path is gone: every account has a number, so login codes go by SMS, with the email fallback above.
- `DEFAULT_ADMIN_PHONE` is now needed to create the default admin (section 5).

## Deploying, retrying, rolling back

- **Deploy:** merge or push to `main`.
- **Deploy again without a change:** Actions → CI / Deploy → Run workflow (branch `main`).
- **Roll back:** open the run of an older good commit and **Re-run all jobs**; it rebuilds and deploys that commit. Migrations are never undone: the older code runs against the newer schema. That stops holding past the release that replaced `member.active` with `status`: older code selects the dropped column and fails, so after that release, roll forward only.
- While `rsync` replaces the files, requests can fail for a few seconds.
- A green smoke test means the new build is live: the login page includes each build's random ID (`.next/BUILD_ID`), and the test waits for this build's. When it fails, the app's log in Plesk says why.
