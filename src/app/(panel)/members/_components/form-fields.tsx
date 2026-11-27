"use client";

import type { ReactNode } from "react";
import {
  Controller,
  type FieldPathByValue,
  type UseFormReturn,
  useController,
} from "react-hook-form";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
  MemberFormInput,
  MemberFormValues,
} from "@/lib/zod-schemas/member";
import { DocumentField } from "./document-field";

/** The member form, as its sections receive it */
export type MemberFormApi = UseFormReturn<
  MemberFormInput,
  unknown,
  MemberFormValues
>;

type TextPath = FieldPathByValue<MemberFormInput, string>;
type DocumentPath = "identityDocument" | "company.activityDocument";

/** An input id from a field path ("company.new.title" → "company-new-title") */
export function inputId(name: string) {
  return name.replaceAll(".", "-");
}

export function FormLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {children}
      {required && " "}
      {required && <span className="text-destructive">*</span>}
    </FieldLabel>
  );
}

/** A registered text input, so the browser's own undo keeps working */
export function TextField({
  form,
  name,
  label,
  required,
  type,
  inputMode,
  autoFocus,
  className,
}: {
  form: MemberFormApi;
  name: TextPath;
  label: string;
  required?: boolean;
  type?: string;
  inputMode?: "numeric";
  autoFocus?: boolean;
  className?: string;
}) {
  const { error } = form.getFieldState(name, form.formState);
  const id = inputId(name);

  return (
    <Field data-invalid={!!error} className={className}>
      <FormLabel htmlFor={id} required={required}>
        {label}
      </FormLabel>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={!!error}
        {...form.register(name)}
      />
      <FieldError errors={[error]} />
    </Field>
  );
}

export function DateField({
  form,
  name,
  label,
}: {
  form: MemberFormApi;
  name: TextPath;
  label: string;
}) {
  const id = inputId(name);

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={!!fieldState.error}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <DatePickerInput
            id={id}
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

/** A document upload; picking nothing keeps the stored file */
export function DocumentFormField({
  form,
  name,
  label,
  currentFilename,
  className,
}: {
  form: MemberFormApi;
  name: DocumentPath;
  label: string;
  currentFilename: string | null;
  className?: string;
}) {
  const { field, fieldState } = useController({ control: form.control, name });
  const id = inputId(name);

  return (
    <Field data-invalid={!!fieldState.error} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <DocumentField
        id={id}
        file={field.value ?? null}
        currentFilename={currentFilename}
        onPick={(file) => {
          field.onChange(file);
          void form.trigger(name);
        }}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  );
}
