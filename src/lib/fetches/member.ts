import { rpcClient } from "../rpc-client";

export async function getMembers() {
  const res = await rpcClient.api.members.$get({
    query: { limit: "100", skip: "0" },
  });

  if (!res.ok) throw new Error("An error occured while getting members");

  return await res.json();
}
