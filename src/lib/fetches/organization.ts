import type { ClientRequestOptions } from "hono/client";
import { ORGANIZATION_INFO, type Organization } from "../organizations";
import { rpcClient } from "../rpc-client";
import type { OrganizationGroupFormValues } from "../zod-schemas/organization";
import { throwResponseError } from "./errors";

const groups = rpcClient.api.organizations[":organization"];

function slugOf(organization: Organization) {
  return ORGANIZATION_INFO[organization].slug;
}

/** The form validated every row, so no id is null any more */
function toGroupJson({ name, people }: OrganizationGroupFormValues) {
  return {
    name,
    people: people.map((person) => ({
      representativeId: person.representativeId as number,
      roleId: person.roleId as number,
    })),
  };
}

/** The page's groups sorted by İsim, each with its number of rows */
export async function getOrganizationGroups(
  organization: Organization,
  options?: ClientRequestOptions,
) {
  const res = await groups.$get(
    { param: { organization: slugOf(organization) } },
    options,
  );

  if (!res.ok) throw new Error("An error occured while getting the groups");

  return await res.json();
}

/** Resolves to null when the group does not exist */
export async function getOrganizationGroup(
  organization: Organization,
  id: number,
  options?: ClientRequestOptions,
) {
  const res = await groups[":id"].$get(
    { param: { organization: slugOf(organization), id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the group");

  return await res.json();
}

/** Throws an ApiError whose `field` names the input it is about */
export async function createOrganizationGroup(
  organization: Organization,
  values: OrganizationGroupFormValues,
) {
  const res = await groups.$post({
    param: { organization: slugOf(organization) },
    json: toGroupJson(values),
  });

  if (!res.ok) await throwResponseError(res, "Kaydedilemedi");

  return ((await res.json()) as { id: number }).id;
}

export async function updateOrganizationGroup(
  organization: Organization,
  id: number,
  values: OrganizationGroupFormValues,
) {
  const res = await groups[":id"].$patch({
    param: { organization: slugOf(organization), id: String(id) },
    json: toGroupJson(values),
  });

  if (!res.ok) await throwResponseError(res, "Güncellenemedi");
}

export async function deleteOrganizationGroup(
  organization: Organization,
  id: number,
) {
  const res = await groups[":id"].$delete({
    param: { organization: slugOf(organization), id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Silinemedi");
}

export type OrganizationGroupListItem = Awaited<
  ReturnType<typeof getOrganizationGroups>
>[number];
export type OrganizationGroup = NonNullable<
  Awaited<ReturnType<typeof getOrganizationGroup>>
>;
