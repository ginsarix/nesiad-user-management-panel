"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { InferRequestType } from "hono";
import { getMembers } from "@/lib/fetches/member";
import { getQueryClient } from "@/lib/query-client";
import { rpcClient } from "@/lib/rpc-client";

export function Members() {
  const { data: membersData } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  const { mutate } = useMutation({
    mutationKey: ["members"],
    mutationFn: async (
      form: Omit<
        InferRequestType<typeof rpcClient.api.members.$post>["form"],
        "title"
      > & { title: string },
    ) => {
      const res = await rpcClient.api.members.$post({
        form,
      });

      if (!res.ok) {
        console.error("Error occured while creating member", await res.json());
        return;
      }

      return await res.json();
    },
    onSuccess: async () => {
      await getQueryClient().invalidateQueries({ queryKey: ["members"] });
    },
  });

  return (
    <>
      {membersData?.map((m) => (
        <span key={m.id}>{m.title}</span>
      ))}

      <button
        onClick={() =>
          mutate({ title: `Merhaba ${Math.floor(Math.random() * 10)}` })
        }
        type="button"
      >
        Add member
      </button>
    </>
  );
}
