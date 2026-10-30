"use client";

import { useQuery } from "@tanstack/react-query";
import { getRepresentative } from "@/lib/fetches/representative";
import { RepresentativeForm } from "../../_components/representative-form";

export function EditRepresentative({ id }: { id: number }) {
  const { data: representative, isError } = useQuery({
    queryKey: ["representatives", id],
    queryFn: () => getRepresentative(id),
  });

  if (isError) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Yetkili bilgileri yüklenirken bir hata oluştu.
      </p>
    );
  }

  return representative ? (
    <RepresentativeForm representative={representative} />
  ) : null;
}
