// Run with `pnpm db:seed`
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

async function seedDefaultAdmin() {
  const email = env.DEFAULT_ADMIN_EMAIL;
  const password = env.DEFAULT_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in .env to seed the default admin",
    );
  }

  const { user } = await auth.api.createUser({
    body: {
      email,
      password,
      name: "Admin User",
      role: "admin",
    },
  });

  console.log("Created admin:", user.email);

  // The link verifies the address and logs in, like a new staff member would
  await auth.api.sendVerificationEmail({ body: { email: user.email } });
  console.log("Sent verification email to", user.email);
}

// Exit explicitly: the database pool would otherwise keep the process alive
seedDefaultAdmin().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(
      "Seeding failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  },
);
