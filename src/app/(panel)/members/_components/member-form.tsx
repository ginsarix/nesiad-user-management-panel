"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type Control,
  Controller,
  type UseFormReturn,
  type UseFormTrigger,
  useController,
  useForm,
} from "react-hook-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isoToDisplay } from "@/lib/dates";
import {
  createMember,
  logoUrl,
  type MemberDetails,
  updateMember,
} from "@/lib/fetches/member";
import { invalidateSmsQueries } from "@/lib/fetches/sms";
import { listHref } from "@/lib/list-href";
import { isEstablished } from "@/lib/member-status";
import { PdfLogoError, pdfLogoError, toLogoUpload } from "@/lib/pdf-logo";
import {
  type MemberFormValues,
  memberFormSchema,
} from "@/lib/zod-schemas/member";
import { DocumentField } from "./document-field";
import { LogoDropZone } from "./logo-drop-zone";
import { SectorCombobox } from "./sector-combobox";

type DateFieldName = "memberLoginDate" | "foundingDate" | "birthDate";

type TextFieldName =
  | "applicantFirstName"
  | "applicantLastName"
  | "applicantRole"
  | "mobilePhone"
  | "email"
  | "birthPlace"
  | "education"
  | "referenceName"
  | "employeeCount"
  | "website";

const GENDER_ITEMS = [
  { value: "", label: "Belirtilmedi" },
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
];

/** Create form without a member, edit form with one */
export function MemberForm({ member }: { member?: MemberDetails }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      title: member?.title ?? "",
      sectorId: member?.sectorId ?? null,
      phone: member?.phone ?? "",
      address: member?.address ?? "",
      // the API sends yyyy-aa-gg, the form works in gg.aa.yyyy
      memberLoginDate: isoToDisplay(member?.memberLoginDate),
      foundingDate: isoToDisplay(member?.foundingDate),
      // candidates and rejected members have no status to pick here
      status:
        member && !isEstablished(member.status)
          ? undefined
          : ((member?.status as "active" | "passive" | undefined) ?? "active"),
      logo: null,
      removeLogo: false,
      applicantFirstName: member?.applicantFirstName ?? "",
      applicantLastName: member?.applicantLastName ?? "",
      applicantRole: member?.applicantRole ?? "",
      employeeCount:
        member?.employeeCount == null ? "" : String(member.employeeCount),
      website: member?.website ?? "",
      email: member?.email ?? "",
      mobilePhone: member?.mobilePhone ?? "",
      birthDate: isoToDisplay(member?.birthDate),
      birthPlace: member?.birthPlace ?? "",
      // the stored number is never sent to the browser; blank keeps it
      nationalId: "",
      education: member?.education ?? "",
      otherAssociations: member?.otherAssociations ?? "",
      companyIntro: member?.companyIntro ?? "",
      gender: member?.gender ?? "",
      referenceName: member?.referenceName ?? "",
      identityDocument: null,
      activityDocument: null,
    },
  });
  const { errors } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: async ({ logo, ...rest }: MemberFormValues) => {
      const values = { ...rest, logo: logo && (await toLogoUpload(logo)) };
      if (!member) return (await createMember(values)).id;
      await updateMember(member.id, values);
      return member.id;
    },
    // a PDF that can't be drawn belongs to the logo field
    onError: (error) => {
      if (error instanceof PdfLogoError) {
        form.setError("logo", { message: error.message });
      }
    },
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        // member counts per sector
        queryClient.invalidateQueries({ queryKey: ["sectors"] }),
        // yetkili pages show member titles
        queryClient.invalidateQueries({ queryKey: ["representatives"] }),
        invalidateSmsQueries(queryClient),
      ]);
      router.push(`/members/${id}`);
    },
  });

  const backHref = member ? `/members/${member.id}` : listHref("/members");

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
        className="max-w-3xl rounded-lg border bg-card"
        noValidate
      >
        <h2 className="border-b px-4 py-2.5 text-sm font-medium">
          {member ? "Üyeyi Düzenle" : "Yeni Üye"}
        </h2>

        <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.title} className="sm:col-span-2">
            <FieldLabel htmlFor="title">
              Ünvan <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="title"
              autoComplete="off"
              autoFocus
              aria-invalid={!!errors.title}
              {...form.register("title")}
            />
            <FieldError errors={[errors.title]} />
          </Field>

          <Controller
            control={form.control}
            name="sectorId"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="sector">Sektör</FieldLabel>
                <SectorCombobox
                  id="sector"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </Field>
            )}
          />

          <Field>
            <FieldLabel htmlFor="phone">Telefon</FieldLabel>
            <Input
              id="phone"
              type="tel"
              autoComplete="off"
              {...form.register("phone")}
            />
          </Field>

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="address">Adres</FieldLabel>
            <Input
              id="address"
              autoComplete="off"
              {...form.register("address")}
            />
          </Field>

          <DateField
            control={form.control}
            name="memberLoginDate"
            label="Üye Giriş Tarihi"
          />
          <DateField
            control={form.control}
            name="foundingDate"
            label="Kuruluş Tarihi"
          />

          <LogoField form={form} currentLogo={member?.logo ?? null} />

          {(!member || isEstablished(member.status)) && (
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Field orientation="horizontal" className="self-start sm:pt-7">
                  <Checkbox
                    id="status"
                    checked={field.value === "active"}
                    onCheckedChange={(checked) =>
                      field.onChange(checked ? "active" : "passive")
                    }
                  />
                  <FieldLabel htmlFor="status" className="font-normal">
                    Aktif üye
                  </FieldLabel>
                </Field>
              )}
            />
          )}
        </div>

        <h3 className="border-y bg-muted/40 px-4 py-2 text-sm font-medium">
          Başvuru Bilgileri
        </h3>
        <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
          <TextField
            form={form}
            name="applicantFirstName"
            label="Başvuran Adı"
          />
          <TextField
            form={form}
            name="applicantLastName"
            label="Başvuran Soyadı"
          />
          <TextField form={form} name="applicantRole" label="Görev / Ünvan" />
          <TextField
            form={form}
            name="mobilePhone"
            label="Cep Telefonu"
            type="tel"
          />
          <TextField form={form} name="email" label="E-posta" type="email" />
          <DateField
            control={form.control}
            name="birthDate"
            label="Doğum Tarihi"
          />
          <TextField form={form} name="birthPlace" label="Doğum Yeri" />

          <Field data-invalid={!!errors.nationalId}>
            <FieldLabel htmlFor="nationalId">TC Kimlik No</FieldLabel>
            <Input
              id="nationalId"
              inputMode="numeric"
              autoComplete="off"
              placeholder={member?.nationalIdMasked ?? undefined}
              aria-invalid={!!errors.nationalId}
              {...form.register("nationalId")}
            />
            {member?.nationalIdMasked && (
              <p className="text-xs text-muted-foreground">
                Değiştirmek için yeni numarayı yazın
              </p>
            )}
            <FieldError errors={[errors.nationalId]} />
          </Field>

          <Controller
            control={form.control}
            name="gender"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="gender">Cinsiyet</FieldLabel>
                <Select
                  items={GENDER_ITEMS}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="gender" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />

          <TextField form={form} name="education" label="Eğitim Durumu" />
          <TextField form={form} name="referenceName" label="Referans" />

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="otherAssociations">
              Dernek, meslek grupları
            </FieldLabel>
            <Textarea
              id="otherAssociations"
              {...form.register("otherAssociations")}
            />
          </Field>

          <TextField
            form={form}
            name="employeeCount"
            label="İstihdam Sayısı"
            inputMode="numeric"
          />
          <TextField form={form} name="website" label="Web Sitesi" />

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="companyIntro">Tanıtım Yazısı</FieldLabel>
            <Textarea id="companyIntro" {...form.register("companyIntro")} />
          </Field>

          <DocumentFormField
            control={form.control}
            trigger={form.trigger}
            name="identityDocument"
            label="Kimlik Belgesi"
            currentFilename={member?.identityDocument ?? null}
          />
          <DocumentFormField
            control={form.control}
            trigger={form.trigger}
            name="activityDocument"
            label="Faaliyet Belgesi / Sicil Gazetesi"
            currentFilename={member?.activityDocument ?? null}
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t px-4 py-3">
          {error && !(error instanceof PdfLogoError) && (
            <FieldError className="mr-auto">{error.message}</FieldError>
          )}
          <Link
            href={backHref}
            className={buttonVariants({ variant: "ghost" })}
          >
            İptal
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DateField({
  control,
  name,
  label,
}: {
  control: Control<MemberFormValues>;
  name: DateFieldName;
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={!!fieldState.error}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <DatePickerInput
            id={name}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-invalid={!!fieldState.error}
          />
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

function LogoField({
  form,
  currentLogo,
}: {
  form: UseFormReturn<MemberFormValues>;
  currentLogo: string | null;
}) {
  const { control } = form;
  const logo = useController({ control, name: "logo" });
  const removeLogo = useController({ control, name: "removeLogo" });

  const pick = async (file: File | null) => {
    logo.field.onChange(file);
    if (!(await form.trigger("logo"))) return;
    // a PDF is drawn now, so one that can't be is reported before saving
    const message = await pdfLogoError(file);
    if (message && form.getValues("logo") === file) {
      form.setError("logo", { message });
    }
  };

  return (
    <Field data-invalid={!!logo.fieldState.error}>
      <FieldLabel htmlFor="logo">Logo</FieldLabel>
      <LogoDropZone
        id="logo"
        file={logo.field.value}
        currentUrl={
          currentLogo && !removeLogo.field.value ? logoUrl(currentLogo) : null
        }
        onPick={pick}
        onRemove={() => {
          removeLogo.field.onChange(true);
          pick(null);
        }}
      />
      <FieldError errors={[logo.fieldState.error]} />
    </Field>
  );
}

function TextField({
  form,
  name,
  label,
  type,
  inputMode,
}: {
  form: UseFormReturn<MemberFormValues>;
  name: TextFieldName;
  label: string;
  type?: string;
  inputMode?: "numeric";
}) {
  const error = form.formState.errors[name];

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        type={type}
        inputMode={inputMode}
        autoComplete="off"
        aria-invalid={!!error}
        {...form.register(name)}
      />
      <FieldError errors={[error]} />
    </Field>
  );
}

function DocumentFormField({
  control,
  trigger,
  name,
  label,
  currentFilename,
}: {
  control: Control<MemberFormValues>;
  trigger: UseFormTrigger<MemberFormValues>;
  name: "identityDocument" | "activityDocument";
  label: string;
  currentFilename: string | null;
}) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Field data-invalid={!!fieldState.error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <DocumentField
        id={name}
        file={field.value}
        currentFilename={currentFilename}
        onPick={(file) => {
          field.onChange(file);
          void trigger(name);
        }}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  );
}
