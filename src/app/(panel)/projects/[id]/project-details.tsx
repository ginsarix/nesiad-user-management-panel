"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { CollectionsSection } from "@/components/collections-section";
import { InfoFields, PassiveTag } from "@/components/info-fields";
import { buttonVariants } from "@/components/ui/button";
import { getProject } from "@/lib/fetches/project";
import { listHref } from "@/lib/list-href";
import { DeleteProjectButton } from "./delete-project-button";
import { ToggleActiveButton } from "./toggle-active-button";

export function ProjectDetails({ id }: { id: number }) {
  const { data: project, isError } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={listHref("/projects")}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Projelere dön
      </Link>

      {isError && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Proje bilgileri yüklenirken bir hata oluştu.
        </p>
      )}

      {project && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium">{project.name}</h2>
              {!project.active && <PassiveTag />}
            </div>
            <div className="ml-auto flex gap-2">
              <ToggleActiveButton project={project} />
              <Link
                href={`/projects/${project.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil />
                Düzenle
              </Link>
              <DeleteProjectButton project={project} />
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className="rounded-lg border bg-card">
              <h3 className="border-b px-4 py-2.5 text-sm font-medium">
                Bilgiler
              </h3>
              <div className="p-4">
                <InfoFields
                  fields={[
                    { label: "Proje Numarası", value: project.number },
                    {
                      label: "Durum",
                      value: project.active ? "Aktif" : "Pasif",
                    },
                  ]}
                />
              </div>
            </section>

            <CollectionsSection
              of="project"
              id={project.id}
              canAdd={project.active}
            />
          </div>
        </>
      )}
    </div>
  );
}
