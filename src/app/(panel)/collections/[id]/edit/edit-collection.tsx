"use client";

import { useQuery } from "@tanstack/react-query";
import { getCollection } from "@/lib/fetches/collection";
import { CollectionForm } from "../../_components/collection-form";

export function EditCollection({
  id,
  from,
}: {
  id: number;
  from: { member?: number; project?: number };
}) {
  const { data: collection, isError } = useQuery({
    queryKey: ["collections", "detail", id],
    queryFn: () => getCollection(id),
  });

  if (isError) {
    return (
      <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Tahsilat bilgileri yüklenirken bir hata oluştu.
      </p>
    );
  }

  return collection ? (
    <CollectionForm collection={collection} from={from} />
  ) : null;
}
