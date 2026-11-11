import type { ClientRequestOptions } from "hono/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

// Server-only: reads the incoming request's headers.

/**
 * The current session, or null; cached for the duration of a request.
 * Never extends it: a server component can't renew the cookie, so only the
 * browser's activity reports do (see SessionTimeout).
 */
export const getSession = cache(async () =>
  auth.api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  }),
);

/** The current session; sends the user to the login page without one */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Headers for API calls made while rendering on the server: forwards the
 * user's cookies so the API sees the same session.
 */
export async function forwardedHeaders() {
  return { cookie: (await headers()).get("cookie") ?? "" };
}

/** forwardedHeaders() as Hono RPC client options */
export async function forwardedRequestOptions(): Promise<ClientRequestOptions> {
  return { headers: await forwardedHeaders() };
}
