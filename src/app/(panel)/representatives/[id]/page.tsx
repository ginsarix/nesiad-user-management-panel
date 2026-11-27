import { notFound, redirect } from "next/navigation";
import { getMemberByRepresentative } from "@/lib/fetches/member";
import { forwardedRequestOptions, requireSession } from "@/lib/session";

/** An old yetkili link goes to the member that replaced them */
export default async function RepresentativePage({
  params,
}: PageProps<"/representatives/[id]">) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const member = await getMemberByRepresentative(
    id,
    await forwardedRequestOptions(),
  );
  if (!member) notFound();

  redirect(`/members/${member.id}`);
}
