import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AuthCard, AuthNotice } from "../_components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;

  // better-auth redirects here with ?error=INVALID_TOKEN for a bad link
  if (error || typeof token !== "string" || !token) {
    return (
      <AuthCard title="Şifre yenileme">
        <AuthNotice tone="error">
          Bağlantının süresi dolmuş ya da daha önce kullanılmış.
        </AuthNotice>
        <Link href="/forgot-password" className={buttonVariants()}>
          Yeni bağlantı iste
        </Link>
      </AuthCard>
    );
  }

  return <ResetPasswordForm token={token} />;
}
