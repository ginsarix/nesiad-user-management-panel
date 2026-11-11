import { notFound } from "next/navigation";
import { organizationFromSlug } from "@/lib/organizations";
import { requireSession } from "@/lib/session";
import { GroupForm } from "../../_components/group-form";

export default async function NewOrganizationGroupPage({
  params,
}: PageProps<"/organization/[organization]/new">) {
  await requireSession();
  const organization = organizationFromSlug((await params).organization);
  if (!organization) notFound();

  return <GroupForm organization={organization} />;
}
