"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type Control,
  Controller,
  type UseFormTrigger,
  useController,
  useForm,
} from "react-hook-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isoToDisplay } from "@/lib/dates";
import {
  createMember,
  logoUrl,
  type MemberDetails,
  updateMember,
} from "@/lib/fetches/member";
import { invalidateSmsQueries } from "@/lib/fetches/sms";
import { listHref } from "@/lib/list-href";
import {
  type MemberFormValues,
  memberFormSchema,
} from "@/lib/zod-schemas/member";
import { LogoDropZone } from "./logo-drop-zone";
import { SectorCombobox } from "./sector-combobox";

type DateFieldName = "memberLoginDate" | "foundingDate";

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
      active: member?.active ?? true,
      logo: null,
      removeLogo: false,
    },
  });
  const { errors } = form.formState;

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (values: MemberFormValues) => {
      if (!member) return (await createMember(values)).id;
      await updateMember(member.id, values);
      return member.id;
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

          <LogoField
            control={form.control}
            trigger={form.trigger}
            currentLogo={member?.logo ?? null}
          />

          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Field orientation="horizontal" className="self-start sm:pt-7">
                <Checkbox
                  id="active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <FieldLabel htmlFor="active" className="font-normal">
                  Aktif üye
                </FieldLabel>
              </Field>
            )}
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t px-4 py-3">
          {error && (
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
  control,
  trigger,
  currentLogo,
}: {
  control: Control<MemberFormValues>;
  trigger: UseFormTrigger<MemberFormValues>;
  currentLogo: string | null;
}) {
  const logo = useController({ control, name: "logo" });
  const removeLogo = useController({ control, name: "removeLogo" });

  const pick = (file: File | null) => {
    logo.field.onChange(file);
    void trigger("logo");
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
