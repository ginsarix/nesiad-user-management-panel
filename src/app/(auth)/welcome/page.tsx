import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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

  // Only once, right after the email link; otherwise straight to the panel
  const { available } = await auth.api.initialPasswordStatus({
    headers: await headers(),
  });
  if (!available) redirect("/members");

  return <WelcomeForm name={session.user.name} />;
}
