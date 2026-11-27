"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { isoToDisplay } from "@/lib/dates";
import {
  createMember,
  type MemberDetails,
  updateMember,
} from "@/lib/fetches/member";
import { invalidateSmsQueries } from "@/lib/fetches/sms";
import { listHref } from "@/lib/list-href";
import { LogoFileError, toLogoUpload } from "@/lib/logo-upload";
import { isEstablished } from "@/lib/member-status";
import { shakeElement, useNavigationGuard } from "@/lib/navigation-guard";
import { cn } from "@/lib/utils";
import {
  EMPTY_COMPANY_FIELDS,
  type MemberFormInput,
  type MemberFormValues,
  memberFormSchema,
} from "@/lib/zod-schemas/member";
import { CompanySection, companyFormFields } from "./company-section";
import { OrganizationsSection } from "./organizations-section";
import { PersonFields } from "./person-fields";

function defaultValuesOf(member?: MemberDetails): MemberFormInput {
  const company = member?.company ?? null;

  return {
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    // the API sends yyyy-aa-gg, the form works in gg.aa.yyyy
    memberLoginDate: isoToDisplay(member?.memberLoginDate),
    // candidates and rejected members have no status to pick here
    status:
      member && !isEstablished(member.status)
        ? undefined
        : ((member?.status as "active" | "passive" | undefined) ?? "active"),
    email: member?.email ?? "",
    mobilePhone: member?.mobilePhone ?? "",
    birthDate: isoToDisplay(member?.birthDate),
    notes: member?.notes ?? "",
    poPositiveCardNo: member?.poPositiveCardNo ?? "",
    photo: null,
    removePhoto: false,

    birthPlace: member?.birthPlace ?? "",
    // the stored number is never sent to the browser; blank keeps it
    nationalId: "",
    education: member?.education ?? "",
    otherAssociations: member?.otherAssociations ?? "",
    gender: member?.gender ?? "",
    referenceName: member?.referenceName ?? "",
    identityDocument: null,

    companyRole: member?.companyRole ?? "",
    company: {
      mode: company ? "existing" : "none",
      id: company?.id ?? null,
      existing: company ? companyFormFields(company) : EMPTY_COMPANY_FIELDS,
      new: EMPTY_COMPANY_FIELDS,
      logo: null,
      removeLogo: false,
      activityDocument: null,
    },
    organizations:
      member?.organizations.map((row) => ({
        rowId: row.rowId,
        organization: row.organization,
        groupId: row.groupId,
        roleId: row.roleId,
      })) ?? [],
  };
}

/** Create form without a member, edit form with one */
export function MemberForm({ member }: { member?: MemberDetails }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<MemberFormInput, unknown, MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: defaultValuesOf(member),
  });
  // a picked photo is being shrunk; saving now would leave it out
  const [photoBusy, setPhotoBusy] = useState(false);

  const { mutate, isPending, isSuccess, error } = useMutation({
    mutationFn: async (values: MemberFormValues) => {
      const { company } = values;
      const logo =
        company.mode !== "none" && company.logo
          ? await toLogoUpload(company.logo)
          : null;
      if (!member) return (await createMember(values, logo)).id;
      await updateMember(member.id, values, logo);
      return member.id;
    },
    // a PDF or SVG that can't be drawn belongs to the logo field
    onError: (error) => {
      if (error instanceof LogoFileError) {
        form.setError("company.logo", { message: error.message });
      }
    },
    onSuccess: async (id) => {
      await Promise.all([
        // the list and this member's page
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        // the company may be new, edited, or left with fewer members
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        // member counts per sector
        queryClient.invalidateQueries({ queryKey: ["sectors"] }),
        // Organizasyon pages list the member, whose groups may have changed;
        // Parametreler counts Dernek Görevi usage
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
        // money pages show the member's name
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        queryClient.invalidateQueries({ queryKey: ["accruals"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        invalidateSmsQueries(queryClient),
      ]);
      router.push(`/members/${id}`);
    },
  });

  const backHref = member ? `/members/${member.id}` : listHref("/members");

  // unsaved changes keep the user here until saved or cancelled
  const dirty = form.formState.isDirty && !isPending && !isSuccess;
  const actions = useRef<HTMLDivElement>(null);
  const [leaveAttempted, setLeaveAttempted] = useState(false);
  useNavigationGuard(dirty, () => {
    setLeaveAttempted(true);
    actions.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    requestAnimationFrame(() => shakeElement(actions.current));
  });
  const pointOut = leaveAttempted && dirty;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {member ? "Üyeye dön" : "Üyelere dön"}
      </Link>

      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <h2 className="font-medium">{member ? "Üyeyi Düzenle" : "Yeni Üye"}</h2>

        <PersonFields
          form={form}
          member={member}
          showStatus={!member || isEstablished(member.status)}
          photoBusy={photoBusy}
          onPhotoBusyChange={setPhotoBusy}
        />

        <CompanySection form={form} member={member} />

        <OrganizationsSection form={form} />

        <div
          ref={actions}
          className={cn(
            "flex flex-wrap items-center justify-end gap-3 rounded-lg",
            pointOut && "border border-destructive px-4 py-3",
          )}
        >
          {error && !(error instanceof LogoFileError) ? (
            <FieldError className="mr-auto">{error.message}</FieldError>
          ) : (
            pointOut && (
              <p className="mr-auto text-sm text-destructive">
                Sayfadan ayrılmadan önce değişiklikleri kaydedin ya da iptal
                edin.
              </p>
            )
          )}
          {/* a button, not a link: leaving this way discards the changes */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(backHref)}
          >
            İptal
          </Button>
          <Button type="submit" disabled={isPending || photoBusy}>
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </form>
    </div>
  );
}
