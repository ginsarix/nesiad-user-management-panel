import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/db";
import {
  accountTable,
  sessionTable,
  userTable,
  verificationTable,
} from "@/db/schema";
import { initialPassword } from "./auth-plugins/initial-password";
import { env } from "./env";
import { sendEmail } from "./mail";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userTable,
      session: sessionTable,
      account: accountTable,
      verification: verificationTable,
    },
  }),
  baseURL: env.NEXT_PUBLIC_APP_URL,
  session: {
    // trusted staff on office computers; renewed while in use
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  emailAndPassword: {
    enabled: true,
    // Accounts are only created by a logged-in user (admin plugin's createUser)
    disableSignUp: true,
    // Also what makes sendOnSignIn below send a fresh link
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      // not awaited so response time doesn't reveal whether the email exists
      void sendEmail({
        to: user.email,
        subject: "DERNEK Üye Paneli Şifre Yenileme",
        text: `Merhaba ${user.name}, Dernek Üye Yönetim Paneli şifrenizi yenilemek için tıklayınız:\n\n${url}\n\nBu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.`,
      }).catch(console.error);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Every verification lands on the optional set-password screen,
      // whichever flow sent the email
      const link = new URL(url);
      link.searchParams.set("callbackURL", "/welcome");

      await sendEmail({
        to: user.email,
        subject: "DERNEK Üye Paneli Hesabınız Hazır",
        text: `Merhaba ${user.name}, Dernek Üye Yönetim Paneli hesabınız yönetici tarafından oluşturulmuştur. Hesabınıza giriş yapmak için tıklayınız:\n\n${link}`,
      });
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days feels right for this

    // Usually it will be sent programmatically once the admin creates the user,
    // But the user will still need a way to verify at login if the initial one expires ↓
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  plugins: [admin(), initialPassword()],
});
