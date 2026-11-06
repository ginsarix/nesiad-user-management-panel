import type { ReactNode } from "react";
import { InfoFields } from "@/components/info-fields";
import { buttonVariants } from "@/components/ui/button";
import { isoToDisplay } from "@/lib/dates";
import { logoUrl, type MemberDetails } from "@/lib/fetches/member";
import { NationalIdField } from "./national-id-field";

const GENDER_LABELS = { male: "Erkek", female: "Kadın" } as const;

type Field = { label: string; value: ReactNode };

/** True when a field would show something other than a dash */
const isSet = (field: Field) =>
  typeof field.value === "string" ? field.value.trim() !== "" : !!field.value;

function Section({ title, fields }: { title: string; fields: Field[] }) {
  if (!fields.some(isSet)) return null;

  return (
    <section className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2.5 text-sm font-medium">{title}</h3>
      <div className="p-4">
        <InfoFields fields={fields} />
      </div>
    </section>
  );
}

function DocumentLink({ filename }: { filename: string }) {
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

/** Başvuran, Firma and Belgeler; a section with no data is left out */
export function ApplicationSections({ member }: { member: MemberDetails }) {
  const applicantName = [member.applicantFirstName, member.applicantLastName]
    .filter(Boolean)
    .join(" ");
  const birth = [isoToDisplay(member.birthDate), member.birthPlace]
    .filter(Boolean)
    .join(" / ");

  return (
    <>
      <Section
        title="Başvuran"
        fields={[
          { label: "Ad Soyad", value: applicantName },
          { label: "Görev / Ünvan", value: member.applicantRole },
          { label: "Cep Telefonu", value: member.mobilePhone },
          { label: "E-posta", value: member.email },
          { label: "Doğum Tarihi / Yeri", value: birth },
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
          { label: "Diğer Dernekler", value: member.otherAssociations },
        ]}
      />
      <Section
        title="Firma"
        fields={[
          {
            label: "İstihdam Sayısı",
            value:
              member.employeeCount === null
                ? null
                : String(member.employeeCount),
          },
          {
            label: "Web Sitesi",
            value: member.website && (
              <a
                href={member.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {member.website}
              </a>
            ),
          },
          { label: "Tanıtım Yazısı", value: member.companyIntro },
        ]}
      />
      <Section
        title="Belgeler"
        fields={[
          {
            label: "Kimlik Belgesi",
            value: member.identityDocument && (
              <DocumentLink filename={member.identityDocument} />
            ),
          },
          {
            label: "Faaliyet Belgesi / Sicil Gazetesi",
            value: member.activityDocument && (
              <DocumentLink filename={member.activityDocument} />
            ),
          },
        ]}
      />
    </>
  );
}
