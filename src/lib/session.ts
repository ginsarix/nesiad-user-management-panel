import type { ClientRequestOptions } from "hono/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

// Server-only: reads the incoming request's headers.

/** The current session, or null; cached for the duration of a request */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/** The current session; sends the user to the login page without one */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Options for API calls made while rendering on the server: forwards the
 * user's cookies so the API sees the same session.
 */
export async function forwardedRequestOptions(): Promise<ClientRequestOptions> {
  return { headers: { cookie: (await headers()).get("cookie") ?? "" } };
}
