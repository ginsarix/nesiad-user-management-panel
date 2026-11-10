import { requireSession } from "@/lib/session";
import { ProjectForm } from "../_components/project-form";

export default async function NewProjectPage() {
  await requireSession();
  return <ProjectForm />;
}
