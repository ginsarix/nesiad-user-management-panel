"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { formatDate, InfoFields, StatusTag } from "@/components/info-fields";
import { buttonVariants } from "@/components/ui/button";
import { getMember } from "@/lib/fetches/member";
import { listHref } from "@/lib/list-href";
import { isEstablished, MEMBER_STATUS_LABELS } from "@/lib/member-status";
import { RepresentativeList, SeniorityBadge } from "../_components/member-info";
import { ApplicationSections } from "./application-sections";
import { DecisionButtons } from "./decision-buttons";
import { DeleteMemberButton } from "./delete-member-button";
import { MemberLogo } from "./member-logo";
import { ToggleActiveButton } from "./toggle-active-button";

export function MemberDetails({ id }: { id: number }) {
  const { data: member, isError } = useQuery({
    queryKey: ["members", id],
    queryFn: () => getMember(id),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={listHref("/members")}
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
            <MemberLogo member={member} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-medium">{member.title}</h2>
                <SeniorityBadge memberLoginDate={member.memberLoginDate} />
                <StatusTag status={member.status} />
              </div>
              {member.sector && (
                <p className="text-sm text-muted-foreground">{member.sector}</p>
              )}
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <DecisionButtons member={member} />
              {isEstablished(member.status) && (
                <ToggleActiveButton member={member} />
              )}
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
                <InfoFields
                  fields={[
                    {
                      label: "Durum",
                      value: MEMBER_STATUS_LABELS[member.status],
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
              <div className="flex items-center justify-between border-b px-4 py-1.5">
                <h3 className="text-sm font-medium">
                  Yetkililer ({member.representatives.length})
                </h3>
                {isEstablished(member.status) && (
                  <Link
                    href={`/representatives/new?member=${member.id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    <Plus />
                    Yetkili ekle
                  </Link>
                )}
              </div>
              <div className="p-4">
                <RepresentativeList representatives={member.representatives} />
              </div>
            </section>

            <ApplicationSections member={member} />
          </div>
        </>
      )}
    </div>
  );
}
