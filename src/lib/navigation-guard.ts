import { useEffect, useRef } from "react";

let onBlockedAttempt: (() => void) | null = null;
let leavingAnyway = false;

/**
 * For leaving that must happen whatever is unsaved (the session has ended,
 * so nothing could be saved): the browser no longer asks first.
 */
export function leaveWithoutAsking() {
  leavingAnyway = true;
}

/**
 * For navigation that isn't a link (e.g. logging out): true when a page has
 * unsaved changes, in which case that page has been told to point them out.
 */
export function navigationBlocked(): boolean {
  if (!onBlockedAttempt) return false;
  onBlockedAttempt();
  return true;
}

/**
 * While `active`, keeps the user on the page: link clicks to other pages are
 * stopped before Next.js sees them, `navigationBlocked()` says no, and the
 * browser asks before a reload or closing the tab. Each stopped attempt
 * calls `onBlocked`. Links opened in a new tab and downloads lose nothing,
 * so they still work. The browser's back button is not covered.
 */
export function useNavigationGuard(active: boolean, onBlocked: () => void) {
  const latest = useRef(onBlocked);
  useEffect(() => {
    latest.current = onBlocked;
  });

  useEffect(() => {
    if (!active) return;
    const blocked = () => latest.current();

    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      const url = new URL(anchor.href);
      // same page (e.g. only the query changes): nothing is lost
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname
      ) {
        return;
      }
      // capture phase on window: runs before Next.js's own Link handler
      event.preventDefault();
      event.stopPropagation();
      blocked();
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (leavingAnyway) return;
      event.preventDefault();
    }

    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    onBlockedAttempt = blocked;
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (onBlockedAttempt === blocked) onBlockedAttempt = null;
    };
  }, [active]);
}

/** A light side-to-side shake for a save bar when leaving is stopped */
const SHAKE: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-6px)" },
  { transform: "translateX(6px)" },
  { transform: "translateX(-4px)" },
  { transform: "translateX(4px)" },
  { transform: "translateX(0)" },
];

/** Shakes the element to point it out, unless motion is reduced */
export function shakeElement(element: HTMLElement | null) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  element?.animate(SHAKE, { duration: 400, easing: "ease-in-out" });
}
