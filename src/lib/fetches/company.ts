import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";

/** Every company with its logo and number of members, sorted by Ünvan */
export async function getCompanies(options?: ClientRequestOptions) {
  const res = await rpcClient.api.companies.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting companies");

  return await res.json();
}

/** Resolves to null when the company does not exist */
export async function getCompany(id: number, options?: ClientRequestOptions) {
  const res = await rpcClient.api.companies[":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the company");

  return await res.json();
}

export type CompanyListItem = Awaited<ReturnType<typeof getCompanies>>[number];
export type CompanyDetails = NonNullable<
  Awaited<ReturnType<typeof getCompany>>
>;
