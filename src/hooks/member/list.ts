import { useQuery } from "@tanstack/react-query";
import type { InferRequestType } from "hono";
import { rpcClient } from "@/lib/rpc-client";
import { memberQueryKeys } from "./keys";

type MembersGetRequestType = InferRequestType<
  typeof rpcClient.api.members.$get
>["query"];

export function useMemberList(query: MembersGetRequestType) {
  const { data: members } = useQuery({
    queryKey: [memberQueryKeys.all, { limit: query.limit, skip: query.skip }],
    queryFn: async () => {
      const res = await rpcClient.api.members.$get({
        query: {
          limit: String(query.limit),
          skip: String(query.skip),
        },
      });

      if (!res.ok) throw new Error("Failed to fetch members");

      return res.json();
    },
  });

  return members;
}
