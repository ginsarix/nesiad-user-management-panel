import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";
import type { SectorFormValues } from "../zod-schemas/sector";
import { throwResponseError } from "./errors";

/** Sorted by name, each with how many members it has */
export async function getSectors(options?: ClientRequestOptions) {
  const res = await rpcClient.api.sectors.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting sectors");

  return await res.json();
}

export async function createSector(values: SectorFormValues) {
  const res = await rpcClient.api.sectors.$post({ json: values });

  if (!res.ok) await throwResponseError(res, "Sektör eklenemedi");
}

export async function updateSector(id: number, values: SectorFormValues) {
  const res = await rpcClient.api.sectors[":id"].$patch({
    param: { id: String(id) },
    json: values,
  });

  if (!res.ok) await throwResponseError(res, "Sektör güncellenemedi");
}

export async function deleteSector(id: number) {
  const res = await rpcClient.api.sectors[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Sektör silinemedi");
}

export type Sector = Awaited<ReturnType<typeof getSectors>>[number];
