import {
  CASH_ACCOUNT_PREREQUISITE,
  type Prerequisite,
  PrerequisitesNotice,
} from "@/components/prerequisites-notice";
import { missingForCollections } from "@/lib/collection-prerequisites";

/** Says what to add first when there's no Aktif üye, Tahsilat Türü or Aktif Kasa - Banka */
export function MissingPrerequisitesNotice({
  members,
  parameters,
  cashAccounts,
}: {
  members: readonly { status: string }[] | undefined;
  parameters: readonly { kind: string }[] | undefined;
  cashAccounts: readonly { active: boolean }[] | undefined;
}) {
  const missing = missingForCollections(members, parameters, cashAccounts);
  const items: Prerequisite[] = [];
  if (missing.member) {
    items.push({
      href: "/members",
      page: "Üyeler",
      from: "'den",
      what: "aktif üye",
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
