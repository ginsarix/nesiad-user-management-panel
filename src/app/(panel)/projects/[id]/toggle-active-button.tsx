"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CirclePause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Project, updateProject } from "@/lib/fetches/project";

/** "Pasife al" / "Aktife al" in one click; reversible, so no confirmation */
export function ToggleActiveButton({ project }: { project: Project }) {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      updateProject(project.id, {
        name: project.name,
        number: project.number,
        active: !project.active,
      }),
    // the Tahsilat form only offers Aktif projeler
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
    onError: (error) => window.alert(error.message),
  });

  return (
    <Button variant="outline" disabled={isPending} onClick={() => mutate()}>
      {project.active ? <CirclePause /> : <CircleCheck />}
      {project.active ? "Pasife al" : "Aktife al"}
    </Button>
  );
}
