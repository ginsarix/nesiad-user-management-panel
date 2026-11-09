import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";
import type { UserWithRole } from "better-auth/plugins/admin";
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
export async function getPanelUsers(
  headers?: Record<string, string>,
): Promise<PanelUser[]> {
  const { users } = unwrap(
    await adminApi.admin.listUsers({
      // a handful of staff; well under any page size
      query: { limit: 1000 },
      fetchOptions: { headers },
    }),
  );
  // whole user rows, so `phone` is there (NOT NULL) though the types lack it
  return (users as PanelUser[]).toSorted((a, b) => compareTr(a.name, b.name));
}

/** Texts a verification code to `phone`; `userId` when it is for an existing user */
export async function sendPhoneCode(input: { phone: string; userId?: string }) {
  const res = await rpcClient.api["panel-users"]["phone-codes"].$post({
    json: input,
  });

  if (!res.ok) await throwResponseError(res, "Kod gönderilemedi");
}

/**
 * Creates the account (the server checks the phone code) and emails its
 * verification link, which signs them in once. The account stays even if
 * the email fails: the list can resend.
 */
export async function createPanelUser(values: {
  name: string;
  email: string;
  password: string;
  phone: string;
  code: string;
}) {
  const res = await rpcClient.api["panel-users"].$post({ json: values });
  if (!res.ok) await throwResponseError(res, "Kullanıcı eklenemedi");
  const { id } = (await res.json()) as { id: string };

  try {
    await sendVerificationEmail(id);
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

export async function changePanelUserPhone(
  userId: string,
  values: { phone: string; code: string },
) {
  const res = await rpcClient.api["panel-users"][":id"].phone.$put({
    param: { id: userId },
    json: values,
  });

  if (!res.ok) await throwResponseError(res, "Telefon numarası güncellenemedi");
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

/** `phone` is an additional field (src/lib/auth.ts) the admin client's types lack */
export type PanelUser = UserWithRole & { phone: string };
