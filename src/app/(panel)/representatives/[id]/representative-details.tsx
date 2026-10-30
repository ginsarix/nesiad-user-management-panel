"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { formatDate, InfoFields, PassiveTag } from "@/components/info-fields";
import { buttonVariants } from "@/components/ui/button";
import { getRepresentative } from "@/lib/fetches/representative";
import { listHref } from "@/lib/list-href";
import { MemberAvatar } from "../../members/_components/member-info";
import { DeleteRepresentativeButton } from "./delete-representative-button";
import { ToggleActiveButton } from "./toggle-active-button";

export function RepresentativeDetails({ id }: { id: number }) {
  const { data: representative, isError } = useQuery({
    queryKey: ["representatives", id],
    queryFn: () => getRepresentative(id),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={listHref("/representatives")}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Yetkililere dön
      </Link>

      {isError && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Yetkili bilgileri yüklenirken bir hata oluştu.
        </p>
      )}

      {representative && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium">{representative.name}</h2>
              {!representative.active && <PassiveTag />}
            </div>
            <div className="ml-auto flex gap-2">
              <ToggleActiveButton representative={representative} />
              <Link
                href={`/representatives/${representative.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil />
                Düzenle
              </Link>
              <DeleteRepresentativeButton representative={representative} />
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
                      value: representative.active ? "Aktif" : "Pasif",
                    },
                    { label: "Cep Telefonu", value: representative.phone },
                    { label: "E-posta", value: representative.email },
                    {
                      label: "Doğum Tarihi",
                      value: formatDate(representative.dateOfBirth),
                    },
                    { label: "Notlar", value: representative.notes },
                  ]}
                />
              </div>
            </section>

            <section className="rounded-lg border bg-card">
              <h3 className="border-b px-4 py-2.5 text-sm font-medium">
                Bağlı Üyeler ({representative.members.length})
              </h3>
              <div className="p-4">
                {representative.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Bu yetkili henüz bir üyeye bağlı değil.
                  </p>
                ) : (
                  <ul className="divide-y text-sm">
                    {representative.members.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0"
                      >
                        <MemberAvatar title={member.title} logo={member.logo} />
                        <Link
                          href={`/members/${member.id}`}
                          className="text-primary hover:underline"
                        >
                          {member.title}
                        </Link>
                        {!member.active && <PassiveTag />}
                        <span className="ml-auto text-muted-foreground">
                          {member.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
