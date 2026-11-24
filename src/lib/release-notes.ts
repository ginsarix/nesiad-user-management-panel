import { isoToDisplay } from "./dates";
import { foldTr } from "./turkish";

// Sürüm Notları: what changed in the panel, for staff, in Turkish. The page,
// the sidebar and the new-version dialog all read this file.

export type ReleaseNoteType =
  | "new"
  | "improved"
  | "changed"
  | "fixed"
  | "removed";

/** Display order of the types, in a version and in the filter */
export const RELEASE_NOTE_TYPES: readonly ReleaseNoteType[] = [
  "new",
  "improved",
  "changed",
  "fixed",
  "removed",
];

export const RELEASE_NOTE_LABELS: Record<ReleaseNoteType, string> = {
  new: "Yeni",
  improved: "İyileştirildi",
  changed: "Değiştirildi",
  fixed: "Düzeltildi",
  removed: "Silindi",
};

/** One plain sentence; no markdown or links */
export type ReleaseNote = { type: ReleaseNoteType; text: string };

export type ReleaseVersion = {
  /** yyyy-aa-gg, the day it went to production */
  date: string;
  /** 2, 3… for later deploys the same day */
  revision?: number;
  /** e.g. "İlk sürüm" */
  label?: string;
  entries: ReleaseNote[];
};

/**
 * Newest first. Every change staff would notice adds its notes here in the
 * same change, dated the day it's pushed to main.
 * - Never add notes to a version that has been deployed: a later deploy the
 *   same day gets a new version with the same date and the next revision
 *   (2, 3…), so everyone who saw the first notice sees the new one too.
 * - A version's id (date, plus -v<revision>) never changes once shipped:
 *   user.release_notes_seen stores it.
 */
export const RELEASE_VERSIONS: ReleaseVersion[] = [
  {
    date: "2026-11-24",
    entries: [
      {
        type: "new",
        text: "Sürüm Notları sayfası: panelde neyin ne zaman değiştiği, aranabilir ve türe göre süzülebilir şekilde listeleniyor.",
      },
      {
        type: "new",
        text: "Panel güncellendiğinde yenilikler, bir sonraki girişte bir kez açılan pencerede gösteriliyor.",
      },
      {
        type: "new",
        text: "Organizasyon altında Onur Kurulu sayfası.",
      },
      {
        type: "new",
        text: "Panel Kullanıcıları listesinde Son Giriş Tarihi sütunu.",
      },
      {
        type: "improved",
        text: "Yetkilinin organizasyon görevleri artık yetkili formundaki Organizasyonlar bölümünden de düzenlenebiliyor.",
      },
      {
        type: "improved",
        text: "Yeni tahsilat SMS'i ve e-postası her panel kullanıcısı için Panel Kullanıcıları sayfasından ayrı ayrı açılıp kapatılabiliyor.",
      },
    ],
  },
];

/** "2026-11-24", or "2026-11-24-v2" for a later deploy the same day */
export function releaseVersionId(version: ReleaseVersion) {
  return version.revision
    ? `${version.date}-v${version.revision}`
    : version.date;
}

export const LATEST_RELEASE_ID = releaseVersionId(RELEASE_VERSIONS[0]);

const longDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const revisionSuffix = (version: ReleaseVersion) =>
  version.revision ? ` V${version.revision}` : "";

/** "24 Kasım 2026", or "24 Kasım 2026 V2" */
export function formatReleaseVersion(version: ReleaseVersion) {
  return (
    longDate.format(new Date(`${version.date}T00:00:00Z`)) +
    revisionSuffix(version)
  );
}

/** "24.11.2026", or "24.11.2026 V2" */
export function shortReleaseVersion(version: ReleaseVersion) {
  return isoToDisplay(version.date) + revisionSuffix(version);
}

/** The entries in type order, keeping the written order within a type */
export function sortedEntries(version: ReleaseVersion) {
  return RELEASE_NOTE_TYPES.flatMap((type) =>
    version.entries.filter((entry) => entry.type === type),
  );
}

/**
 * The versions newer than the one last seen, newest first, by list order.
 * Nothing seen yet → only the newest (nobody gets the whole history). An id
 * that isn't in the list (e.g. production rolled back) → nothing.
 */
export function unseenReleaseVersions(
  seenId: string | null,
  versions: ReleaseVersion[] = RELEASE_VERSIONS,
) {
  if (seenId === null) return versions.slice(0, 1);
  const index = versions.findIndex(
    (version) => releaseVersionId(version) === seenId,
  );
  return index === -1 ? [] : versions.slice(0, index);
}

/**
 * Only the entries matching the search (Turkish-aware) and type; versions
 * left without entries are dropped. A blank query doesn't filter.
 */
export function filterReleaseVersions(
  versions: ReleaseVersion[],
  filter: { query: string; type: ReleaseNoteType | null },
) {
  const query = foldTr(filter.query.trim());
  if (!query && !filter.type) return versions;
  return versions
    .map((version) => ({
      ...version,
      entries: version.entries.filter(
        (entry) =>
          (!filter.type || entry.type === filter.type) &&
          (!query || foldTr(entry.text).includes(query)),
      ),
    }))
    .filter((version) => version.entries.length > 0);
}

/**
 * Where the search matches in the original text, as [start, end) ranges.
 * foldTr keeps one character per character for normal text, so positions
 * carry over; if it ever doesn't, nothing is highlighted.
 */
export function matchRanges(
  text: string,
  query: string,
): [start: number, end: number][] {
  const folded = foldTr(text);
  const needle = foldTr(query.trim());
  if (!needle || folded.length !== text.length) return [];
  const ranges: [number, number][] = [];
  for (
    let at = folded.indexOf(needle);
    at !== -1;
    at = folded.indexOf(needle, at + needle.length)
  ) {
    ranges.push([at, at + needle.length]);
  }
  return ranges;
}
