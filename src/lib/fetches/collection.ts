import type { ClientRequestOptions } from "hono/client";
import {
  type CollectionFilters,
  collectionFiltersToParams,
} from "../collection-filters";
import { displayToIso } from "../dates";
import { parseAmountInput } from "../money";
import { rpcClient } from "../rpc-client";
import type { CollectionFormValues } from "../zod-schemas/collection";
import { throwResponseError } from "./errors";

/** The filtered tahsilatlar, newest first, with their count (the page sums the amounts) */
export async function getCollections(
  filters: CollectionFilters,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api.collections.$get(
    { query: collectionFiltersToParams(filters) },
    options,
  );

  if (!res.ok) throw new Error("An error occured while getting collections");

  return await res.json();
}

/** Resolves to null when the tahsilat does not exist */
export async function getCollection(
  id: number,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api.collections[":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the collection");

  return await res.json();
}

/** The form's values in the API's forms; only the chosen proje mode is sent */
function toCollectionJson({
  representativeId,
  categoryId,
  methodId,
  amount,
  date,
  note,
  project,
}: CollectionFormValues) {
  return {
    // the form schema guarantees these are picked and the amount parses
    representativeId: representativeId as number,
    categoryId: categoryId as number,
    methodId: methodId as number,
    amount: parseAmountInput(amount) ?? "",
    date: displayToIso(date),
    note,
    project:
      project.mode === "existing"
        ? { mode: "existing" as const, id: project.id as number }
        : project.mode === "new"
          ? {
              mode: "new" as const,
              name: project.name,
              number: project.number,
              active: project.active,
            }
          : { mode: "none" as const },
  };
}

/** Throws an ApiError whose `field` names the input (e.g. "project.number") */
export async function createCollection(values: CollectionFormValues) {
  const res = await rpcClient.api.collections.$post({
    json: toCollectionJson(values),
  });

  if (!res.ok) await throwResponseError(res, "Tahsilat kaydedilemedi");

  return (await res.json()) as { id: number; projectId: number | null };
}

export async function updateCollection(
  id: number,
  values: CollectionFormValues,
) {
  const res = await rpcClient.api.collections[":id"].$patch({
    param: { id: String(id) },
    json: toCollectionJson(values),
  });

  if (!res.ok) await throwResponseError(res, "Tahsilat güncellenemedi");
}

export async function deleteCollection(id: number) {
  const res = await rpcClient.api.collections[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Tahsilat silinemedi");
}

export type CollectionList = Awaited<ReturnType<typeof getCollections>>;
export type CollectionRow = CollectionList["collections"][number];
export type Collection = NonNullable<Awaited<ReturnType<typeof getCollection>>>;

/** Where the Excel download of the filtered list is; used as a plain link */
export function collectionsExportHref(filters: CollectionFilters) {
  const search = new URLSearchParams(collectionFiltersToParams(filters));
  return `/api/collections/export${search.size ? `?${search}` : ""}`;
}
