"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getMember } from "@/lib/fetches/member";
import {
  formatDate,
  MemberAvatar,
  MemberFields,
  PassiveTag,
  RepresentativeList,
  SeniorityBadge,
} from "../_components/member-info";
import { membersListHref } from "../_lib/list-href";
import { DeleteMemberButton } from "./delete-member-button";
import { ToggleActiveButton } from "./toggle-active-button";

export function MemberDetails({ id }: { id: number }) {
  const { data: member, isError } = useQuery({
    queryKey: ["members", id],
    queryFn: () => getMember(id),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={membersListHref()}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Üyelere dön
      </Link>

      {isError && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Üye bilgileri yüklenirken bir hata oluştu.
        </p>
      )}

      {member && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <MemberAvatar title={member.title} logo={member.logo} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-medium">{member.title}</h2>
                <SeniorityBadge memberLoginDate={member.memberLoginDate} />
                {!member.active && <PassiveTag />}
              </div>
              {member.sector && (
                <p className="text-sm text-muted-foreground">{member.sector}</p>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <ToggleActiveButton member={member} />
              <Link
                href={`/members/${member.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil />
                Düzenle
              </Link>
              <DeleteMemberButton member={member} />
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card">
              <h3 className="border-b px-4 py-2.5 text-sm font-medium">
                Bilgiler
              </h3>
              <div className="p-4">
                <MemberFields
                  fields={[
                    {
                      label: "Durum",
                      value: member.active ? "Aktif" : "Pasif",
                    },
                    { label: "Telefon", value: member.phone },
                    { label: "Adres", value: member.address },
                    { label: "Sektör", value: member.sector },
                    {
                      label: "Üye Giriş Tarihi",
                      value: formatDate(member.memberLoginDate),
                    },
                    {
                      label: "Kuruluş Tarihi",
                      value: formatDate(member.foundingDate),
                    },
                  ]}
                />
              </div>
            </section>

            <section className="rounded-lg border bg-card">
              <h3 className="border-b px-4 py-2.5 text-sm font-medium">
                Yetkililer ({member.representatives.length})
              </h3>
              <div className="p-4">
                <RepresentativeList representatives={member.representatives} />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
