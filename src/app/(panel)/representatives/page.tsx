import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";

/** Yetkililer are Üyeler now; old links land on the member list */
export default async function RepresentativesPage() {
  await requireSession();
  redirect("/members");
}
