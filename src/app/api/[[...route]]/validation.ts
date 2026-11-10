import type { Context } from "hono";
import { z } from "zod";
import { safeNumSchema } from "@/lib/zod-schemas/shared";

/**
 * zValidator hook: responds with `{ error }` holding the first issue's
 * message, the same shape every other error response uses.
 */
export function respondWithFirstIssue(
  result: {
    success: boolean;
    error?: { issues: readonly { message: string }[] };
  },
  c: Context,
) {
  if (!result.success) {
    return c.json(
      { error: result.error?.issues[0]?.message ?? "Geçersiz istek" },
      400,
    );
  }
}

/**
 * zValidator hook for forms the client can map to an input: responds with
 * `{ error, field }`, the first issue's message and the field it is about.
 */
export function respondWithFirstField(
  result: {
    success: boolean;
    error?: {
      issues: readonly { message: string; path: readonly PropertyKey[] }[];
    };
  },
  c: Context,
) {
  if (!result.success) {
    const issue = result.error?.issues[0];
    return c.json(
      {
        error: issue?.message ?? "Geçersiz istek",
        // nested fields as "project.number"
        field: issue?.path.length
          ? issue.path.map(String).join(".")
          : undefined,
      },
      400,
    );
  }
}

export const idParamSchema = z.object({
  id: safeNumSchema(z.number().int().positive()),
});
