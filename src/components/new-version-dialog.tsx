"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReleaseNoteEntry } from "@/components/release-note-entry";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { markReleaseNotesSeen } from "@/lib/fetches/release-notes";
import { footerLinks, isNavItemActive } from "@/lib/nav";
import {
  formatReleaseVersion,
  type ReleaseVersion,
  releaseVersionId,
  sortedEntries,
} from "@/lib/release-notes";

const [releaseNotesLink] = footerLinks;

/**
 * Tells the user about the versions they haven't seen, once. Any way of
 * closing it counts as seen, and so does opening Sürüm Notları itself (it
 * never opens there). The panel layout passes the unseen versions; it
 * doesn't re-render on client-side navigation, so `done` keeps it shut.
 */
export function NewVersionDialog({ versions }: { versions: ReleaseVersion[] }) {
  const pathname = usePathname();
  const onNotesPage = isNavItemActive(releaseNotesLink, pathname);
  const [done, setDone] = useState(versions.length === 0);
  const okButton = useRef<HTMLButtonElement>(null);

  const finish = useCallback(() => {
    setDone(true);
    // if this fails, the dialog comes back on the next page load
    markReleaseNotesSeen().catch(console.error);
  }, []);

  useEffect(() => {
    if (!done && onNotesPage) finish();
  }, [done, onNotesPage, finish]);

  if (versions.length === 0) return null;
  const [newest] = versions;

  return (
    <Dialog
      open={!done && !onNotesPage}
      onOpenChange={(open) => {
        if (!open) finish();
      }}
    >
      <DialogContent className="sm:max-w-lg" initialFocus={okButton}>
        <DialogHeader>
          <DialogTitle>Panel güncellendi</DialogTitle>
          <DialogDescription>
            {versions.length === 1
              ? `${formatReleaseVersion(newest)} sürümündeki yenilikler`
              : `Son girişinizden bu yana ${versions.length} sürüm`}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-4 max-h-[60vh] overflow-y-auto px-4">
          {versions.map((version) => (
            <section key={releaseVersionId(version)}>
              {versions.length > 1 && (
                <h3 className="mt-2 mb-1 text-sm font-semibold first:mt-0">
                  {formatReleaseVersion(version)}
                </h3>
              )}
              <ul>
                {sortedEntries(version).map((note) => (
                  <ReleaseNoteEntry
                    key={`${note.type}:${note.text}`}
                    note={note}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <Link
            href={releaseNotesLink.href}
            onClick={finish}
            className="text-sm text-primary underline underline-offset-3"
          >
            Tüm sürüm notları
          </Link>
          <Button ref={okButton} onClick={finish}>
            Tamam
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
