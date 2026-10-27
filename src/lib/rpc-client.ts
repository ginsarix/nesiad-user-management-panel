import { hc } from "hono/client";
import type { AppType } from "@/app/api/[[...route]]/route";
import { env } from "./env";

export const rpcClient = hc<AppType>(`${env.NEXT_PUBLIC_APP_URL}/`);
