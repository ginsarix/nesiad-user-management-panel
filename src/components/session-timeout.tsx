"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { leaveWithoutAsking } from "@/lib/navigation-guard";
import { ACTIVITY_PING_MS } from "@/lib/session-idle";

/** What counts as someone using the panel */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;

/** How often the tab compares the session's end with the clock (no request) */
const EXPIRY_CHECK_MS = 15 * 1000;

/**
 * Ends the panel session after SESSION_IDLE_SECONDS without use. Opening a
 * page, typing, clicking and scrolling report use at most once a minute by
 * asking better-auth for the session, which extends it and renews the cookie
 * (so a long form being typed keeps it alive). When the session is gone
 * (idle, logged out in another tab, disabled account) the tab goes to the
 * login page, which brings the user back here.
 */
export function SessionTimeout() {
  useEffect(() => {
    let expiresAt = Number.POSITIVE_INFINITY;
    let lastReport = 0;
    let inFlight = false;
    let left = false;

    function leave() {
      left = true;
      // nothing unsaved could be saved now, and member data shouldn't stay
      // on screen behind a "leave this page?" prompt
      leaveWithoutAsking();
      const params = new URLSearchParams({
        next: window.location.pathname + window.location.search,
      });
      if (Date.now() >= expiresAt) params.set("idle", "1");
      window.location.replace(`/login?${params}`);
    }

    async function askSession(extend: boolean) {
      if (inFlight || left) return;
      inFlight = true;
      try {
        // no query to extend: better-auth reads ?disableRefresh=false as true
        const { data, error } = await authClient.getSession(
          extend ? undefined : { query: { disableRefresh: true } },
        );
        // a server error: the next report or check tries again
        if (error) return;
        if (!data) {
          leave();
          return;
        }
        expiresAt = new Date(data.session.expiresAt).getTime();
      } catch {
        // offline: the next report or check tries again
      } finally {
        inFlight = false;
      }
    }

    function onActivity() {
      if (inFlight || Date.now() - lastReport < ACTIVITY_PING_MS) return;
      lastReport = Date.now();
      void askSession(true);
    }

    // another tab may have extended it, so ask before leaving
    function checkExpiry() {
      if (Date.now() >= expiresAt) void askSession(false);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") checkExpiry();
    }

    onActivity();
    for (const name of ACTIVITY_EVENTS) {
      // capture: scrolls inside elements don't bubble up to window
      window.addEventListener(name, onActivity, {
        capture: true,
        passive: true,
      });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(checkExpiry, EXPIRY_CHECK_MS);

    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
