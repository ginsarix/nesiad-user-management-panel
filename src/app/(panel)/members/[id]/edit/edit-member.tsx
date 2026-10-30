"use client";

import { useQuery } from "@tanstack/react-query";
import { getMember } from "@/lib/fetches/member";
import { MemberForm } from "../../_components/member-form";

export function EditMember({ id }: { id: number }) {
  const { data: member, isError } = useQuery({
    queryKey: ["members", id],
    queryFn: () => getMember(id),
  });

  if (isError) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Üye bilgileri yüklenirken bir hata oluştu.
      </p>
    );
  }

  return member ? <MemberForm member={member} /> : null;
}
