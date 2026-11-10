"use client";

import { useQuery } from "@tanstack/react-query";
import { getProject } from "@/lib/fetches/project";
import { ProjectForm } from "../../_components/project-form";

export function EditProject({ id }: { id: number }) {
  const { data: project, isError } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });

  if (isError) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Proje bilgileri yüklenirken bir hata oluştu.
      </p>
    );
  }

  return project ? <ProjectForm project={project} /> : null;
}
