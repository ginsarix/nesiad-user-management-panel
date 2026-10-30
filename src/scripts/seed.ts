import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

export async function seedDefaultAdmin() {
  const { user } = await auth.api.createUser({
    body: {
      email: env.DEFAULT_ADMIN_EMAIL,
      password: env.DEFAULT_ADMIN_PASSWORD,
      name: "Admin User",
      role: "admin",
    },
  });

  console.log("Created admin:", user);

  // The link verifies the address and logs in, like a new staff member would
  await auth.api.sendVerificationEmail({ body: { email: user.email } });
  console.log("Sent verification email to", user.email);

  return user;
}

seedDefaultAdmin();
