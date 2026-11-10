import Link from "next/link";
import type { Parameter } from "@/lib/fetches/parameter";

/** Payments need an Ödeme Türü and Tipi; says so when either list is empty */
export function MissingParametersNotice({
  parameters,
}: {
  parameters: Parameter[];
}) {
  const hasCategory = parameters.some((p) => p.kind === "payment_category");
  const hasMethod = parameters.some((p) => p.kind === "payment_method");
  if (hasCategory && hasMethod) return null;

  return (
    <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      Ödeme eklemek için önce{" "}
      <Link href="/settings" className="font-medium underline">
        Ayarlar → Parametreler
      </Link>
      'den ödeme türü ve tipi ekleyin.
    </p>
  );
}
