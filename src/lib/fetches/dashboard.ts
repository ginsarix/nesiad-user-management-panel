import type { ClientRequestOptions } from "hono/client";
import { rpcClient } from "../rpc-client";

/** Everything the Genel Bakış page shows, in one request */
export async function getDashboard(options?: ClientRequestOptions) {
  const res = await rpcClient.api.dashboard.$get(undefined, options);

  if (!res.ok) throw new Error("An error occured while getting the dashboard");

  return await res.json();
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
