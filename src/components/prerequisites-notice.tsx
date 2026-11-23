import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/** One thing to add first: where (a page link and its suffix) and what */
export type Prerequisite = {
  href: string;
  page: string;
  /** Turkish ablative suffix for the page name, e.g. "'den" */
  from: string;
  what: string;
};

function joinTr(parts: ReactNode[]) {
  return parts.map((part, index) => (
    // the parts are fixed per notice, so their position is a stable key
    // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
    <Fragment key={index}>
      {index > 0 && (index === parts.length - 1 ? " ve " : ", ")}
      {part}
    </Fragment>
  ));
}

/**
 * "Ödeme eklemek için önce Cariler'den cari ve Kasa - Banka'dan aktif bir
 * hesap ekleyin." Nothing when nothing is missing.
 */
export function PrerequisitesNotice({
  action,
  missing,
}: {
  /** e.g. "Ödeme eklemek" */
  action: string;
  missing: Prerequisite[];
}) {
  if (missing.length === 0) return null;
  return (
    <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      {action} için önce{" "}
      {joinTr(
        missing.map((item) => (
          <>
            <Link href={item.href} className="font-medium underline">
              {item.page}
            </Link>
            {item.from} {item.what}
          </>
        )),
      )}{" "}
      ekleyin.
    </p>
  );
}

export const CASH_ACCOUNT_PREREQUISITE: Prerequisite = {
  href: "/cash-accounts/new",
  page: "Kasa - Banka",
  from: "'dan",
  what: "aktif bir hesap",
};
