import Link from "next/link";
import { missingForCollections } from "@/lib/collection-prerequisites";

const linkClass = "font-medium underline";

/** Says what to add first when there's no Aktif yetkili, Tahsilat Türü or Tipi */
export function MissingPrerequisitesNotice({
  representatives,
  parameters,
}: {
  representatives: readonly { active: boolean }[] | undefined;
  parameters: readonly { kind: string }[] | undefined;
}) {
  const missing = missingForCollections(representatives, parameters);
  if (!missing.representative && !missing.parameters) return null;

  const representativesLink = (
    <Link href="/representatives" className={linkClass}>
      Yetkililer
    </Link>
  );
  const parametersLink = (
    <Link href="/settings" className={linkClass}>
      Ayarlar → Parametreler
    </Link>
  );

  return (
    <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      Tahsilat eklemek için önce{" "}
      {missing.representative && missing.parameters ? (
        <>
          {representativesLink}'nden aktif yetkili, {parametersLink}'den
          tahsilat türü ve tipi
        </>
      ) : missing.representative ? (
        <>{representativesLink}'nden aktif yetkili</>
      ) : (
        <>{parametersLink}'den tahsilat türü ve tipi</>
      )}{" "}
      ekleyin.
    </p>
  );
}
