"use client";

import { CircleCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { shakeElement, useNavigationGuard } from "@/lib/navigation-guard";
import { cn } from "@/lib/utils";

const SAVED_NOTICE_MS = 3000;

/**
 * The bar for a page edited in place (proje Taahhütler, Tahakkuk): shown
 * while there are unsaved changes, with İptal and Kaydet (a submit button,
 * so it goes inside the form). While `dirty`, leaving the page is stopped
 * and the bar turns red and shakes. Each new `savedAt` shows `savedText`
 * for a moment. Leaves room under the page so it never covers the last rows.
 */
export function SaveBar({
  dirty,
  saving,
  error,
  savedAt,
  savedText,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  error: Error | null;
  savedAt: number | null;
  savedText: string;
  onDiscard: () => void;
}) {
  const bar = useRef<HTMLElement>(null);
  const [leaveAttempted, setLeaveAttempted] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (savedAt === null) return;
    setJustSaved(true);
    setLeaveAttempted(false);
    const timer = setTimeout(() => setJustSaved(false), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  useNavigationGuard(dirty, () => {
    setLeaveAttempted(true);
    requestAnimationFrame(() => shakeElement(bar.current));
  });
  const pointOut = leaveAttempted && dirty;

  if (!dirty && !justSaved) return null;

  return (
    <>
      {/* room to scroll the last rows above the bar */}
      <div className="h-24" aria-hidden />
      <section
        ref={bar}
        aria-label="Kaydedilmemiş değişiklikler"
        className={cn(
          "fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 shadow-lg transition-[border-color,box-shadow] animate-in fade-in-0 slide-in-from-bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6",
          pointOut && "border-destructive ring-3 ring-destructive/20",
        )}
      >
        <div aria-live="polite" className="mr-auto text-sm">
          {justSaved && !dirty ? (
            <span className="flex items-center gap-1.5 text-primary">
              <CircleCheck className="size-4" />
              {savedText}
            </span>
          ) : error ? (
            <span className="text-destructive">
              Kaydedilemedi. {error.message}
            </span>
          ) : pointOut ? (
            <span className="text-destructive">
              Sayfadan ayrılmadan önce değişiklikleri kaydedin ya da iptal edin.
            </span>
          ) : (
            "Kaydedilmemiş değişiklikler var"
          )}
        </div>
        {dirty && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setLeaveAttempted(false);
                onDiscard();
              }}
            >
              İptal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
