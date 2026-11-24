"use client";

import { SearchIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReleaseNoteEntry } from "@/components/release-note-entry";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  filterReleaseVersions,
  formatReleaseVersion,
  LATEST_RELEASE_ID,
  RELEASE_NOTE_LABELS,
  RELEASE_NOTE_TYPES,
  type ReleaseNoteType,
  type ReleaseVersion,
  releaseVersionId,
  sortedEntries,
  versionIdFromHash,
} from "@/lib/release-notes";
import { cn } from "@/lib/utils";

function parseType(value: string | null): ReleaseNoteType | null {
  return RELEASE_NOTE_TYPES.find((type) => type === value) ?? null;
}

/** Scrolls to a version's card and puts its id in the address */
function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#${id}`,
  );
}

export function ReleaseNotes({ versions }: { versions: ReleaseVersion[] }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [type, setType] = useState(() => parseType(searchParams.get("type")));

  const shown = useMemo(
    () => filterReleaseVersions(versions, { query, type }),
    [versions, query, type],
  );
  const shownIds = shown.map(releaseVersionId);
  const shownKey = shownIds.join(" ");
  const resultCount = shown.reduce((n, v) => n + v.entries.length, 0);

  // the version being read, for the Sürümler list
  const [readingId, setReadingId] = useState<string | null>(null);
  const activeId =
    readingId && shownIds.includes(readingId) ? readingId : shownIds[0];

  // search and type are kept in the address, like the list pages
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (type) params.set("type", type);
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${search ? `?${search}` : window.location.pathname}${window.location.hash}`,
    );
  }, [query, type]);

  // A version picked from the list (or the address) stays highlighted until
  // the user scrolls themselves: the last ones can't reach the top of the
  // screen, so the scroll position alone would name an earlier one
  const pinned = useRef(false);

  // opened with a version's link (#2026-11-13)
  useEffect(() => {
    const id = versionIdFromHash(window.location.hash);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView();
    pinned.current = true;
    setReadingId(id);
  }, []);

  // the version being read: the last card whose top has passed a line just
  // under the sticky header, or the last card once the page can't scroll on
  useEffect(() => {
    const ids = shownKey ? shownKey.split(" ") : [];
    let frame = 0;
    const update = () => {
      frame = 0;
      if (pinned.current || ids.length === 0) return;
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setReadingId(ids[ids.length - 1]);
        return;
      }
      const line = 56 + 120;
      const passed = ids.filter(
        (id) =>
          (document.getElementById(id)?.getBoundingClientRect().top ?? 0) <=
          line,
      );
      setReadingId(passed.at(-1) ?? ids[0]);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // at the bottom, a wheel turn scrolls nothing, so look again here too
    const unpin = () => {
      pinned.current = false;
      onScroll();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", unpin, { passive: true });
    window.addEventListener("touchmove", unpin, { passive: true });
    window.addEventListener("keydown", unpin);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", unpin);
      window.removeEventListener("touchmove", unpin);
      window.removeEventListener("keydown", unpin);
    };
  }, [shownKey]);

  const goTo = (id: string) => {
    pinned.current = true;
    setReadingId(id);
    jumpTo(id);
  };

  const versionItems = shown.map((version) => ({
    value: releaseVersionId(version),
    label: formatReleaseVersion(version),
  }));

  return (
    <div className="flex gap-8">
      <div className="flex max-w-3xl min-w-0 flex-1 flex-col gap-3">
        <div className="relative w-full max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ara… (ör. tahsilat)"
            aria-label="Sürüm notlarında ara"
            className="bg-card pl-8"
          />
        </div>

        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Tür</legend>
          <TypeChip active={type === null} onClick={() => setType(null)}>
            Tümü
          </TypeChip>
          {RELEASE_NOTE_TYPES.map((option) => (
            <TypeChip
              key={option}
              active={type === option}
              onClick={() => setType(option)}
            >
              {RELEASE_NOTE_LABELS[option]}
            </TypeChip>
          ))}
        </fieldset>

        {query.trim() !== "" && shown.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {shown.length} sürümde {resultCount} sonuç
          </p>
        )}

        {shown.length > 0 && (
          <Select
            items={versionItems}
            value={activeId}
            onValueChange={(id) => id && goTo(id)}
          >
            <SelectTrigger
              aria-label="Sürüme git"
              className="w-full max-w-60 bg-card lg:hidden"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {shown.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Sonuç bulunamadı
          </p>
        ) : (
          shown.map((version) => {
            const id = releaseVersionId(version);
            return (
              <section
                key={id}
                id={id}
                aria-labelledby={`${id}-title`}
                className="scroll-mt-16 rounded-lg border bg-card px-4 py-3"
              >
                <h2
                  id={`${id}-title`}
                  className="mb-1.5 flex flex-wrap items-baseline gap-2 font-semibold"
                >
                  {formatReleaseVersion(version)}
                  {id === LATEST_RELEASE_ID && (
                    <span className="text-xs font-normal text-muted-foreground">
                      En son
                    </span>
                  )}
                  {version.label && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {version.label}
                    </span>
                  )}
                </h2>
                <ul>
                  {sortedEntries(version).map((note) => (
                    <ReleaseNoteEntry
                      key={`${note.type}:${note.text}`}
                      note={note}
                      query={query}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      {shown.length > 0 && (
        <nav aria-label="Sürümler" className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-16">
            <h2 className="mb-1.5 text-sm font-semibold">Sürümler</h2>
            <ul className="text-sm">
              {versionItems.map((item) => (
                <li key={item.value}>
                  <a
                    href={`#${item.value}`}
                    aria-current={
                      item.value === activeId ? "location" : undefined
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      goTo(item.value);
                    }}
                    className={cn(
                      "block border-l-2 py-1 pl-2.5 text-muted-foreground hover:text-foreground",
                      item.value === activeId
                        ? "border-sidebar-primary font-semibold text-sidebar"
                        : "border-border",
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </div>
  );
}

function TypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active
          ? "border-sidebar bg-sidebar text-white"
          : "bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
