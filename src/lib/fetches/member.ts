import { rpcClient } from "../rpc-client";

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

export type MemberListItem = Awaited<ReturnType<typeof getMembers>>[number];
export type MemberDetails = NonNullable<Awaited<ReturnType<typeof getMember>>>;
