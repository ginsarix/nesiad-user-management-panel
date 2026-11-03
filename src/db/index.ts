import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";

// Object form: the bare-string form throws on `undefined`, which it is during a
// CI build with SKIP_ENV_VALIDATION. The pool only connects on the first query.
export const db = drizzle({
  connection: { connectionString: env.DATABASE_URL },
});

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** `db` or a transaction */
export type Executor = typeof db | Transaction;
