# Deploying to Plesk

`.github/workflows/deploy.yml` runs on every push and pull request:

1. **check**: lint, typecheck, and the tests against a throwaway Postgres.
2. **deploy** (only `main`, only after check passes): builds the standalone server, copies it to the Plesk app folder with `rsync` over SSH, and restarts the app. A smoke test then requests `/login` and fails the run if the new version doesn't answer.

Plesk only runs the app; nothing is installed or built there. Schema changes are done by hand (section 4); the app creates the first admin itself when it starts (section 5).

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

Pick a folder for the app, e.g. `/var/www/vhosts/<domain>/nesiad-panel`, and one for logos **outside** it, e.g. `/var/www/vhosts/<domain>/nesiad-data/uploads`. Each deploy replaces the app folder's contents. Create both, and `<app folder>/public`, before the settings below (the document root has to exist):

```bash
mkdir -p /var/www/vhosts/<domain>/nesiad-panel/public /var/www/vhosts/<domain>/nesiad-data/uploads
```

**Websites & Domains → Node.js:**

| Setting | Value |
| --- | --- |
| Node.js version | The `NODE_VERSION` in the workflow (24) |
| Application mode | production |
| Application root | the app folder (= `DEPLOY_PATH`) |
| Document root | `<app folder>/public`. Not the app folder itself: Plesk serves the document root's files directly, which would expose the server code |
| Application startup file | `server.js` |

**Environment variables** (same page): everything in the README's Environment table, plus:

- `UPLOAD_DIR`: the absolute logo folder from above. Left unset, logos go into the app folder; the deploy is told to keep `uploads/` there, but backups and moves are easier outside it.
- `NEXT_PUBLIC_APP_URL`: exactly the same value as the GitHub `APP_URL` variable. The build bakes in GitHub's value; the server reads Plesk's.
- `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`: the first admin (section 5).

The app checks these when it starts. A missing or invalid one is printed in the app's log (Node.js page → logs) and every request fails with 500 until it's fixed. Restart the app after changing them.

Also needed, from the README: nginx must set `X-Real-IP`, and for SMS see [production-sms.md](production-sms.md).

The app can't start before the first deploy has put `server.js` there.

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

Secret: `SSH_PRIVATE_KEY`, the contents of `nesiad-deploy`.

Optional: **Required reviewers** on the environment makes each deploy wait for an approval.

## 4. Database schema

Not part of the deploy: on a database with real data, `drizzle-kit push` can drop columns, and it stops to ask. Run it from your machine, against production.

If Postgres only listens on the server, open a tunnel first and use port 5433 in the URL below:

```bash
ssh -N -L 5433:localhost:5432 <ssh-user>@<ssh-host>
```

**Schema**, before deploying code that needs it. Read every prompt; a "data loss" warning means a column with production data would be dropped:

```bash
DATABASE_URL='postgresql://…@localhost:5433/…' pnpm db:push
```

## 5. The first admin

Every time the app starts, it checks for an account with `DEFAULT_ADMIN_EMAIL`. If there is none, it creates one (name "Admin User", password `DEFAULT_ADMIN_PASSWORD`) and emails the verification link, which logs them in and leads to `/welcome` to choose their own password. The app log says `Default admin: created`. If the account exists, nothing happens. The schema has to be pushed first (section 4).

- **The email didn't arrive** (the log says `created_email_failed`): sign in with the email and `DEFAULT_ADMIN_PASSWORD`. Login is refused until the address is verified, but each attempt sends a new link.
- **It comes back:** as long as both variables are set, deleting that account on Panel Kullanıcıları recreates it at the next start, and Passenger starts the app again after every idle period. Remove the variables in Plesk once the admin has logged in, unless that's what you want.
- `pnpm db:seed` does the same check from a machine, using its `.env`.

## Deploying, retrying, rolling back

- **Deploy:** merge or push to `main`.
- **Deploy again without a change:** Actions → CI / Deploy → Run workflow (branch `main`).
- **Roll back:** open the run of an older good commit and **Re-run all jobs**; it rebuilds and deploys that commit. Schema changes are not rolled back.
- While `rsync` replaces the files, requests can fail for a few seconds.
- A green smoke test is a good sign, not proof: Passenger can take a few seconds to notice `restart.txt`, so the first check may still reach the old version. If in doubt, check the app's log in Plesk.
