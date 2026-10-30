"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getMember } from "@/lib/fetches/member";
import {
  MemberAvatar,
  MemberFields,
  RepresentativeList,
} from "../_components/member-info";
import { membersListHref } from "../_lib/list-href";
import { DeleteMemberButton } from "./delete-member-button";

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
          <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
            <MemberAvatar title={member.title} logo={member.logo} size="lg" />
            <div>
              <h2 className="text-lg font-medium">{member.title}</h2>
              {member.sector && (
                <p className="text-sm text-muted-foreground">{member.sector}</p>
              )}
            </div>
            <div className="ml-auto flex gap-2">
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
                    { label: "Telefon", value: member.phone },
                    { label: "Adres", value: member.address },
                    { label: "Sektör", value: member.sector },
                    {
                      label: "Üye Giriş Tarihi",
                      value: member.memberLoginDate,
                    },
                    { label: "Kuruluş Tarihi", value: member.foundingDate },
                    { label: "Kıdem Tarihi", value: member.seniorityDate },
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
