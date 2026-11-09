import type { ApplicationFormValues } from "@/lib/zod-schemas/application";

export const APPLICATION_STEPS: readonly {
  id: "personal" | "company" | "association" | "documents" | "consent";
  title: string;
  fields: readonly (keyof ApplicationFormValues)[];
}[] = [
  {
    id: "personal",
    title: "Kişisel",
    fields: [
      "applicantFirstName",
      "applicantLastName",
      "birthDate",
      "birthPlace",
      "nationalId",
      "gender",
      "education",
      "mobilePhone",
      "email",
    ],
  },
  {
    id: "company",
    title: "Firma",
    fields: [
      "title",
      "applicantRole",
      "employeeCount",
      "address",
      "phone",
      "website",
      "companyIntro",
    ],
  },
  {
    id: "association",
    title: "Referans",
    fields: ["referenceName", "otherAssociations"],
  },
  {
    id: "documents",
    title: "Belgeler",
    fields: ["logo", "identityDocument", "activityDocument"],
  },
  { id: "consent", title: "Onay", fields: ["consentRules", "consentData"] },
];

/** Index of the step holding a field, or -1 for an unknown field */
export function stepOfField(field: string): number {
  return APPLICATION_STEPS.findIndex((step) =>
    (step.fields as readonly string[]).includes(field),
  );
}
