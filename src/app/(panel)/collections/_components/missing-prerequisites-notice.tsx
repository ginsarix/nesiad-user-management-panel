import {
  CASH_ACCOUNT_PREREQUISITE,
  type Prerequisite,
  PrerequisitesNotice,
} from "@/components/prerequisites-notice";
import { missingForCollections } from "@/lib/collection-prerequisites";

/** Says what to add first when there's no Aktif yetkili, Tahsilat Türü or Aktif Kasa - Banka */
export function MissingPrerequisitesNotice({
  representatives,
  parameters,
  cashAccounts,
}: {
  representatives: readonly { active: boolean }[] | undefined;
  parameters: readonly { kind: string }[] | undefined;
  cashAccounts: readonly { active: boolean }[] | undefined;
}) {
  const missing = missingForCollections(
    representatives,
    parameters,
    cashAccounts,
  );
  const items: Prerequisite[] = [];
  if (missing.representative) {
    items.push({
      href: "/representatives",
      page: "Yetkililer",
      from: "'nden",
      what: "aktif yetkili",
    });
  }
  if (missing.parameters) {
    items.push({
      href: "/settings",
      page: "Ayarlar → Parametreler",
      from: "'den",
      what: "tahsilat türü",
    });
  }
  if (missing.cashAccount) items.push(CASH_ACCOUNT_PREREQUISITE);
  return <PrerequisitesNotice action="Tahsilat eklemek" missing={items} />;
}
