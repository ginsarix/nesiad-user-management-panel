// Runs once, after every test file: per-file cleanup would delete rows that
// tests in other files (running in parallel) are still checking.
export async function teardown() {
  const { like, or } = await import("drizzle-orm");
  const { db } = await import("../db");
  const { auditLogTable } = await import("../db/schema");

  // The API tests change "__test__" records, which writes audit log rows;
  // the records are deleted afterwards, so their trail goes too
  await db
    .delete(auditLogTable)
    .where(
      or(
        like(auditLogTable.entityLabel, "%\\_\\_test\\_\\_%"),
        like(auditLogTable.actorEmail, "\\_\\_test\\_\\_%"),
      ),
    );
  await db.$client.end();
}
