import Link from "next/link";
import { missingForCollections } from "@/lib/collection-prerequisites";

const linkClass = "font-medium underline";

/** Says what to add first when there's no Aktif member, Tahsilat Türü or Tipi */
export function MissingPrerequisitesNotice({
  members,
  parameters,
}: {
  members: readonly { status: string }[] | undefined;
  parameters: readonly { kind: string }[] | undefined;
}) {
  const missing = missingForCollections(members, parameters);
  if (!missing.member && !missing.parameters) return null;

  const membersLink = (
    <Link href="/members" className={linkClass}>
      Üyeler
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
      {missing.member && missing.parameters ? (
        <>
          {membersLink}'den aktif üye, {parametersLink}'den tahsilat türü ve
          tipi
        </>
      ) : missing.member ? (
        <>{membersLink}'den aktif üye</>
      ) : (
        <>{parametersLink}'den tahsilat türü ve tipi</>
      )}{" "}
      ekleyin.
    </p>
  );
}
