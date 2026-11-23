import {
  CASH_ACCOUNT_PREREQUISITE,
  type Prerequisite,
  PrerequisitesNotice,
} from "@/components/prerequisites-notice";
import { missingForPayments } from "@/lib/payment-prerequisites";

/** Says what to add first when there's no cari, Ödeme Türü or Aktif Kasa - Banka */
export function MissingPrerequisitesNotice({
  counterparties,
  parameters,
  cashAccounts,
}: {
  counterparties: readonly unknown[] | undefined;
  parameters: readonly { kind: string }[] | undefined;
  cashAccounts: readonly { active: boolean }[] | undefined;
}) {
  const missing = missingForPayments(counterparties, parameters, cashAccounts);
  const items: Prerequisite[] = [];
  if (missing.counterparty) {
    items.push({
      href: "/counterparties",
      page: "Cariler",
      from: "'den",
      what: "cari",
    });
  }
  if (missing.parameters) {
    items.push({
      href: "/settings",
      page: "Ayarlar → Parametreler",
      from: "'den",
      what: "ödeme türü",
    });
  }
  if (missing.cashAccount) items.push(CASH_ACCOUNT_PREREQUISITE);
  return <PrerequisitesNotice action="Ödeme eklemek" missing={items} />;
}
