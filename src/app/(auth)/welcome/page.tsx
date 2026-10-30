import { redirect } from "next/navigation";
import { INITIAL_PASSWORD_WINDOW_MS } from "@/lib/auth-plugins/initial-password";
import { getSession } from "@/lib/session";
import { WelcomeForm } from "./welcome-form";

/** Where the email verification link lands, already logged in */
export default async function WelcomePage({
  searchParams,
}: PageProps<"/welcome">) {
  // better-auth redirects here with ?error=... when the link is invalid
  if ((await searchParams).error) redirect("/login?error=verification");

  const session = await getSession();
  if (!session) redirect("/login");

  // Past the window the password can't be set here anymore
  const sessionAge = Date.now() - session.session.createdAt.getTime();
  if (sessionAge >= INITIAL_PASSWORD_WINDOW_MS) redirect("/members");

  return <WelcomeForm name={session.user.name} />;
}
