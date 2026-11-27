import type { ReactNode } from "react";
import { InfoFields } from "@/components/info-fields";
import { buttonVariants } from "@/components/ui/button";
import { logoUrl, type MemberDetails } from "@/lib/fetches/member";
import { NationalIdField } from "./national-id-field";

const GENDER_LABELS = { male: "Erkek", female: "Kadın" } as const;

type Field = { label: string; value: ReactNode };

/** True when a field would show something other than a dash */
const isSet = (field: Field) =>
  typeof field.value === "string" ? field.value.trim() !== "" : !!field.value;

/** "Görüntüle" for an uploaded document, served by the files route */
export function DocumentLink({ filename }: { filename: string }) {
  return (
    <a
      href={logoUrl(filename)}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: "outline", size: "xs" })}
    >
      Görüntüle
    </a>
  );
}

/**
 * The person-side fields of the membership application; left out when none
 * is filled. The name, contact and birth date are in Kişi, and the company's
 * application fields in Firma.
 */
export function ApplicationSection({ member }: { member: MemberDetails }) {
  const fields: Field[] = [
    { label: "Doğum Yeri", value: member.birthPlace },
    {
      label: "TC Kimlik No",
      value: member.nationalIdMasked && (
        <NationalIdField
          memberId={member.id}
          masked={member.nationalIdMasked}
        />
      ),
    },
    {
      label: "Cinsiyet",
      value: member.gender ? GENDER_LABELS[member.gender] : null,
    },
    { label: "Eğitim Durumu", value: member.education },
    { label: "Referans", value: member.referenceName },
    { label: "Dernek, meslek grupları", value: member.otherAssociations },
    {
      label: "Kimlik Belgesi",
      value: member.identityDocument && (
        <DocumentLink filename={member.identityDocument} />
      ),
    },
  ];
  if (!fields.some(isSet)) return null;

  return (
    <section className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2.5 text-sm font-medium">Başvuru</h3>
      <div className="p-4">
        <InfoFields fields={fields} />
      </div>
    </section>
  );
}
