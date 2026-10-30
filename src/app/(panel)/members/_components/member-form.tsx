"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type Control,
  Controller,
  type UseFormTrigger,
  useController,
  useForm,
} from "react-hook-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createMember,
  getMembers,
  logoUrl,
  type MemberDetails,
  type MemberListItem,
  updateMember,
} from "@/lib/fetches/member";
import { compareTr } from "@/lib/turkish";
import {
  type MemberFormValues,
  memberFormSchema,
} from "@/lib/zod-schemas/member";
import { membersListHref } from "../_lib/list-href";

const emptyMembers: MemberListItem[] = [];

type DateFieldName = "memberLoginDate" | "foundingDate" | "seniorityDate";

/** Create form without a member, edit form with one */
export function MemberForm({ member }: { member?: MemberDetails }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // existing sectors are suggested so the same one isn't typed differently
  const { data: members = emptyMembers } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });
  const sectors = useMemo(
    () =>
      [
        ...new Set(
          members.map((m) => m.sector?.trim()).filter((s): s is string => !!s),
        ),
      ].toSorted(compareTr),
    [members],
  );

  const form = useForm({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      title: member?.title ?? "",
      sector: member?.sector ?? "",
      phone: member?.phone ?? "",
      address: member?.address ?? "",
      memberLoginDate: member?.memberLoginDate ?? "",
      foundingDate: member?.foundingDate ?? "",
      seniorityDate: member?.seniorityDate ?? "",
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
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      router.push(`/members/${id}`);
    },
  });

  const backHref = member ? `/members/${member.id}` : membersListHref();

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

          <Field>
            <FieldLabel htmlFor="sector">Sektör</FieldLabel>
            <Input
              id="sector"
              list="sector-options"
              autoComplete="off"
              {...form.register("sector")}
            />
            <datalist id="sector-options">
              {sectors.map((sector) => (
                <option key={sector} value={sector} />
              ))}
            </datalist>
          </Field>

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
          <DateField
            control={form.control}
            name="seniorityDate"
            label="Kıdem Tarihi"
          />

          <LogoField
            control={form.control}
            trigger={form.trigger}
            currentLogo={member?.logo ?? null}
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
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <DatePickerInput
            id={name}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
    </Field>
  );
}

/** Blob URL for previewing a picked file; revoked when it changes */
function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
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

  const pickedUrl = useObjectUrl(logo.field.value);
  const previewUrl =
    pickedUrl ??
    (currentLogo && !removeLogo.field.value ? logoUrl(currentLogo) : null);

  return (
    <Field data-invalid={!!logo.fieldState.error}>
      <FieldLabel htmlFor="logo">Logo</FieldLabel>
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Logo önizleme"
              width={56}
              height={56}
              unoptimized
              className="size-full object-contain"
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <label
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {previewUrl ? "Değiştir" : "Logo seç"}
              <input
                id="logo"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  logo.field.onChange(event.target.files?.[0] ?? null);
                  // allow picking the same file again after removing it
                  event.target.value = "";
                  void trigger("logo");
                }}
              />
            </label>
            {previewUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  logo.field.onChange(null);
                  removeLogo.field.onChange(true);
                  void trigger("logo");
                }}
              >
                Kaldır
              </Button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Resim dosyası · en fazla 5 MB
          </span>
        </div>
      </div>
      <FieldError errors={[logo.fieldState.error]} />
    </Field>
  );
}
