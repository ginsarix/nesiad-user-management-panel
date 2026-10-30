import { DrizzleQueryError } from "drizzle-orm";

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";

/** The Postgres error code behind a failed query, e.g. "23505" */
export function pgErrorCode(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  const code = (cause as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}
