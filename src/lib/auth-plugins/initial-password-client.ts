import type { BetterAuthClientPlugin } from "better-auth/client";
import type { initialPassword } from "./initial-password";

export const initialPasswordClient = () =>
  ({
    id: "initial-password",
    $InferServerPlugin: {} as ReturnType<typeof initialPassword>,
  }) satisfies BetterAuthClientPlugin;
