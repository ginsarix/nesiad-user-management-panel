import Link from "next/link";
import { missingForPayments } from "@/lib/payment-prerequisites";

const linkClass = "font-medium underline";

/** Says what to add first when there's no cari, Ödeme Türü or Ödeme Tipi */
export function MissingPrerequisitesNotice({
  counterparties,
  parameters,
}: {
  counterparties: readonly unknown[] | undefined;
  parameters: readonly { kind: string }[] | undefined;
}) {
  const missing = missingForPayments(counterparties, parameters);
  if (!missing.counterparty && !missing.parameters) return null;

  const cariLink = (
    <Link href="/counterparties" className={linkClass}>
      Cariler
    </Link>
  );
  const parametersLink = (
    <Link href="/settings" className={linkClass}>
      Ayarlar → Parametreler
    </Link>
  );

  return (
    <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      Ödeme eklemek için önce{" "}
      {missing.counterparty && missing.parameters ? (
        <>
          {cariLink}'den cari, {parametersLink}'den ödeme türü ve tipi
        </>
      ) : missing.counterparty ? (
        <>{cariLink}'den cari</>
      ) : (
        <>{parametersLink}'den ödeme türü ve tipi</>
      )}{" "}
      ekleyin.
    </p>
  );
}
