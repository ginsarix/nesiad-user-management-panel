import type { ClientRequestOptions } from "hono/client";
import { displayToIso } from "../dates";
import { rpcClient } from "../rpc-client";
import type { MemberFormValues } from "../zod-schemas/member";
import { throwResponseError } from "./errors";

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
  status,
  memberLoginDate,
  foundingDate,
  sectorId,
  birthDate,
  identityDocument,
  activityDocument,
  title,
  ...fields
}: MemberFormValues) {
  return {
    title,
    // fields the form leaves out (undefined) are not sent, so they stay as stored
    ...(Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ) as {
      [K in keyof typeof fields]?: Exclude<(typeof fields)[K], undefined>;
    }),
    sectorId: sectorId === null ? "" : String(sectorId),
    // the form holds gg.aa.yyyy, the API takes yyyy-aa-gg
    memberLoginDate: displayToIso(memberLoginDate),
    foundingDate: displayToIso(foundingDate),
    ...(birthDate !== undefined && { birthDate: displayToIso(birthDate) }),
    ...(identityDocument && { identityDocument }),
    ...(activityDocument && { activityDocument }),
    ...(status && { status }),
    ...(logo ? { logo } : removeLogo && { removeLogo: "true" }),
  };
}

/** The full TC number, shown only when a staff member asks for it */
export async function getMemberNationalId(id: number) {
  const res = await rpcClient.api.members[":id"]["national-id"].$get({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "TC Kimlik No alınamadı");

  const body = (await res.json()) as { nationalId: string | null };
  return body.nationalId;
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

export async function setMemberStatus(
  id: number,
  status: "active" | "passive",
) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: { status },
  });

  if (!res.ok) await throwResponseError(res, "Üye durumu değiştirilemedi");
}

/** Replaces the logo; the API deletes the old file */
export async function setMemberLogo(id: number, logo: File) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: { logo },
  });

  if (!res.ok) await throwResponseError(res, "Logo kaydedilemedi");
}

export async function removeMemberLogo(id: number) {
  const res = await rpcClient.api.members[":id"].$patch({
    param: { id: String(id) },
    form: { removeLogo: "true" },
  });

  if (!res.ok) await throwResponseError(res, "Logo silinemedi");
}

export async function deleteMember(id: number) {
  const res = await rpcClient.api.members[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Üye silinemedi");
}

export type MemberListItem = Awaited<ReturnType<typeof getMembers>>[number];
export type MemberDetails = NonNullable<Awaited<ReturnType<typeof getMember>>>;
