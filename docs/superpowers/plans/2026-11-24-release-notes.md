# Sürüm Notları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Turkish "Sürüm Notları" page with search, a type filter and a version jump list; a link pinned to the bottom of the sidebar; and a dialog that shows each staff member a new version once.

**Architecture:** The notes are a typed array in `src/lib/release-notes.ts`, with pure helpers for search, highlighting and "unseen" versions. The page and the dialog read that file directly; no API serves the notes. "Seen" is one nullable `text` column on `user` holding a version id, exposed as a better-auth additional field. The panel layout reads it from the session, and `POST /api/release-notes/seen` sets it (no audit entry).

**Tech Stack:** Next.js 16 (App Router), Hono, Drizzle (Postgres), better-auth, shadcn/Base UI, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-release-notes-design.md`

## Global Constraints

- UI text is Turkish; code, comments and commits are English. Run tests with `pnpm test --run`. Every task ends with `pnpm lint` and `pnpm exec tsc --noEmit` clean.
- Entry types and labels, in this display order: `new` Yeni, `improved` İyileştirildi, `changed` Değiştirildi, `fixed` Düzeltildi, `removed` Silindi.
- Tag colors (muted tints): Yeni green, İyileştirildi blue, Değiştirildi amber, Düzeltildi purple, Silindi red.
- A version is a date (`yyyy-aa-gg`) plus an optional `revision` (2, 3…) for later deploys the same day. Its id is `2026-11-24` or `2026-11-24-v2`, and ids never change once shipped.
  - Page and dialog: "24 Kasım 2026" / "24 Kasım 2026 V2".
  - Sidebar: "24.11.2026" / "24.11.2026 V2".
- Column: `user.release_notes_seen`, `text`, nullable, holding a version id. Additive migration only.
- Order is always list order in `RELEASE_VERSIONS`, never string comparison of ids.
- Marking notes seen writes **no** audit entry (CLAUDE.md audit rule: a person's own panel state).
- No "yeni" badge or dot anywhere; the dialog is the only nudge.

## Calls settled while planning

- The better-auth field is `releaseNotesSeen: { type: "string", required: false, input: false }` over a Drizzle `text("release_notes_seen")` column, so the session user carries a version id or `null`.
- New accounts get `releaseNotesSeen = LATEST_RELEASE_ID` in the existing `databaseHooks.user.create.before`. That covers the seed admin and accounts created on Panel Kullanıcıları.
- `NewVersionDialog` (in the panel layout) handles "visiting `/release-notes` marks it seen": on that path it marks seen and never opens. The page itself doesn't call the API.
- URL params on the page: `?q=` (search) and `?type=` (one of the type keys).
- Matching uses `indexOf` on `foldTr` text, never `RegExp`, so a query like "(" can't throw.

## Review Focus

- A same-day second deploy: someone who saw `2026-11-24` must get the dialog for `2026-11-24-v2`. Someone at `-v2` must see `-v10` as newer, even though the string `"v10"` sorts before `"v2"`. Covered in Task 1's tests.
- Client-side navigation: the panel layout doesn't re-render. After the dialog is closed, moving between pages must not reopen it. After landing on `/release-notes` with unseen notes, moving on to another page must not open it either. This is in Task 5's manual check.
- Turkish search: "is" and "iş" must both find "İŞ" and "Işık". Highlights must land on the right characters. Whitespace-only and regex-like queries must not filter everything out or throw. Covered in Task 1's tests.
- Rollback or an id missing from the list (production running older code than what someone saw) must show nothing, not every version. Covered in Task 1's tests.
- Malformed data (duplicate ids, unsorted versions, a v3 without a v2, empty text) must fail CI, not the page. Covered in Task 1's data test.

---

### Task 1: Release notes data and helpers

**Files:**
- Create: `src/lib/release-notes.ts`
- Test: `src/lib/release-notes.test.ts`

**Interfaces:**
- Produces:
  - `type ReleaseNoteType = "new" | "improved" | "changed" | "fixed" | "removed"`
  - `RELEASE_NOTE_TYPES: readonly ReleaseNoteType[]`, in display order
  - `RELEASE_NOTE_LABELS: Record<ReleaseNoteType, string>`
  - `type ReleaseNote = { type: ReleaseNoteType; text: string }`
  - `type ReleaseVersion = { date: string; revision?: number; label?: string; entries: ReleaseNote[] }`
  - `RELEASE_VERSIONS: ReleaseVersion[]`, newest first
  - `releaseVersionId(v: ReleaseVersion): string`, e.g. `"2026-11-24"` / `"2026-11-24-v2"`
  - `LATEST_RELEASE_ID: string`, the id of `RELEASE_VERSIONS[0]`
  - `formatReleaseVersion(v: ReleaseVersion): string`, e.g. `"24 Kasım 2026"` / `"24 Kasım 2026 V2"`
  - `shortReleaseVersion(v: ReleaseVersion): string`, e.g. `"24.11.2026"` / `"24.11.2026 V2"`, via `isoToDisplay`
  - `sortedEntries(version: ReleaseVersion): ReleaseNote[]`, in display order, stable within a type
  - `unseenReleaseVersions(seenId: string | null, versions?: ReleaseVersion[]): ReleaseVersion[]`:
    - null → `[versions[0]]`
    - a known id → the versions before it in the list
    - an unknown id → `[]`
  - `filterReleaseVersions(versions: ReleaseVersion[], filter: { query: string; type: ReleaseNoteType | null }): ReleaseVersion[]`. It keeps only matching entries and drops versions left empty.
  - `matchRanges(text: string, query: string): [start: number, end: number][]`. It returns non-overlapping ranges in the original text, or `[]` when the query is blank or when folding changed the text length.

- [ ] **Step 1: Write the failing tests** in `release-notes.test.ts`, using a small local `versions` fixture rather than the real data, except in the data checks.

```ts
describe("RELEASE_VERSIONS", () => {
  it("has valid dates and unique ids", () => {
    for (const v of RELEASE_VERSIONS) expect(parseIsoDate(v.date)).not.toBeNull();
    const ids = RELEASE_VERSIONS.map(releaseVersionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("is newest first, and a day's revisions run 2, 3… without gaps", () => {
    // walking oldest → newest: a new date starts with no revision; the same
    // date again must be previous revision (1 if none) + 1; dates never go back
  });
  it("has no empty version or text", () => {
    for (const v of RELEASE_VERSIONS) {
      expect(v.entries.length).toBeGreaterThan(0);
      for (const e of v.entries) expect(e.text.trim()).not.toBe("");
    }
  });
  it("LATEST_RELEASE_ID is the newest version's id", () => {
    expect(LATEST_RELEASE_ID).toBe(releaseVersionId(RELEASE_VERSIONS[0]));
  });
});

it("names versions", () => {
  const v1 = { date: "2026-11-24", entries: [] };
  const v2 = { date: "2026-11-24", revision: 2, entries: [] };
  expect(releaseVersionId(v1)).toBe("2026-11-24");
  expect(releaseVersionId(v2)).toBe("2026-11-24-v2");
  expect(formatReleaseVersion(v1)).toBe("24 Kasım 2026");
  expect(formatReleaseVersion(v2)).toBe("24 Kasım 2026 V2");
  expect(formatReleaseVersion({ date: "2026-03-01", entries: [] })).toBe("1 Mart 2026");
  expect(shortReleaseVersion(v2)).toBe("24.11.2026 V2");
});

it("sorts entries by type, keeping written order within a type", () => {
  // fixture: [fixed A, new B, fixed C, new D] → [new B, new D, fixed A, fixed C]
});

describe("unseenReleaseVersions", () => {
  // fixture ids, newest first: 2026-12-02-v2, 2026-12-02, 2026-11-25, 2026-11-13
  const ids = (vs: ReleaseVersion[]) => vs.map(releaseVersionId);
  it("only the newest when nothing was seen", () =>
    expect(ids(unseenReleaseVersions(null, versions))).toEqual(["2026-12-02-v2"]));
  it("none when up to date", () =>
    expect(unseenReleaseVersions("2026-12-02-v2", versions)).toEqual([]));
  it("a same-day v2 after its day's first version", () =>
    expect(ids(unseenReleaseVersions("2026-12-02", versions))).toEqual(["2026-12-02-v2"]));
  it("every newer one when behind", () =>
    expect(ids(unseenReleaseVersions("2026-11-25", versions)))
      .toEqual(["2026-12-02-v2", "2026-12-02"]));
  it("goes by list order, not string order", () => {
    // a fixture with 2026-12-02-v10 first and 2026-12-02-v9 next:
    // seen v9 → ["2026-12-02-v10"]
  });
  it("none for an id not in the list", () =>
    expect(unseenReleaseVersions("2099-01-01", versions)).toEqual([]));
});

describe("filterReleaseVersions", () => {
  it("matches Turkish text ignoring case and accents", () => {
    // entries "İŞ Kurulu eklendi", "Işık düzeltildi", "Tahsilat"
    // query "is" → the first two; query "IŞIK" → the second only
  });
  it("combines search and type, dropping empty versions", () => { /* … */ });
  it("treats a blank query as no search", () => {
    // query "   " with type null → versions unchanged
  });
  it("does not throw on regex characters", () => {
    expect(() => filterReleaseVersions(versions, { query: "(", type: null })).not.toThrow();
  });
});

describe("matchRanges", () => {
  it("returns positions in the original text", () => {
    expect(matchRanges("Yeni İŞ Kurulu", "iş")).toEqual([[5, 7]]);
    expect(matchRanges("ışık ışık", "isik")).toEqual([[0, 4], [5, 9]]);
  });
  it("returns nothing for a blank query", () =>
    expect(matchRanges("Tahsilat", "  ")).toEqual([]));
});
```

Fill in the commented cases with concrete fixtures and `expect`s, as in the ones written out.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test --run release-notes`
Expected: FAIL. `./release-notes` can't be resolved.

- [ ] **Step 3: Implement `src/lib/release-notes.ts`**
  - `formatReleaseVersion` formats the date with `Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })` on `${date}T00:00:00Z`, then appends ` V<revision>`.
  - The comment above `RELEASE_VERSIONS` states the rules:
    - Newest first.
    - Never add notes to a version that has been deployed. A later deploy the same day gets the same date with the next `revision`.
    - Ids never change once shipped.
  - Search folds both sides with `foldTr` (`src/lib/turkish.ts`) after trimming the query.
  - `matchRanges` maps folded indexes straight back. It returns `[]` if `foldTr(text).length !== text.length`.
  - `RELEASE_VERSIONS` starts with only the upcoming version, dated `"2026-11-24"`. Its entries:
    - Yeni: Sürüm Notları
    - Yeni: Onur Kurulu under Organizasyon
    - Yeni: Son Giriş Tarihi on Panel Kullanıcıları
    - İyileştirildi: Organizasyon groups editable from the yetkili form
    - İyileştirildi: per-panel-user tahsilat SMS/e-posta switches

    Each is written as one Turkish sentence in staff vocabulary. Task 6 adds the history.

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm test --run release-notes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/release-notes.ts src/lib/release-notes.test.ts
git commit -m "feat: release notes data and search helpers"
```

---

### Task 2: Seen column, new accounts, and the seen route

**Files:**
- Modify: `src/db/schema.ts` (`userTable`, after `collectionEmail`)
- Modify: `src/lib/auth.ts` (`user.additionalFields`, `databaseHooks.user.create.before`)
- Create: `drizzle/<generated>/`
- Create: `src/app/api/[[...route]]/release-notes.ts`
- Modify: `src/app/api/[[...route]]/app.ts` (mount `.route("/release-notes", releaseNotesRoute)` after the session middleware)
- Create: `src/lib/fetches/release-notes.ts`
- Test: `src/app/api/[[...route]]/release-notes.test.ts`

**Interfaces:**
- Consumes: `LATEST_RELEASE_ID` (Task 1)
- Produces:
  - `userTable.releaseNotesSeen`: `text("release_notes_seen")`, nullable
  - session `user.releaseNotesSeen: string | null` (a version id)
  - `releaseNotesRoute`: `POST /seen` → `204`
  - `markReleaseNotesSeen(): Promise<void>` in `src/lib/fetches/release-notes.ts`. It throws via `throwResponseError(res, "Sürüm notları kaydedilemedi")`.

- [ ] **Step 1: Write the failing test.** Set it up the same way as `panel-users.test.ts`: mock `@/lib/mail`, create users with `auth.api.createUser` (`__test__…` emails), log one in with `completeLogin`, wrap `releaseNotesRoute` in a `testApp` that sets the session, and clean up in `afterAll` with `cleanUpLogins` plus a delete of the users.

```ts
it("starts a new account at the newest version", async () => {
  expect(await seenOf(other.id)).toBe(LATEST_RELEASE_ID);
});

it("marks only the caller's notes seen, and the session carries the id", async () => {
  await db.update(userTable).set({ releaseNotesSeen: null }).where(eq(userTable.id, me.id));
  await db.update(userTable).set({ releaseNotesSeen: "2026-01-01" }).where(eq(userTable.id, other.id));

  const res = await testApp.request("/seen", { method: "POST", headers: cookies });
  expect(res.status).toBe(204);
  expect(await seenOf(me.id)).toBe(LATEST_RELEASE_ID);
  expect(await seenOf(other.id)).toBe("2026-01-01");

  const session = await auth.api.getSession({ headers: cookies });
  expect(session?.user.releaseNotesSeen).toBe(LATEST_RELEASE_ID);
});

it("writes no audit entry", async () => {
  const before = new Date();
  await testApp.request("/seen", { method: "POST", headers: cookies });
  const rows = await db.select().from(auditLogTable)
    .where(and(eq(auditLogTable.actorId, me.id), gte(auditLogTable.createdAt, before)));
  expect(rows).toEqual([]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test --run release-notes`
Expected: FAIL. `./release-notes` (the route) can't be resolved.

- [ ] **Step 3: Add the column and the better-auth field.** The field gets a comment: "the newest release notes version this person has seen; set only by POST /api/release-notes/seen, never audited (own panel state)". In `create.before`, also set `releaseNotesSeen: LATEST_RELEASE_ID`.

- [ ] **Step 4: Apply and generate**

Run: `pnpm db:push`, then `pnpm db:generate`.
Expected: the migration is exactly `ALTER TABLE "user" ADD COLUMN "release_notes_seen" text;`, with no drops and no default.

- [ ] **Step 5: Implement the route and the fetch.** The route sets `releaseNotesSeen: LATEST_RELEASE_ID` for `c.get("session").user.id` and returns `c.body(null, 204)`. It reads no body. Add a comment saying why there's no `recordAudit`.

- [ ] **Step 6: Run the tests and see them pass**

Run: `pnpm test --run release-notes`
Expected: PASS (both test files).

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/lib/auth.ts drizzle src/app/api/[[...route]]/release-notes.ts src/app/api/[[...route]]/release-notes.test.ts src/app/api/[[...route]]/app.ts src/lib/fetches/release-notes.ts
git commit -m "feat: remember the newest release notes each panel user has seen"
```

---

### Task 3: Sidebar footer and header title

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/components/app-sidebar.tsx`
- Test: `src/lib/nav.test.ts` (create it if it doesn't exist)

**Interfaces:**
- Consumes: `RELEASE_VERSIONS`, `shortReleaseVersion` (Task 1)
- Produces: `footerLinks: NavLink[]` in `nav.ts`, `[{ title: "Sürüm Notları", href: "/release-notes", icon: Newspaper }]`. `findActiveNavItem` also searches it.

- [ ] **Step 1: Write the failing test**

```ts
it("finds the footer page's title", () => {
  expect(findActiveNavItem("/release-notes")?.title).toBe("Sürüm Notları");
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test --run nav`
Expected: FAIL. The result is `undefined`.

- [ ] **Step 3: Implement it.**
  - Add `footerLinks` and include it in `findActiveNavItem`.
  - In `AppSidebar`, add a `SidebarFooter` after `SidebarContent` (above `SidebarRail`), with a top border in `sidebar-border`.
  - Expanded: a muted caption "Sürüm {shortReleaseVersion(RELEASE_VERSIONS[0])}" (`text-[11px] text-sidebar-foreground/60`), then a "Sürüm Notları →" link (white, underlined, gold when on `/release-notes`).
  - Collapsed (`group-data-[collapsible=icon]`): only a `SidebarMenuButton` with the `Newspaper` icon and the tooltip "Sürüm Notları · {date}".
  - The footer stays at the bottom of the bar however tall the window is, and the nav scrolls above it.

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm test --run nav`
Expected: PASS.

- [ ] **Step 5: Check it in the browser.** Run `pnpm dev` and log in with the dev session script (see memory "Test panel in dev").
  - Expanded: the footer sits at the very bottom on a tall window and on a short one, where the nav scrolls.
  - Collapsed: only the icon, with the tooltip.
  - Mobile sheet: the footer is visible.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts src/components/app-sidebar.tsx
git commit -m "feat: Sürüm Notları link pinned to the bottom of the sidebar"
```

---

### Task 4: The Sürüm Notları page

**Files:**
- Create: `src/components/release-note-entry.tsx`
- Create: `src/app/(panel)/release-notes/page.tsx`
- Create: `src/app/(panel)/release-notes/release-notes.tsx`

**Interfaces:**
- Consumes: everything from Task 1
- Produces: `<ReleaseNoteEntry note={ReleaseNote} query?={string} />`. It renders the colored type tag and the text, with `matchRanges` hits wrapped in `<mark>`. Task 5 reuses it.

- [ ] **Step 1: Build `ReleaseNoteEntry`.** The tag has a fixed minimum width, so the text lines up. The colors follow Global Constraints.

- [ ] **Step 2: Build the page.**
  - `page.tsx`: `await requireSession()`, then render `<ReleaseNotes versions={RELEASE_VERSIONS} />`. Run `pnpm exec next typegen` afterwards.
  - `release-notes.tsx` (client), top: the search `Input` ("Ara…"), then single-select chips "Tümü" plus the five labels.
  - Main column: one card per version from `filterReleaseVersions`, `id={releaseVersionId(version)}`. The heading is `formatReleaseVersion`, with "En son" on the version whose id is `LATEST_RELEASE_ID` and `label` where set. Entries come from `sortedEntries`.
  - Search status: while a query is set, show "{N} sürümde {M} sonuç". With nothing left, show "Sonuç bulunamadı".
  - Right (`lg` and up): a sticky "Sürümler" list of the filtered versions. It's highlighted by scroll position (IntersectionObserver), and a click scrolls to `#<id>` and updates the hash.
  - Below `lg`: a "Sürüme git" `Select` (with `items`) above the cards, doing the same thing.
  - `q` and `type` are read from `useSearchParams` on load and mirrored with `history.replaceState`. On load with a hash, scroll to that version.

- [ ] **Step 3: Check it in the browser.**
  - Searching "is" highlights "İŞ"/"Işık".
  - The chips combine with the search.
  - The "Sürümler" highlight follows scrolling, and clicking jumps.
  - Reloading keeps `?q=`/`?type=`/`#<id>`.
  - At phone width, the "Sürüme git" select replaces the list and nothing scrolls sideways.
  - The header says "Sürüm Notları".

- [ ] **Step 4: Lint, typecheck, commit**

```bash
git add src/components/release-note-entry.tsx "src/app/(panel)/release-notes"
git commit -m "feat: Sürüm Notları page with search, type filter and version list"
```

---

### Task 5: New-version dialog

**Files:**
- Create: `src/components/new-version-dialog.tsx`
- Modify: `src/app/(panel)/layout.tsx`

**Interfaces:**
- Consumes: `unseenReleaseVersions`, `formatReleaseVersion`, `sortedEntries` (Task 1); `user.releaseNotesSeen`, `markReleaseNotesSeen` (Task 2); `ReleaseNoteEntry` (Task 4)
- Produces: `<NewVersionDialog versions={ReleaseVersion[]} />`. The layout passes `unseenReleaseVersions(user.releaseNotesSeen)` and renders it next to `SessionTimeout`.

- [ ] **Step 1: Build the dialog** with shadcn `Dialog`. It holds `done` state (initially `versions.length === 0`).
  - On `/release-notes` (`usePathname`) while not done: call `markReleaseNotesSeen()` once, set done, and never open.
  - Elsewhere: open while not done.
  - Any close (`onOpenChange(false)`, Tamam, or the "Tüm sürüm notları" link to `/release-notes`): set done and call `markReleaseNotesSeen()`. If the call fails, log it and stay closed.
  - Title "Panel güncellendi". Subtitle "{formatReleaseVersion(version)} sürümündeki yenilikler" for one version, "Son girişinizden bu yana {n} sürüm" for more.
  - Body (scrolls, `max-h` about 60vh): with several versions, a small `formatReleaseVersion` heading per version, newest first. Entries come from `sortedEntries`, shown with `ReleaseNoteEntry`.
  - Footer: the link on the left and the "Tamam" button on the right.

- [ ] **Step 2: Check it in the browser** with the dev account:
  - Set `release_notes_seen` to null. A reload shows the newest version only. Close it with Esc, move between pages and reload: it doesn't come back.
  - Set it to an older date than two versions back (once Task 6's data is in, or with a temporary local fixture). The dialog lists both versions.
  - Set it to null and open `/release-notes` directly. There's no dialog, the column is now set, and moving to another page shows nothing.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
git add src/components/new-version-dialog.tsx "src/app/(panel)/layout.tsx"
git commit -m "feat: show each panel user a new version's notes once"
```

---

### Task 6: Rebuilt history and the keep-current rule

**Files:**
- Modify: `src/lib/release-notes.ts` (`RELEASE_VERSIONS`)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Draft the past versions**, newest first under the 2026-11-24 one. Read each range with `git log --reverse --format='%h %s%n%b' <from>..<to>`:

| Version    | Range                  |
|------------|------------------------|
| 2026-11-23 | `4d5e13c..5d58175`     |
| 2026-11-13 | `898b54b..4d5e13c`     |
| 2026-11-11 | `92eadd7..898b54b`     |
| 2026-11-10 | `5523501..92eadd7`     |
| 2026-11-09 | `ec45b4d..5523501`     |
| 2026-11-06 | `83f36de..ec45b4d`     |
| 2026-11-03 | up to `83f36de`, `label: "İlk sürüm"` |

  - Follow the spec's "Rebuilt history" rules: one entry per user-visible change; same-version fixes fold in; within a version only the end result; never docs/test/refactor/chore/ci; staff vocabulary; one sentence each.
  - 2026-11-03 gets a handful of Yeni entries by area, not one per commit.
  - Check the facts against CLAUDE.md's domain notes. Kasa - Banka replacing the Tipi lists is 2026-11-23, as Silindi plus Yeni.

- [ ] **Step 2: Run the data tests**

Run: `pnpm test --run release-notes`
Expected: PASS.

- [ ] **Step 3: Update CLAUDE.md.**
  - Add a Domain notes bullet for Sürüm Notları: the data file, page, footer, dialog, the `release_notes_seen` rules (a version id; null → newest only; unknown id → nothing; new accounts start at the newest; not audited).
  - Add a rule under Commands or Architecture: every change staff would notice adds its entries to `src/lib/release-notes.ts` in the same change, dated the day it’s pushed to `main`. Never add to a version that has been deployed: a later push the same day gets a new version with the same date and the next `revision` (v2, v3…). Check the date before pushing.

- [ ] **Step 4: Commit**, then stop for the user to review the Turkish wording before the branch is pushed.

```bash
git add src/lib/release-notes.ts CLAUDE.md
git commit -m "feat: release notes for every version since the first deploy"
```
