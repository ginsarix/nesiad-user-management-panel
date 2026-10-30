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

export const idParamSchema = z.object({
  id: safeNumSchema(z.number().int().positive()),
});
