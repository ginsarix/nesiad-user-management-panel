"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CirclePause } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type RepresentativeDetails,
  setRepresentativeActive,
} from "@/lib/fetches/representative";
import { invalidateSmsQueries } from "@/lib/fetches/sms";

/** "Pasife al" / "Aktife al" in one click; reversible, so no confirmation */
export function ToggleActiveButton({
  representative,
}: {
  representative: RepresentativeDetails;
}) {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      setRepresentativeActive(representative.id, !representative.active),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["representatives"] }),
        // member pages tag pasif yetkililer
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        invalidateSmsQueries(queryClient),
      ]),
    onError: (error) => window.alert(error.message),
  });

  return (
    <Button variant="outline" disabled={isPending} onClick={() => mutate()}>
      {representative.active ? <CirclePause /> : <CircleCheck />}
      {representative.active ? "Pasife al" : "Aktife al"}
    </Button>
  );
}
