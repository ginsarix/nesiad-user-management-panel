import type { AuditChange, AuditField } from "@/db/schema";
import { isoToDisplay } from "./dates";
import { MEMBER_STATUS_LABELS, type MemberStatus } from "./member-status";

const EMPTY = "—";

/** Display formats for audited fields; values are stored already formatted */
export const formatAudit = {
  text: (value: unknown) =>
    typeof value === "string" && value.trim() ? value : EMPTY,
  date: (value: unknown) =>
    (typeof value === "string" && isoToDisplay(value)) || EMPTY,
  active: (value: unknown) => (value ? "Aktif" : "Pasif"),
  memberStatus: (value: unknown) =>
    MEMBER_STATUS_LABELS[value as MemberStatus] ?? EMPTY,
};

/** label + formatter per audited field of a record */
export type AuditSpec = Record<
  string,
  { label: string; format: (value: unknown) => string }
>;

/**
 * Field-level changes between `before` and `update`. Only fields present in
 * `update` count, so a partial update (e.g. just `active`) lists just that.
 */
export function diffFields(
  spec: AuditSpec,
  before: Record<string, unknown>,
  update: Record<string, unknown>,
): AuditChange[] {
  return Object.entries(spec).flatMap(([key, { label, format }]) => {
    if (!(key in update) || update[key] === undefined) return [];
    const from = format(before[key]);
    const to = format(update[key]);
    return from === to ? [] : [{ label, from, to }];
  });
}

/** The record's audited fields, for create and delete entries */
export function describeFields(
  spec: AuditSpec,
  record: Record<string, unknown>,
): AuditField[] {
  return Object.entries(spec).map(([key, { label, format }]) => ({
    label,
    value: format(record[key]),
  }));
}

/** Compares already-formatted values, e.g. a sector name or a member list */
export function change(
  label: string,
  from: string | null | undefined,
  to: string | null | undefined,
): AuditChange[] {
  const before = from?.trim() ? from : EMPTY;
  const after = to?.trim() ? to : EMPTY;
  return before === after ? [] : [{ label, from: before, to: after }];
}

const REDACTED = "•••";

/**
 * Changes to personal data: only whether a value was set is recorded, never
 * the value. Compares the raw values and, like `diffFields`, only looks at
 * fields present in `update`.
 */
export function diffRedacted(
  labels: Record<string, string>,
  before: Record<string, unknown>,
  update: Record<string, unknown>,
): AuditChange[] {
  const isSet = (value: unknown) =>
    value != null && !(typeof value === "string" && !value.trim());

  return Object.entries(labels).flatMap(([key, label]) => {
    if (!(key in update) || update[key] === undefined) return [];
    const was = before[key] ?? null;
    const now = update[key] ?? null;
    if (was === now) return [];
    const from = isSet(was) ? REDACTED : EMPTY;
    const to = isSet(now) ? REDACTED : EMPTY;
    // "" -> null is no change worth a line; both sides empty
    if (from === EMPTY && to === EMPTY) return [];
    return [{ label, from, to }];
  });
}
