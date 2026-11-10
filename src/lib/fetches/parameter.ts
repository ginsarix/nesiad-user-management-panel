import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";
import type {
  CreateParameterValues,
  ParameterNameFormValues,
} from "../zod-schemas/parameter";
import { throwResponseError } from "./errors";

/** Every Parametreler list's entries, sorted by name */
export async function getParameters(options?: ClientRequestOptions) {
  const res = await rpcClient.api.parameters.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting parameters");

  return await res.json();
}

export async function createParameter(values: CreateParameterValues) {
  const res = await rpcClient.api.parameters.$post({ json: values });

  if (!res.ok) await throwResponseError(res, "Eklenemedi");
}

export async function updateParameter(
  id: number,
  values: ParameterNameFormValues,
) {
  const res = await rpcClient.api.parameters[":id"].$patch({
    param: { id: String(id) },
    json: values,
  });

  if (!res.ok) await throwResponseError(res, "Güncellenemedi");
}

export async function deleteParameter(id: number) {
  const res = await rpcClient.api.parameters[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Silinemedi");
}

export type Parameter = Awaited<ReturnType<typeof getParameters>>[number];
