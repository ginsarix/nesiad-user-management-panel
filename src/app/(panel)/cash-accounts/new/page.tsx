import { requireSession } from "@/lib/session";
import { CashAccountForm } from "../_components/cash-account-form";

export default async function NewCashAccountPage() {
  await requireSession();
  return <CashAccountForm />;
}
