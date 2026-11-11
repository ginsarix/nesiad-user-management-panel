"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { PassiveTag } from "@/components/info-fields";
import { buttonVariants } from "@/components/ui/button";
import { getOrganizationGroup } from "@/lib/fetches/organization";
import { listHref } from "@/lib/list-href";
import {
  ORGANIZATION_INFO,
  type Organization,
  organizationHref,
} from "@/lib/organizations";
import { DeleteGroupButton } from "./delete-group-button";

export function GroupDetails({
  organization,
  id,
}: {
  organization: Organization;
  id: number;
}) {
  const info = ORGANIZATION_INFO[organization];
  const { data: group, isError } = useQuery({
    queryKey: ["organizations", organization, id],
    queryFn: () => getOrganizationGroup(organization, id),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={listHref(organizationHref(organization))}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {info.backLabel}
      </Link>

      {isError && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Bilgiler yüklenirken bir hata oluştu.
        </p>
      )}

      {group && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <h2 className="text-lg font-medium">{group.name}</h2>
            <div className="ml-auto flex gap-2">
              <Link
                href={organizationHref(organization, `${group.id}/edit`)}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil />
                Düzenle
              </Link>
              <DeleteGroupButton organization={organization} group={group} />
            </div>
          </div>

          <section className="max-w-3xl rounded-lg border bg-card">
            <h3 className="border-b px-4 py-2.5 text-sm font-medium">
              Kişiler ({group.people.length})
            </h3>
            {group.people.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Henüz kişi eklenmemiş.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Yetkili</th>
                    <th className="px-4 py-2 font-medium">Görev</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.people.map((person) => (
                    <tr key={person.id}>
                      <td className="px-4 py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/representatives/${person.representativeId}`}
                            className="text-primary hover:underline"
                          >
                            {person.representativeName}
                          </Link>
                          {!person.representativeActive && <PassiveTag />}
                        </span>
                      </td>
                      <td className="px-4 py-2">{person.roleName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
