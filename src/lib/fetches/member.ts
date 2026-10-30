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

export async function getMembers() {
  const res = await rpcClient.api.members.$get();

  if (!res.ok) throw new Error("An error occured while getting members");

  return await res.json();
}

/** Resolves to null when the member does not exist */
export async function getMember(id: number) {
  const res = await rpcClient.api.members[":id"].$get({
    param: { id: String(id) },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the member");

  return await res.json();
}

/** Text fields are always sent so clearing one in the form clears it in the DB */
function toMemberForm({ logo, removeLogo, ...fields }: MemberFormValues) {
  return {
    ...fields,
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

export async function deleteMember(id: number) {
  const res = await rpcClient.api.members[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Üye silinemedi");
}

export type MemberListItem = Awaited<ReturnType<typeof getMembers>>[number];
export type MemberDetails = NonNullable<Awaited<ReturnType<typeof getMember>>>;
