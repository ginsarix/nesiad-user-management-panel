import { useQuery } from "@tanstack/react-query";
import { rpcClient } from "@/lib/rpc-client";
import type { Pagination } from "@/types/pagination";
import { memberQueryKeys } from "./keys";

export function useMemberList(pagination: Pagination) {
  const { data: members } = useQuery({
    queryKey: [
      memberQueryKeys.all,
      { limit: pagination.limit, skip: pagination.skip },
    ],
    queryFn: async () => {
      const res = await rpcClient.api.members.$get({
        query: {
          limit: String(pagination.limit),
          skip: String(pagination.skip),
        },
      });

      if (!res.ok) throw new Error("Failed to fetch members");

      return res.json();
    },
  });

  return members;
}
