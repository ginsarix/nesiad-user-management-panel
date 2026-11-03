// Runs once before the server takes requests: fail at startup on a missing or
// invalid environment variable, not on the first request that reads it
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
