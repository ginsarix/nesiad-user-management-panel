"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { decideMember, type MemberDetails } from "@/lib/fetches/member";
import { invalidateSmsQueries } from "@/lib/fetches/sms";
import type { MemberDecision } from "@/lib/zod-schemas/member-decision";

/**
 * Saves a decision and refreshes everything that shows the member. A failure
 * (a 409 when someone else decided first, or a deleted sector) refreshes the
 * list too, so the page shows the current status.
 */
export function useDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: MemberDecision }) =>
      decideMember(id, decision),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        queryClient.invalidateQueries({ queryKey: ["sectors"] }),
        queryClient.invalidateQueries({ queryKey: ["representatives"] }),
        invalidateSmsQueries(queryClient),
      ]),
    onError: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
}

/** What staff see before confirming: where the notices will go */
export function NoticeBox({
  member,
}: {
  member: Pick<MemberDetails, "email" | "mobilePhone">;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-medium">E-posta ve SMS gönderilecek:</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">E-posta</dt>
        <dd className="break-all">
          {member.email || (
            <span className="text-muted-foreground">
              Bu adres eksik, gönderilmeyecek
            </span>
          )}
        </dd>
        <dt className="text-muted-foreground">Cep telefonu</dt>
        <dd>
          {member.mobilePhone || (
            <span className="text-muted-foreground">
              Bu adres eksik, gönderilmeyecek
            </span>
          )}
        </dd>
      </dl>
    </div>
  );
}

/** Shown in place of the confirmation once the decision is saved but a notice didn't go out */
export function SavedWithWarning({
  saved,
  warning,
}: {
  saved: string;
  warning: string;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-medium">{saved}</p>
      <p
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
      >
        {warning}
      </p>
    </div>
  );
}
