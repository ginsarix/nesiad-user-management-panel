import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";
import type { ProjectFormValues } from "../zod-schemas/project";
import { throwResponseError } from "./errors";

/** Sorted by Proje Numarası, each with its tahsilat count and total */
export async function getProjects(options?: ClientRequestOptions) {
  const res = await rpcClient.api.projects.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting projects");

  return await res.json();
}

/** Resolves to null when the proje does not exist */
export async function getProject(id: number, options?: ClientRequestOptions) {
  const res = await rpcClient.api.projects[":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the project");

  return await res.json();
}

/** Throws an ApiError whose `field` names the input it is about */
export async function createProject(values: ProjectFormValues) {
  const res = await rpcClient.api.projects.$post({ json: values });

  if (!res.ok) await throwResponseError(res, "Proje kaydedilemedi");

  return ((await res.json()) as { id: number }).id;
}

export async function updateProject(id: number, values: ProjectFormValues) {
  const res = await rpcClient.api.projects[":id"].$patch({
    param: { id: String(id) },
    json: values,
  });

  if (!res.ok) await throwResponseError(res, "Proje güncellenemedi");
}

export async function deleteProject(id: number) {
  const res = await rpcClient.api.projects[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Proje silinemedi");
}

export type ProjectListItem = Awaited<ReturnType<typeof getProjects>>[number];
export type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;
