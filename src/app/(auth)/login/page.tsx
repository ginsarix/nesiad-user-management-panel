import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(
    typeof params.next === "string" ? params.next : null,
  );

  // Checked here instead of in the proxy: a stale cookie would otherwise
  // bounce between /login and the panel
  if (await getSession()) redirect(next);

  return (
    <LoginForm
      next={next}
      notice={
        params.reset === "1"
          ? "reset"
          : params.error === "verification"
            ? "verification"
            : undefined
      }
    />
  );
}
