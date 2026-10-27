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
  emailAndPassword: { enabled: true },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "DERNEK Üye Paneli Hesabınız Hazır",
        text: `Merhaba ${user.name}, Dernek Üye Yönetim Paneli hesabınız yönetici tarafından oluşturulmuştur. Hesabınıza giriş yapmak için tıklayınız:\n\n${url}`,
      });
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days feels right for this

    // Usually it will be sent programmatically once the admin creates the user,
    // But the user will still need a way to verify at login if the initial one expires ↓
    sendOnSignIn: true,
  },
  plugins: [admin()],
});
