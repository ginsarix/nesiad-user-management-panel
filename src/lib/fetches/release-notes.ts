import { rpcClient } from "../rpc-client";
import { throwResponseError } from "./errors";

/** Records that the logged-in user has seen the newest release notes */
export async function markReleaseNotesSeen() {
  const res = await rpcClient.api["release-notes"].seen.$post();

  if (!res.ok) await throwResponseError(res, "Sürüm notları kaydedilemedi");
}
