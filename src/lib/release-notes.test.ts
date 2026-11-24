import { describe, expect, it } from "vitest";
import { parseIsoDate } from "./dates";
import {
  filterReleaseVersions,
  formatReleaseVersion,
  LATEST_RELEASE_ID,
  matchRanges,
  RELEASE_VERSIONS,
  type ReleaseVersion,
  releaseVersionId,
  shortReleaseVersion,
  sortedEntries,
  unseenReleaseVersions,
} from "./release-notes";

const ids = (versions: ReleaseVersion[]) => versions.map(releaseVersionId);

describe("RELEASE_VERSIONS", () => {
  it("has valid dates and unique ids", () => {
    for (const version of RELEASE_VERSIONS) {
      expect(parseIsoDate(version.date), version.date).not.toBeNull();
    }
    const all = ids(RELEASE_VERSIONS);
    expect(new Set(all).size).toBe(all.length);
  });

  it("is newest first, and a day's revisions run 2, 3… without gaps", () => {
    const oldestFirst = [...RELEASE_VERSIONS].reverse();
    oldestFirst.forEach((version, i) => {
      const previous = oldestFirst[i - 1];
      const id = releaseVersionId(version);
      if (previous && previous.date === version.date) {
        expect(version.revision, id).toBe((previous.revision ?? 1) + 1);
      } else {
        expect(version.revision, id).toBeUndefined();
        if (previous) expect(version.date > previous.date, id).toBe(true);
      }
    });
  });

  it("has no empty version or text", () => {
    for (const version of RELEASE_VERSIONS) {
      expect(version.entries.length, version.date).toBeGreaterThan(0);
      for (const entry of version.entries) {
        expect(entry.text.trim()).not.toBe("");
      }
    }
  });

  it("LATEST_RELEASE_ID is the newest version's id", () => {
    expect(LATEST_RELEASE_ID).toBe(releaseVersionId(RELEASE_VERSIONS[0]));
  });
});

it("names versions", () => {
  const first: ReleaseVersion = { date: "2026-11-24", entries: [] };
  const second: ReleaseVersion = {
    date: "2026-11-24",
    revision: 2,
    entries: [],
  };
  expect(releaseVersionId(first)).toBe("2026-11-24");
  expect(releaseVersionId(second)).toBe("2026-11-24-v2");
  expect(formatReleaseVersion(first)).toBe("24 Kasım 2026");
  expect(formatReleaseVersion(second)).toBe("24 Kasım 2026 V2");
  expect(formatReleaseVersion({ date: "2026-03-01", entries: [] })).toBe(
    "1 Mart 2026",
  );
  expect(shortReleaseVersion(first)).toBe("24.11.2026");
  expect(shortReleaseVersion(second)).toBe("24.11.2026 V2");
});

it("sorts entries by type, keeping written order within a type", () => {
  const version: ReleaseVersion = {
    date: "2026-11-24",
    entries: [
      { type: "fixed", text: "A" },
      { type: "new", text: "B" },
      { type: "removed", text: "E" },
      { type: "fixed", text: "C" },
      { type: "new", text: "D" },
      { type: "improved", text: "F" },
      { type: "changed", text: "G" },
    ],
  };
  expect(sortedEntries(version).map((entry) => entry.text)).toEqual([
    "B",
    "D",
    "F",
    "G",
    "A",
    "C",
    "E",
  ]);
});

describe("unseenReleaseVersions", () => {
  const versions: ReleaseVersion[] = [
    { date: "2026-12-02", revision: 2, entries: [] },
    { date: "2026-12-02", entries: [] },
    { date: "2026-11-25", entries: [] },
    { date: "2026-11-13", entries: [] },
  ];

  it("only the newest when nothing was seen", () => {
    expect(ids(unseenReleaseVersions(null, versions))).toEqual([
      "2026-12-02-v2",
    ]);
  });

  it("none when up to date", () => {
    expect(unseenReleaseVersions("2026-12-02-v2", versions)).toEqual([]);
  });

  it("a same-day V2 after its day's first version", () => {
    expect(ids(unseenReleaseVersions("2026-12-02", versions))).toEqual([
      "2026-12-02-v2",
    ]);
  });

  it("every newer one when behind", () => {
    expect(ids(unseenReleaseVersions("2026-11-25", versions))).toEqual([
      "2026-12-02-v2",
      "2026-12-02",
    ]);
  });

  it("goes by list order, not string order", () => {
    const many: ReleaseVersion[] = [
      { date: "2026-12-02", revision: 10, entries: [] },
      { date: "2026-12-02", revision: 9, entries: [] },
    ];
    expect(ids(unseenReleaseVersions("2026-12-02-v9", many))).toEqual([
      "2026-12-02-v10",
    ]);
  });

  it("none for an id not in the list", () => {
    expect(unseenReleaseVersions("2099-01-01", versions)).toEqual([]);
  });

  it("uses the real list by default", () => {
    expect(ids(unseenReleaseVersions(null))).toEqual([LATEST_RELEASE_ID]);
  });
});

describe("filterReleaseVersions", () => {
  const versions: ReleaseVersion[] = [
    {
      date: "2026-11-25",
      entries: [
        { type: "new", text: "İŞ Kurulu eklendi" },
        { type: "fixed", text: "Işık düzeltildi" },
      ],
    },
    { date: "2026-11-13", entries: [{ type: "new", text: "Tahsilat" }] },
  ];

  it("matches Turkish text ignoring case and accents", () => {
    const texts = (query: string) =>
      filterReleaseVersions(versions, { query, type: null }).flatMap((v) =>
        v.entries.map((entry) => entry.text),
      );
    expect(texts("is")).toEqual(["İŞ Kurulu eklendi", "Işık düzeltildi"]);
    expect(texts("IŞIK")).toEqual(["Işık düzeltildi"]);
  });

  it("combines search and type, dropping empty versions", () => {
    const result = filterReleaseVersions(versions, {
      query: "is",
      type: "fixed",
    });
    expect(ids(result)).toEqual(["2026-11-25"]);
    expect(result[0].entries.map((entry) => entry.text)).toEqual([
      "Işık düzeltildi",
    ]);

    expect(
      ids(filterReleaseVersions(versions, { query: "", type: "new" })),
    ).toEqual(["2026-11-25", "2026-11-13"]);
    expect(
      filterReleaseVersions(versions, { query: "tahsilat", type: "fixed" }),
    ).toEqual([]);
  });

  it("treats a blank query as no search", () => {
    expect(
      filterReleaseVersions(versions, { query: "   ", type: null }),
    ).toEqual(versions);
  });

  it("does not throw on regex characters", () => {
    expect(filterReleaseVersions(versions, { query: "(", type: null })).toEqual(
      [],
    );
  });
});

describe("matchRanges", () => {
  it("returns positions in the original text", () => {
    expect(matchRanges("Yeni İŞ Kurulu", "iş")).toEqual([[5, 7]]);
    expect(matchRanges("ışık ışık", "isik")).toEqual([
      [0, 4],
      [5, 9],
    ]);
  });

  it("returns nothing for a blank query", () => {
    expect(matchRanges("Tahsilat", "  ")).toEqual([]);
  });

  it("matches a trimmed query", () => {
    expect(matchRanges("Tahsilat", " hsi ")).toEqual([[2, 5]]);
  });
});
