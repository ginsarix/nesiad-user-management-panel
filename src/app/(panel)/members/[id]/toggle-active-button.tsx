"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CirclePause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type MemberDetails, setMemberStatus } from "@/lib/fetches/member";
import { invalidateSmsQueries } from "@/lib/fetches/sms";

/** "Pasife al" / "Aktife al" in one click; reversible, so no confirmation */
export function ToggleActiveButton({ member }: { member: MemberDetails }) {
  const queryClient = useQueryClient();

  const active = member.status === "active";

  const { mutate, isPending } = useMutation({
    mutationFn: () => setMemberStatus(member.id, active ? "passive" : "active"),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        invalidateSmsQueries(queryClient),
      ]),
    onError: (error) => window.alert(error.message),
  });

  return (
    <Button variant="outline" disabled={isPending} onClick={() => mutate()}>
      {active ? <CirclePause /> : <CircleCheck />}
      {active ? "Pasife al" : "Aktife al"}
    </Button>
  );
}
