"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { formatDate, orDash } from "@/components/info-fields";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type CollectionFilters,
  collectionFiltersToParams,
} from "@/lib/collection-filters";
import { getCollections } from "@/lib/fetches/collection";
import { formatAmount } from "@/lib/money";
import { projectLabel } from "@/lib/projects";

/**
 * The tahsilatlar of one yetkili or one proje, with their count and total.
 * `of` picks which; that column is left out since it's always the same.
 */
export function CollectionsSection({
  of,
  id,
  canAdd,
}: {
  of: "representative" | "project";
  id: number;
  /** A new tahsilat needs an Aktif yetkili or proje */
  canAdd: boolean;
}) {
  const filters: CollectionFilters = {
    from: null,
    to: null,
    representative: of === "representative" ? id : null,
    category: null,
    method: null,
    project: of === "project" ? id : null,
  };
  const { data, isError } = useQuery({
    queryKey: ["collections", "list", filters],
    queryFn: () => getCollections(filters),
  });
  // editing from here returns here
  const back = `${of}=${id}`;

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-1.5 pr-1.5 pl-4">
        <h3 className="text-sm font-medium">Tahsilatlar</h3>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.count} tahsilat · Toplam {formatAmount(data.total)}
          </span>
        )}
        {canAdd && (
          <Link
            href={`/collections/new?${back}`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "ml-auto",
            })}
          >
            <Plus />
            Tahsilat Ekle
          </Link>
        )}
      </div>

      {isError ? (
        <p className="p-4 text-sm text-muted-foreground">
          Tahsilatlar yüklenirken bir hata oluştu.
        </p>
      ) : data && data.collections.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Henüz tahsilat yok.</p>
      ) : (
        data && (
          <>
            <div className="max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    {of === "project" && <TableHead>Yetkili</TableHead>}
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead>Tahsilat Türü</TableHead>
                    <TableHead>Tahsilat Tipi</TableHead>
                    {of === "representative" && <TableHead>Proje</TableHead>}
                    <TableHead>Not</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.collections.map((collection) => (
                    <TableRow key={collection.id}>
                      <TableCell>
                        <Link
                          href={`/collections/${collection.id}/edit?${back}`}
                          className="text-primary hover:underline"
                        >
                          {formatDate(collection.date)}
                        </Link>
                      </TableCell>
                      {of === "project" && (
                        <TableCell>
                          <Link
                            href={`/representatives/${collection.representativeId}`}
                            className="hover:underline"
                          >
                            {collection.representativeName}
                          </Link>
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(collection.amount)}
                      </TableCell>
                      <TableCell>{collection.categoryName}</TableCell>
                      <TableCell>{collection.methodName}</TableCell>
                      {of === "representative" && (
                        <TableCell>
                          {collection.projectId &&
                          collection.projectName &&
                          collection.projectNumber ? (
                            <Link
                              href={`/projects/${collection.projectId}`}
                              className="hover:underline"
                            >
                              {projectLabel({
                                name: collection.projectName,
                                number: collection.projectNumber,
                              })}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <span className="line-clamp-1 max-w-48 whitespace-normal">
                          {orDash(collection.note)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t px-4 py-2 text-sm">
              <Link
                href={`/collections?${new URLSearchParams(collectionFiltersToParams(filters))}`}
                className="text-primary hover:underline"
              >
                Tüm tahsilatlarda göster
              </Link>
            </div>
          </>
        )
      )}
    </section>
  );
}
