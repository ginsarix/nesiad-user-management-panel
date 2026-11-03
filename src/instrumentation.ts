// Runs once before the server takes requests
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Fail at startup on a missing or invalid environment variable, not on the
  // first request that reads it
  await import("@/lib/env");

  // Next doesn't call register() during `next build` today; never seed there
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Not awaited: a slow mail server or database must not delay or break
  // startup. Each start creates the default admin if its email is missing
  const { ensureDefaultAdmin } = await import("@/lib/default-admin");
  void ensureDefaultAdmin().then(
    (result) => {
      if (result.startsWith("created")) {
        console.log(`Default admin: ${result}`);
      }
    },
    (error: unknown) => console.error("Default admin check failed:", error),
  );
}
