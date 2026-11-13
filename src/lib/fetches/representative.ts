import type { ClientRequestOptions } from "hono/client";
import { displayToIso } from "../dates";
import { rpcClient } from "../rpc-client";
import type { RepresentativeFormValues } from "../zod-schemas/authorized-representative";
import { throwResponseError } from "./errors";

/** `options` lets server-side prefetches forward the user's cookies */
export async function getRepresentatives(options?: ClientRequestOptions) {
  const res = await rpcClient.api.representatives.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting yetkililer");

  return await res.json();
}

/** Resolves to null when the yetkili does not exist */
export async function getRepresentative(
  id: number,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api.representatives[":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the yetkili");

  return await res.json();
}

/**
 * Every field is sent so clearing one in the form clears it in the DB. The
 * API takes multipart form data: member links as JSON text.
 */
function toRepresentativeForm({
  dateOfBirth,
  active,
  members,
  ...fields
}: RepresentativeFormValues) {
  return {
    ...fields,
    // the form holds gg.aa.yyyy, the API takes yyyy-aa-gg
    dateOfBirth: displayToIso(dateOfBirth),
    active: String(active),
    members: JSON.stringify(members),
  };
}

export async function createRepresentative(values: RepresentativeFormValues) {
  const res = await rpcClient.api.representatives.$post({
    form: toRepresentativeForm(values),
  });

  if (!res.ok) await throwResponseError(res, "Yetkili kaydedilemedi");

  return (await res.json()) as { id: number };
}

export async function updateRepresentative(
  id: number,
  values: RepresentativeFormValues,
) {
  const res = await rpcClient.api.representatives[":id"].$patch({
    param: { id: String(id) },
    form: toRepresentativeForm(values),
  });

  if (!res.ok) await throwResponseError(res, "Yetkili güncellenemedi");
}

export async function setRepresentativeActive(id: number, active: boolean) {
  const res = await rpcClient.api.representatives[":id"].$patch({
    param: { id: String(id) },
    form: { active: String(active) },
  });

  if (!res.ok) await throwResponseError(res, "Yetkili durumu değiştirilemedi");
}

export async function deleteRepresentative(id: number) {
  const res = await rpcClient.api.representatives[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Yetkili silinemedi");
}

export type RepresentativeListItem = Awaited<
  ReturnType<typeof getRepresentatives>
>[number];
export type RepresentativeDetails = NonNullable<
  Awaited<ReturnType<typeof getRepresentative>>
>;
