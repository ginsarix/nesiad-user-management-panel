# Deploying to Plesk

`.github/workflows/deploy.yml` runs on every push and pull request:

1. **check**: lint, typecheck, and the tests against a throwaway Postgres.
2. **deploy** (only `main`, only after check passes): builds the standalone server, copies it to the Plesk app folder with `rsync` over SSH, and restarts the app. A smoke test then requests `/login` and fails the run if the new version doesn't answer.

Plesk only runs the app; nothing is installed or built there. Schema changes and the first admin are done by hand (section 4).

## 1. Plesk: SSH access for the deploy

- **Websites & Domains → Hosting & DNS → Hosting → SSH access**: `/bin/bash`. A chrooted shell usually has no `rsync`, and the upload fails.
- Create a key pair used only by GitHub Actions, on your machine:

  ```bash
  ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f nesiad-deploy
  ```

  Add `nesiad-deploy.pub` to the subscription user's `~/.ssh/authorized_keys` on the server. The private key `nesiad-deploy` goes to GitHub (section 3); delete both local files afterwards.
- Get the server's host key for `SSH_KNOWN_HOSTS`, and compare its fingerprint with the one the server shows (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` there):

  ```bash
  ssh-keyscan -p 22 <ssh-host>
  ```

## 2. Plesk: the Node.js app

Pick a folder for the app, e.g. `/var/www/vhosts/<domain>/nesiad-panel`, and one for logos **outside** it, e.g. `/var/www/vhosts/<domain>/nesiad-data/uploads`. Each deploy replaces the app folder's contents.

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

## 4. Database schema and the first admin

Not part of the deploy: on a database with real data, `drizzle-kit push` can drop columns, and it stops to ask. Run these from your machine, against production.

If Postgres only listens on the server, open a tunnel first and use port 5433 in the URLs below:

```bash
ssh -N -L 5433:localhost:5432 <ssh-user>@<ssh-host>
```

**Schema**, before deploying code that needs it. Read every prompt; a "data loss" warning means a column with production data would be dropped:

```bash
DATABASE_URL='postgresql://…@localhost:5433/…' pnpm db:push
```

**First admin**, once. The seed sends the verification email, whose link is signed with `BETTER_AUTH_SECRET` and points to `NEXT_PUBLIC_APP_URL`, so it needs the production values of every variable, not your development `.env`. Put them in `.env.seed-production` (gitignored), with `DATABASE_URL` through the tunnel and `DEFAULT_ADMIN_*` set, then:

```bash
pnpm exec tsx --env-file=.env.seed-production src/scripts/seed.ts
```

Delete the file afterwards. Running the seed again fails with "User already exists" and sends nothing.

## Deploying, retrying, rolling back

- **Deploy:** merge or push to `main`.
- **Deploy again without a change:** Actions → CI / Deploy → Run workflow (branch `main`).
- **Roll back:** open the run of an older good commit and **Re-run all jobs**; it rebuilds and deploys that commit. Schema changes are not rolled back.
- While `rsync` replaces the files, requests can fail for a few seconds.
