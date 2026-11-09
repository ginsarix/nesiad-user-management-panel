import { adminClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { initialPasswordClient } from "./auth-plugins/initial-password-client";
import { env } from "./env";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  plugins: [
    adminClient(),
    initialPasswordClient(),
    // no onTwoFactorRedirect: the login form shows the code step itself
    twoFactorClient(),
  ],
});
