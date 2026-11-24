# Sürüm Notları (release notes page)

## Intent

Staff want a changelog: a place in the panel to look up what changed and
when, in their own words. The panel was never built with one, so the history
is rebuilt from git and production deploys, and from now on every change
that ships adds its notes in the same commit.

## Goals

- A "Sürüm Notları" page at `/release-notes`, in Turkish, for the 2–3 staff.
- One version per production deploy that staff would notice, named by its
  date. It's shown as "23 Kasım 2026", with "23.11.2026" in the sidebar. A
  later deploy on the same day that adds notes is a new version with the same
  date and a suffix: "24 Kasım 2026 V2" / "24.11.2026 V2", then V3, and so on.
  (User's call: a new version rather than adding to the day's notes, so
  everyone who saw the first notice still sees the new one.)
- The past is grouped by deploy day (see "Rebuilt history"), since those
  versions are being written after the fact.
- Each version is a list of entries. Each entry has a type (Yeni,
  İyileştirildi, Değiştirildi, Düzeltildi, Silindi) and one plain sentence.
- Search across every version, a type filter, and a quick way to jump to any
  older version.
- A dialog that tells each staff member about a new version once, and never
  shows the same version again after they've seen it.
- A link pinned to the very bottom of the sidebar, below everything else,
  however tall the window is.
- The past rebuilt: one version per deploy day since the first deploy.

## Non-goals

- A "yeni" badge or dot in the sidebar. The new-version dialog is the only
  nudge.
- Editing notes from the panel. Notes are only written in the code.
- Semver or any version number other than the date (plus the same-day
  suffix).
- Developer-facing changes: docs, tests, refactors, dependency bumps and CI
  never appear.

## Anti-goals

- Commit-message dumps. These are English, developer-sized (one feature is
  6 commits), and full of fixes to things staff never saw.
- Notes that are ahead of or behind production.

## Approaches

- **1. A typed data file in the code (picked).** `src/lib/release-notes.ts`
  exports the versions. A wrong type or a malformed entry fails the typecheck
  in CI, and the notes ship with the deploy that contains the change. There's
  no database, API or migration.
- 2. A Turkish `CHANGELOG.md` that the page parses. It's also readable on
  GitHub, but it depends on a text convention that nothing checks, so a
  mistyped heading silently drops entries.
- 3. A database table with in-panel editing. That means a table, API, forms
  and audit entries for text only the developer writes, and notes could
  claim something production doesn't do yet.

## Design

### Data — `src/lib/release-notes.ts`

```ts
export type ReleaseNoteType =
  | "new" | "improved" | "changed" | "fixed" | "removed";

export type ReleaseVersion = {
  date: string;          // "yyyy-aa-gg", the production deploy day
  revision?: number;     // 2, 3, … for later deploys the same day
  label?: string;        // e.g. "İlk sürüm" on the first one
  entries: { type: ReleaseNoteType; text: string }[];
};

export const RELEASE_VERSIONS: ReleaseVersion[] = [ /* newest first */ ];
```

- A version's **id** is its date, plus `-v<revision>` when there is one:
  `2026-11-24`, `2026-11-24-v2`. Ids never change once shipped, since the
  seen column stores them.
- It's shown as "24 Kasım 2026" / "24 Kasım 2026 V2" on the page and in the
  dialog, and as "24.11.2026" / "24.11.2026 V2" in the sidebar.

- Turkish labels and colors live in a map from type to label (Yeni,
  İyileştirildi, Değiştirildi, Düzeltildi, Silindi) in the same file. The
  fixed display order is Yeni, İyileştirildi, Değiştirildi, Düzeltildi,
  Silindi.
- A version's entries render grouped in that order, keeping the written
  order within a type. (My call: tidier than mixed types.)
- Entry text is plain text: no markdown, no links.
- A unit test checks the data:
  - Dates are valid `yyyy-aa-gg`.
  - Ids are unique.
  - Versions are newest first, by date and then by revision.
  - A revision appears only after the same date's earlier version, with no
    gaps (no suffix, v2, v3…).
  - Every version has at least one entry, and no text is empty.

### Sidebar footer (picked: B, the small version line)

- `SidebarFooter` in `src/components/app-sidebar.tsx`, below
  `SidebarContent`. It sits at the bottom of the bar and the nav scrolls
  above it.
- Expanded: a muted caption "Sürüm 23.11.2026" (the newest version),
  with a "Sürüm Notları →" link under it in white. On `/release-notes` the
  link is marked active (gold, like the active bar).
- Collapsed (icons only): one icon button (lucide `Newspaper`, my call) with
  the tooltip "Sürüm Notları · 23.11.2026".
- It is not added to `navGroups`. The header title currently comes only from
  `findActiveNavItem`, so `/release-notes` needs its title "Sürüm Notları"
  from there too. The builder picks how (for example, a small list of footer
  links that `findActiveNavItem` also searches).

### Page (picked: A, one long page with a "Sürümler" list on the right)

- `src/app/(panel)/release-notes/page.tsx` calls `requireSession()` and
  renders a client component with the data imported directly. It's static
  data in the bundle, not fetched, so the TanStack prefetch pattern doesn't
  apply.
- Top: a search box ("Ara…"), and under it single-select type chips: Tümü,
  Yeni, İyileştirildi, Değiştirildi, Düzeltildi, Silindi.
- Main column: one card per version, newest first. The heading is
  "23 Kasım 2026", with "En son" on the newest and the `label` (e.g. "İlk
  sürüm") where set. Each entry shows a colored type tag and its sentence.
  - Tag colors: Yeni green, İyileştirildi blue, Değiştirildi amber,
    Düzeltildi purple, Silindi red. These are muted tints that fit the
    existing palette.
- Right: a sticky "Sürümler" list of every version. It highlights the
  version being read as you scroll, and clicking scrolls to it. Each version
  has an anchor (its id, `#2026-11-13`), so a version can be linked
  directly.
- Narrow screens: the right list is hidden, and a "Sürüme git" select above
  the cards takes its place. (My call.)
- Search: Turkish-aware via `foldTr`, matched against entry text. Matches
  are highlighted. Entries that don't match are hidden, and so are versions
  with no matching entries, both in the cards and in the Sürümler list. A
  line says "N sürümde M sonuç". With no results: "Sonuç bulunamadı".
  - Search and the type chip combine.
  - `foldTr` keeps one character per input character for precomposed text,
    so match positions in the folded text map back to the original for
    highlighting. The builder should confirm this with a test (e.g. "İŞ",
    "ı").
- Search and type are mirrored into the URL (`?q=…&tur=…`) with
  `history.replaceState`, like the list pages.

### New-version dialog

- **Storage:** a new column `user.release_notes_seen`, `text`, nullable. It
  holds the id of the newest version the person has seen. It's a text id,
  not a date, because same-day versions share a date. It's per account, not
  per browser, so a notice seen on one computer never comes back on another.
  It's declared in better-auth `user.additionalFields` with `input: false`,
  like `collection_sms`. The migration is additive (nullable, no default
  needed), so no production rows change.
- **Who sees what:** the unseen versions are those before the seen id in
  `RELEASE_VERSIONS`, i.e. newer. This goes by list order, never by comparing
  strings.
  - When it's null (every existing account at deploy), only the newest
    version counts as unseen. Nobody gets the whole history.
  - An id that isn't in the list (e.g. production rolled back to older code)
    means nothing is unseen.
  - New accounts are created with it set to the newest version's id, so they
    see nothing until the next deploy.
- **When:** the panel layout already has the session user on the server, so
  it passes the unseen versions (if any) to a client `NewVersionDialog`. It
  opens on the first panel page load that has unseen versions. It isn't
  shown on `/release-notes` itself; opening that page marks it seen.
- **Look** (mockup approved in the visual companion): the shadcn `Dialog`.
  - Title "Panel güncellendi". Subtitle "23 Kasım 2026 sürümündeki
    yenilikler" for one version, or "Son girişinizden bu yana N sürüm" for
    more than one.
  - The entries look like they do on the page (type tags). With several
    versions, each gets a small date heading, newest first, and the body
    scrolls.
  - Footer: a "Tüm sürüm notları" link (to `/release-notes`) and a "Tamam"
    button.
- **Seen:** any close (Tamam, ✕, Esc, outside click, or the link) calls
  `POST /api/release-notes/seen`. That sets `release_notes_seen` to the
  newest version's id for the session user. The server takes the id from
  `RELEASE_VERSIONS`, not from the request, so it can only ever write the
  newest version of the code that's running. Visiting `/release-notes` does the same. If the call
  fails, the dialog still closes; it shows again on the next load, which is
  fine.
- **No audit entry.** This is the person's own panel state (see the
  CLAUDE.md audit rule on what counts as a change). This was approved by the
  user.
- **Tests:**
  - The route sets the id for the caller only and writes no audit row.
  - The unseen-versions helper covers:
    - null (newest only)
    - up to date (none)
    - two behind (both), including a same-day v2 after its day's first
      version
    - an unknown id (none)
  - A new panel user starts at the newest version.

### Rebuilt history

Versions are cut at the last successful production deploy of each day
(GitHub Actions "CI / Deploy" runs on `main`):

| Version    | Last deployed commit | Commits | feat+fix |
|------------|----------------------|---------|----------|
| 2026-11-03 | 83f36de              | 74      | 44       |
| 2026-11-06 | ec45b4d              | 18      | 15       |
| 2026-11-09 | 5523501              | 42      | 27       |
| 2026-11-10 | 92eadd7              | 33      | 24       |
| 2026-11-11 | 898b54b              | 21      | 19       |
| 2026-11-13 | 4d5e13c              | 29      | 25       |
| 2026-11-23 | 5d58175              | 7       | 5        |

- 2026-11-03 is the "İlk sürüm". The panel arrived as a whole, so it gets a
  short summary of what the panel does (a handful of Yeni entries by area),
  not 44 entries.
- In every other version:
  - Commits that belong to one user-visible change become one entry.
  - A fix to something introduced in the same version folds into it.
  - Within a version, only the end result of a change of direction shows.
  - Across versions, each change shows.
- `feat!:` / anything a user loses is Silindi or Değiştirildi (e.g. Ödeme
  Tipi / Tahsilat Tipi replaced by Kasa - Banka on 2026-11-23).
- Wording: one sentence, the page and button names staff see in the panel,
  no technical terms (no "API", "migration", "cache").
- Commits not yet pushed (Onur Kurulu, Organizasyon groups on the yetkili
  form, Son Giriş Tarihi, tahsilat SMS/e-posta switches per panel user) and
  this page itself make up the next version. It is dated the day it's
  pushed to `main`.
- The user reviews the drafted Turkish text before it ships.

### Keeping it current

- CLAUDE.md gains a rule: every `feat:` / `fix:` change that staff would
  notice adds its entries to `src/lib/release-notes.ts` in the same change,
  under the date it's pushed to `main`.
  - Notes never go into a version that has already been deployed. A later
    push the same day gets a new version with the same date and the next
    revision (v2, v3…).
  - Make sure the date is right when pushing.
- Nothing enforces this in CI. (My call: a check that can't tell
  user-visible from internal commits would be noise.)

## Left to the builder

- The exact component split, scroll-spy mechanics (IntersectionObserver or
  similar), and Tailwind classes, within the existing look (navy/gold, dense
  but calm).
- How `findActiveNavItem` learns the footer page's title.
- The drafted wording of every entry, following the rules above.
