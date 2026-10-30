import type { ClientRequestOptions } from "hono/client";
import { displayToIso } from "../dates";
import { rpcClient } from "../rpc-client";
import type { MemberFormValues } from "../zod-schemas/member";

/** Throws the API's `{ error }` message, or the fallback if there is none */
async function throwResponseError(
  res: { json(): Promise<unknown> },
  fallback: string,
): Promise<never> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  throw new Error(body?.error ?? fallback);
}

export function logoUrl(filename: string) {
  return `/api/files/${encodeURIComponent(filename)}`;
}

/** `options` lets server-side prefetches forward the user's cookies */
export async function getMembers(options?: ClientRequestOptions) {
  const res = await rpcClient.api.members.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting members");

  return await res.json();
}

/** Resolves to null when the member does not exist */
export async function getMember(id: number, options?: ClientRequestOptions) {
  const res = await rpcClient.api.members[":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the member");

  return await res.json();
}

/** Text fields are always sent so clearing one in the form clears it in the DB */
function toMemberForm({
  logo,
  removeLogo,
  active,
  memberLoginDate,
  foundingDate,
  ...fields
}: MemberFormValues) {
  return {
    ...fields,
    // the form holds gg.aa.yyyy, the API takes yyyy-aa-gg
    memberLoginDate: displayToIso(memberLoginDate),
    foundingDate: displayToIso(foundingDate),
    active: String(active),
    ...(logo ? { logo } : removeLogo && { removeLogo: "true" }),
  };
}

export async function createMember(values: MemberFormValues) {
  const res = await rpcClient.api.members.$post({
    form: toMemberForm(values),
  });

  if (!res.ok) await throwResponseError(res, "Üye kaydedilemedi");

  return (await res.json()) as { id: number };
}

export async function updateMember(id: number, values: MemberFormValues) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: toMemberForm(values),
  });

  if (!res.ok) await throwResponseError(res, "Üye güncellenemedi");
}

export async function setMemberActive(id: number, active: boolean) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: { active: String(active) },
  });

  if (!res.ok) await throwResponseError(res, "Üye durumu değiştirilemedi");
}

export async function deleteMember(id: number) {
  const res = await rpcClient.api.members[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Üye silinemedi");
}

export type MemberListItem = Awaited<ReturnType<typeof getMembers>>[number];
export type MemberDetails = NonNullable<Awaited<ReturnType<typeof getMember>>>;
