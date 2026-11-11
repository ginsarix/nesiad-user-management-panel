// Shared by the server's session config and the panel's SessionTimeout.

/** A panel session ends after this long without use */
export const SESSION_IDLE_SECONDS = 30 * 60;

/**
 * better-auth's updateAge: a session last extended longer ago than this is
 * extended again when its tab reports use. Below ACTIVITY_PING_MS so every
 * report extends it.
 */
export const SESSION_REFRESH_SECONDS = 45;

/** How often, at most, an open panel tab reports that someone is using it */
export const ACTIVITY_PING_MS = 60 * 1000;
