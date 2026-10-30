import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";
import { authErrorMessage } from "../auth-errors";
import { env } from "../env";
import { rpcClient } from "../rpc-client";
import { compareTr } from "../turkish";
import { throwResponseError } from "./errors";

// The plain (non-React) client, so server prefetches can import this too
const adminApi = createAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  plugins: [adminClient()],
});

/** better-auth calls resolve to `{ data, error }`; this throws the error */
function unwrap<T>(result: {
  data: T | null;
  error: { code?: string; status?: number } | null;
}): T {
  if (result.error || result.data === null) {
    throw new Error(authErrorMessage(result.error));
  }
  return result.data;
}

/** `headers` lets server-side prefetches forward the user's cookies */
export async function getPanelUsers(headers?: Record<string, string>) {
  const { users } = unwrap(
    await adminApi.admin.listUsers({
      // a handful of staff; well under any page size
      query: { limit: 1000 },
      fetchOptions: { headers },
    }),
  );
  return users.toSorted((a, b) => compareTr(a.name, b.name));
}

/**
 * Creates the account and emails its verification link, which signs them
 * in once. The account stays even if the email fails: the list can resend.
 */
export async function createPanelUser(values: {
  name: string;
  email: string;
  password: string;
}) {
  const { user } = unwrap(await adminApi.admin.createUser(values));

  try {
    await sendVerificationEmail(user.id);
    return { emailError: null };
  } catch (error) {
    return {
      emailError:
        error instanceof Error ? error.message : "E-posta gönderilemedi",
    };
  }
}

export async function sendVerificationEmail(userId: string) {
  const res = await rpcClient.api["panel-users"][":id"][
    "verification-email"
  ].$post({ param: { id: userId } });

  if (!res.ok) await throwResponseError(res, "E-posta gönderilemedi");
}

export async function renamePanelUser(userId: string, name: string) {
  unwrap(await adminApi.admin.updateUser({ userId, data: { name } }));
}

/** Also logs them out everywhere, like every other password change here */
export async function setPanelUserPassword(
  userId: string,
  newPassword: string,
) {
  unwrap(await adminApi.admin.setUserPassword({ userId, newPassword }));
  unwrap(await adminApi.admin.revokeUserSessions({ userId }));
}

/** Disabling blocks login and ends their sessions; it can be undone */
export async function setPanelUserDisabled(userId: string, disabled: boolean) {
  unwrap(
    disabled
      ? await adminApi.admin.banUser({ userId })
      : await adminApi.admin.unbanUser({ userId }),
  );
}

export async function deletePanelUser(userId: string) {
  unwrap(await adminApi.admin.removeUser({ userId }));
}

export type PanelUser = Awaited<ReturnType<typeof getPanelUsers>>[number];
