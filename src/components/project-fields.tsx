"use client";

import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * A proje's Ad, Proje Numarası and Aktif inputs. The Projeler form binds
 * them at the top level (prefix ""), the Tahsilat form's "Yeni proje"
 * under "project." — it is the same record either way.
 */
export function ProjectFields<T extends FieldValues>({
  control,
  prefix,
}: {
  control: Control<T>;
  prefix: "" | "project.";
}) {
  const name = (field: "name" | "number" | "active") =>
    `${prefix}${field}` as Path<T>;
  const id = (field: string) => `${prefix.replace(".", "-")}${field}`;

  return (
    <>
      <Controller
        control={control}
        name={name("name")}
        render={({ field, fieldState }) => (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel htmlFor={id("name")}>
              Proje Adı <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id={id("name")}
              autoComplete="off"
              aria-invalid={!!fieldState.error}
              {...field}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name={name("number")}
        render={({ field, fieldState }) => (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel htmlFor={id("number")}>
              Proje Numarası <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id={id("number")}
              autoComplete="off"
              aria-invalid={!!fieldState.error}
              {...field}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name={name("active")}
        render={({ field }) => (
          <Field orientation="horizontal" className="self-start">
            <Checkbox
              id={id("active")}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <FieldLabel htmlFor={id("active")} className="font-normal">
              Aktif proje
            </FieldLabel>
          </Field>
        )}
      />
    </>
  );
}
