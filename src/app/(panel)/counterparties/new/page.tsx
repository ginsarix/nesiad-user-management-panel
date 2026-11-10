import { requireSession } from "@/lib/session";
import { CounterpartyForm } from "../_components/counterparty-form";

export default async function NewCounterpartyPage() {
  await requireSession();
  return <CounterpartyForm />;
}
