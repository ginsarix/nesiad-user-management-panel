import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { periodEndDate } from "@/lib/cash-account-periods";
import { isoToDisplay } from "@/lib/dates";
import type { CashAccount } from "@/lib/fetches/cash-account";

/**
 * Tahsilatlar and ödemeler dated before the first period count in no
 * Bakiye; this says so, with links to them, while there are any
 */
export function OutsidePeriodsNotice({ account }: { account: CashAccount }) {
  const { before, collectionCount, paymentCount } = account.outside;
  if (!before || collectionCount + paymentCount === 0) return null;
  // the lists' Bitiş filter is inclusive
  const to = periodEndDate(before);
  const query = `cashAccount=${account.id}&to=${to}`;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      <TriangleAlert className="size-4 shrink-0" />
      <span>
        {isoToDisplay(before)} öncesine ait {collectionCount + paymentCount}{" "}
        kayıt hiçbir döneme girmiyor.
      </span>
      {collectionCount > 0 && (
        <Link href={`/collections?${query}`} className="underline">
          Tahsilatlar ({collectionCount})
        </Link>
      )}
      {paymentCount > 0 && (
        <Link href={`/payments?${query}`} className="underline">
          Ödemeler ({paymentCount})
        </Link>
      )}
    </p>
  );
}
