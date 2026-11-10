"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ProjectFields } from "@/components/project-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { ApiError } from "@/lib/fetches/errors";
import {
  createProject,
  type Project,
  updateProject,
} from "@/lib/fetches/project";
import { listHref } from "@/lib/list-href";
import {
  type ProjectFormValues,
  projectFormSchema,
} from "@/lib/zod-schemas/project";

const FIELDS = ["name", "number", "active"];

/** Create form without a proje, edit form with one */
export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? "",
      number: project?.number ?? "",
      active: project?.active ?? true,
    },
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      if (!project) return await createProject(values);
      await updateProject(project.id, values);
      return project.id;
    },
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        // tahsilatlar show the proje's name and number
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
      ]);
      router.push(`/projects/${id}`);
    },
    // e.g. "Bu proje numarası zaten var" under Proje Numarası
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.field &&
        FIELDS.includes(error.field)
      ) {
        form.setError(error.field as keyof ProjectFormValues, {
          message: error.message,
        });
      }
    },
  });
  const formError =
    error && !(error instanceof ApiError && error.field) ? error : null;

  const backHref = project ? `/projects/${project.id}` : listHref("/projects");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {project ? "Projeye dön" : "Projelere dön"}
      </Link>

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">
            {project ? "Projeyi Düzenle" : "Yeni Proje"}
          </h2>
          <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
            <ProjectFields control={form.control} prefix="" />
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          {formError && (
            <FieldError className="mr-auto">{formError.message}</FieldError>
          )}
          <Link
            href={backHref}
            className={buttonVariants({ variant: "ghost" })}
          >
            İptal
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </form>
    </div>
  );
}
