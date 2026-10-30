import { hc } from "hono/client";
import type { AppType } from "@/app/api/[[...route]]/route";
import { env } from "./env";

/**
 * Sends the browser to the login page when the session has expired, so an
 * open tab doesn't just show errors. Server-side callers get the 401 as is.
 */
const fetchWithLoginRedirect: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);

  if (res.status === 401 && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  return res;
};

export const rpcClient = hc<AppType>(`${env.NEXT_PUBLIC_APP_URL}/`, {
  fetch: fetchWithLoginRedirect,
});
