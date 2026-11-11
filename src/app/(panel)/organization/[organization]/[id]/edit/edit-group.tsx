"use client";

import { useQuery } from "@tanstack/react-query";
import { getOrganizationGroup } from "@/lib/fetches/organization";
import type { Organization } from "@/lib/organizations";
import { GroupForm } from "../../../_components/group-form";

export function EditGroup({
  organization,
  id,
}: {
  organization: Organization;
  id: number;
}) {
  const { data: group, isError } = useQuery({
    queryKey: ["organizations", organization, id],
    queryFn: () => getOrganizationGroup(organization, id),
  });

  if (isError) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Bilgiler yüklenirken bir hata oluştu.
      </p>
    );
  }

  return group ? <GroupForm organization={organization} group={group} /> : null;
}
