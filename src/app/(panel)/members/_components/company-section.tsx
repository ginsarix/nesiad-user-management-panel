"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Controller, useController, useWatch } from "react-hook-form";
import { SearchCombobox } from "@/components/search-combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { isoToDisplay } from "@/lib/dates";
import {
  type CompanyListItem,
  getCompanies,
  getCompany,
} from "@/lib/fetches/company";
import { logoUrl, type MemberDetails } from "@/lib/fetches/member";
import { drawnLogoError } from "@/lib/logo-upload";
import type { CompanyFormFields, CompanyMode } from "@/lib/zod-schemas/member";
import {
  DateField,
  DocumentFormField,
  FormLabel,
  inputId,
  type MemberFormApi,
  TextField,
} from "./form-fields";
import { LogoDropZone } from "./logo-drop-zone";
import { SectorCombobox } from "./sector-combobox";

const MODES: { value: CompanyMode; label: string }[] = [
  { value: "none", label: "Firmasız" },
  { value: "existing", label: "Mevcut firma" },
  { value: "new", label: "Yeni firma" },
];

const emptyCompanies: CompanyListItem[] = [];

/** A stored company's fields as the Firma section edits them */
export function companyFormFields(company: {
  title: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  companyIntro: string | null;
  sectorId: number | null;
  foundingDate: string | null;
  employeeCount: number | null;
}): CompanyFormFields {
  return {
    title: company.title,
    address: company.address ?? "",
    phone: company.phone ?? "",
    website: company.website ?? "",
    companyIntro: company.companyIntro ?? "",
    sectorId: company.sectorId,
    // the API sends yyyy-aa-gg, the form works in gg.aa.yyyy
    foundingDate: isoToDisplay(company.foundingDate),
    employeeCount:
      company.employeeCount === null ? "" : String(company.employeeCount),
  };
}

/**
 * Firma: none, an existing company (picked from every company, its fields
 * loaded for editing in place) or a new one saved with the member. Editing
 * a company other members share changes it for them too, so that is said
 * up front. The logo and Faaliyet Belgesi belong to the chosen company.
 */
export function CompanySection({
  form,
  member,
}: {
  form: MemberFormApi;
  member?: MemberDetails;
}) {
  const queryClient = useQueryClient();
  const mode = useWatch({ control: form.control, name: "company.mode" });
  const id = useWatch({ control: form.control, name: "company.id" });

  const { data: companies = emptyCompanies } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies(),
  });
  const items = useMemo(
    () =>
      companies.map((c) => ({
        value: c.id,
        label: c.title,
        description: `${c.memberCount} üye`,
      })),
    [companies],
  );

  // the member's own company comes with the member; another is fetched
  const ownCompany = member?.company ?? null;
  const { data: fetchedCompany } = useQuery({
    queryKey: ["companies", id],
    queryFn: () => getCompany(id as number),
    enabled: mode === "existing" && id !== null && id !== ownCompany?.id,
  });
  const pickedCompany =
    mode !== "existing" || id === null
      ? null
      : id === ownCompany?.id
        ? ownCompany
        : (fetchedCompany ?? null);

  // the picked company's fields are being fetched; only the latest pick lands
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const latestPick = useRef(0);

  /** A different target company: picks meant for the last one don't carry over */
  const resetFiles = () => {
    form.setValue("company.logo", null);
    form.setValue("company.removeLogo", false);
    form.setValue("company.activityDocument", null);
    form.clearErrors(["company.logo", "company.activityDocument"]);
  };

  const pickCompany = async (next: number | null) => {
    const pickId = ++latestPick.current;
    form.setValue("company.id", next, { shouldDirty: true });
    form.clearErrors("company");
    resetFiles();
    if (next === null) {
      setLoadingId(null);
      return;
    }

    setLoadingId(next);
    try {
      const company = await queryClient.fetchQuery({
        queryKey: ["companies", next],
        queryFn: () => getCompany(next),
      });
      if (pickId !== latestPick.current) return;
      if (!company) {
        form.setValue("company.id", null, { shouldDirty: true });
        form.setError("company.id", { message: "Firma bulunamadı" });
        return;
      }
      form.setValue("company.existing", companyFormFields(company), {
        shouldDirty: true,
      });
    } catch {
      if (pickId !== latestPick.current) return;
      form.setValue("company.id", null, { shouldDirty: true });
      form.setError("company.id", {
        message: "Firma bilgileri yüklenemedi, tekrar deneyin",
      });
    } finally {
      if (pickId === latestPick.current) setLoadingId(null);
    }
  };

  // N members use it now; the member being edited may be one of them
  const memberCount = companies.find((c) => c.id === id)?.memberCount ?? 0;
  const otherMembers = memberCount - (id === ownCompany?.id ? 1 : 0);
  const shared = mode === "existing" && id !== null && otherMembers > 0;

  const fieldsShown =
    mode === "new" ||
    (mode === "existing" && id !== null && loadingId === null);

  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-2.5 text-sm font-medium">Firma</h2>
      <div className="flex flex-col gap-4 p-4">
        <Controller
          control={form.control}
          name="company.mode"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value as CompanyMode);
                form.clearErrors("company");
                resetFiles();
              }}
              className="flex flex-wrap gap-x-6 gap-y-2"
              aria-label="Firma"
            >
              {MODES.map((item) => (
                <Field
                  key={item.value}
                  orientation="horizontal"
                  className="w-auto"
                >
                  <RadioGroupItem
                    id={`company-mode-${item.value}`}
                    value={item.value}
                  />
                  <FieldLabel
                    htmlFor={`company-mode-${item.value}`}
                    className="font-normal"
                  >
                    {item.label}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          )}
        />

        {mode === "existing" && (
          <Controller
            control={form.control}
            name="company.id"
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error} className="max-w-md">
                <FormLabel htmlFor="company-id" required>
                  Firma
                </FormLabel>
                <SearchCombobox
                  id="company-id"
                  items={items}
                  value={field.value}
                  onChange={pickCompany}
                  onBlur={field.onBlur}
                  invalid={!!fieldState.error}
                  placeholder="Firma seçin"
                  noItemsText="Henüz firma yok."
                  noMatchText="Aramanızla eşleşen firma yok."
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}

        {mode === "existing" && loadingId !== null && (
          <p className="text-sm text-muted-foreground">
            Firma bilgileri yükleniyor…
          </p>
        )}

        {shared && fieldsShown && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Bu firma {otherMembers} başka üyede de kullanılıyor, değişiklik
            onlarda da görünür.
          </p>
        )}

        {fieldsShown && (
          <CompanyFields
            // a new set of inputs per mode, each bound to its own fields
            key={mode}
            form={form}
            prefix={mode === "new" ? "company.new" : "company.existing"}
            currentLogo={pickedCompany?.logo ?? null}
            currentActivityDocument={pickedCompany?.activityDocument ?? null}
          />
        )}
      </div>
    </section>
  );
}

function CompanyFields({
  form,
  prefix,
  currentLogo,
  currentActivityDocument,
}: {
  form: MemberFormApi;
  prefix: "company.new" | "company.existing";
  currentLogo: string | null;
  currentActivityDocument: string | null;
}) {
  const sectorId = `${prefix}.sectorId` as const;

  return (
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
      <TextField
        form={form}
        name={`${prefix}.title`}
        label="Ünvan"
        required
        className="sm:col-span-2"
      />

      <Controller
        control={form.control}
        name={sectorId}
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={inputId(sectorId)}>Sektör</FieldLabel>
            <SectorCombobox
              id={inputId(sectorId)}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          </Field>
        )}
      />
      <TextField
        form={form}
        name={`${prefix}.phone`}
        label="Telefon"
        type="tel"
      />

      <TextField
        form={form}
        name={`${prefix}.address`}
        label="Adres"
        className="sm:col-span-2"
      />

      <DateField
        form={form}
        name={`${prefix}.foundingDate`}
        label="Kuruluş Tarihi"
      />
      <Field>
        <FieldLabel htmlFor="companyRole">Görev</FieldLabel>
        <Input
          id="companyRole"
          autoComplete="off"
          placeholder="Üyenin firmadaki görevi, ör. Genel Müdür"
          {...form.register("companyRole")}
        />
      </Field>

      <LogoField form={form} currentLogo={currentLogo} />

      <TextField
        form={form}
        name={`${prefix}.employeeCount`}
        label="İstihdam Sayısı"
        inputMode="numeric"
      />
      <TextField form={form} name={`${prefix}.website`} label="Web Sitesi" />

      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={inputId(`${prefix}.companyIntro`)}>
          Tanıtım Yazısı
        </FieldLabel>
        <Textarea
          id={inputId(`${prefix}.companyIntro`)}
          {...form.register(`${prefix}.companyIntro`)}
        />
      </Field>

      <DocumentFormField
        form={form}
        name="company.activityDocument"
        label="Faaliyet Belgesi / Sicil Gazetesi"
        currentFilename={currentActivityDocument}
      />
    </div>
  );
}

function LogoField({
  form,
  currentLogo,
}: {
  form: MemberFormApi;
  currentLogo: string | null;
}) {
  const { control } = form;
  const logo = useController({ control, name: "company.logo" });
  const removeLogo = useController({ control, name: "company.removeLogo" });

  const pick = async (file: File | null) => {
    logo.field.onChange(file);
    if (!(await form.trigger("company.logo"))) return;
    // a PDF or SVG is drawn now, so one that can't be is reported before saving
    const message = await drawnLogoError(file);
    if (message && form.getValues("company.logo") === file) {
      form.setError("company.logo", { message });
    }
  };

  return (
    <Field data-invalid={!!logo.fieldState.error}>
      <FieldLabel htmlFor="company-logo">Logo</FieldLabel>
      <LogoDropZone
        id="company-logo"
        file={logo.field.value ?? null}
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
