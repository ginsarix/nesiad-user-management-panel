import { auth } from "@/lib/auth";

export async function seedDefaultAdmin() {
  const { user } = await auth.api.createUser({
    body: {
      email: "admin@example.com",
      password: "greatfood123",
      name: "Admin User",
      role: "admin",
    },
  });

  console.log("Created admin:", user);
  return user;
}

seedDefaultAdmin();
