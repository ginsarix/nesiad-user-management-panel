-- Sessions now end after 30 minutes without use (session.expiresIn).
-- Sessions opened under the old 30-day limit would otherwise keep it until
-- they end: give them 30 minutes from the deploy instead. Staff using the
-- panel then keep their session, since their activity extends it.
-- expires_at holds UTC (drizzle writes toISOString()) and the database's
-- TimeZone may not be UTC, so now() is converted explicitly.
UPDATE "session" SET "expires_at" = LEAST("expires_at", (now() AT TIME ZONE 'UTC') + interval '30 minutes');
