"use client";

import { useRef } from "react";
import { Controller, useController } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
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
import { logoUrl, type MemberDetails } from "@/lib/fetches/member";
import { PhotoFileError, resizePhoto } from "@/lib/photo-upload";
import {
  DateField,
  DocumentFormField,
  type MemberFormApi,
  TextField,
} from "./form-fields";
import { PhotoDropZone } from "./photo-drop-zone";

const GENDER_ITEMS = [
  { value: "", label: "Belirtilmedi" },
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
];

/**
 * Kişi Bilgileri: the person, then the application fields that are about
 * them (the company's go in the Firma section). `showStatus` is false for
 * candidates and rejected members, whose status only a decision changes.
 */
export function PersonFields({
  form,
  member,
  showStatus,
  photoBusy,
  onPhotoBusyChange,
}: {
  form: MemberFormApi;
  member?: MemberDetails;
  showStatus: boolean;
  photoBusy: boolean;
  onPhotoBusyChange: (busy: boolean) => void;
}) {
  const { errors } = form.formState;

  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-2.5 text-sm font-medium">
        Kişi Bilgileri
      </h2>

      <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
        <TextField
          form={form}
          name="firstName"
          label="Adı"
          required
          autoFocus
        />
        <TextField form={form} name="lastName" label="Soyadı" required />

        <PhotoField
          form={form}
          currentPhoto={member?.photo ?? null}
          busy={photoBusy}
          onBusyChange={onPhotoBusyChange}
        />

        <TextField
          form={form}
          name="mobilePhone"
          label="Cep Telefonu"
          type="tel"
        />
        <TextField form={form} name="email" label="E-posta" type="email" />
        <DateField form={form} name="birthDate" label="Doğum Tarihi" />
        <DateField
          form={form}
          name="memberLoginDate"
          label="Üye Giriş Tarihi"
        />
        <TextField
          form={form}
          name="poPositiveCardNo"
          label="PO Positive Card No"
        />

        {showStatus && (
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

        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="notes">Notlar</FieldLabel>
          <Textarea id="notes" rows={3} {...form.register("notes")} />
        </Field>
      </div>

      <h3 className="border-y bg-muted/40 px-4 py-2 text-sm font-medium">
        Başvuru Bilgileri
      </h3>
      <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
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

        <DocumentFormField
          form={form}
          name="identityDocument"
          label="Kimlik Belgesi"
          currentFilename={member?.identityDocument ?? null}
        />

        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="otherAssociations">
            Dernek, meslek grupları
          </FieldLabel>
          <Textarea
            id="otherAssociations"
            {...form.register("otherAssociations")}
          />
        </Field>
      </div>
    </section>
  );
}

/**
 * The photo is shrunk to the JPEG that is uploaded as soon as it's picked,
 * so a file the browser can't open is reported before saving.
 */
function PhotoField({
  form,
  currentPhoto,
  busy,
  onBusyChange,
}: {
  form: MemberFormApi;
  currentPhoto: string | null;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { control } = form;
  const photo = useController({ control, name: "photo" });
  const removePhoto = useController({ control, name: "removePhoto" });
  // only the latest pick may land when an earlier one finishes later
  const latestPick = useRef(0);

  const pick = async (file: File | null) => {
    const pickId = ++latestPick.current;
    form.clearErrors("photo");
    if (!file) {
      photo.field.onChange(null);
      onBusyChange(false);
      return;
    }

    onBusyChange(true);
    try {
      const resized = await resizePhoto(file);
      if (pickId !== latestPick.current) return;
      photo.field.onChange(resized);
      await form.trigger("photo");
    } catch (error) {
      if (pickId !== latestPick.current) return;
      if (!(error instanceof PhotoFileError)) throw error;
      photo.field.onChange(null);
      form.setError("photo", { message: error.message });
    } finally {
      if (pickId === latestPick.current) onBusyChange(false);
    }
  };

  return (
    <Field data-invalid={!!photo.fieldState.error} className="sm:col-span-2">
      <FieldLabel htmlFor="photo">Fotoğraf</FieldLabel>
      <PhotoDropZone
        id="photo"
        file={photo.field.value}
        currentUrl={
          currentPhoto && !removePhoto.field.value
            ? logoUrl(currentPhoto)
            : null
        }
        busy={busy}
        onPick={pick}
        onRemove={() => {
          pick(null);
          removePhoto.field.onChange(true);
        }}
      />
      <FieldError errors={[photo.fieldState.error]} />
    </Field>
  );
}
