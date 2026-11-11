"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createParameter,
  type Parameter,
  updateParameter,
} from "@/lib/fetches/parameter";
import { PARAMETER_KIND_LABELS, type ParameterKind } from "@/lib/parameters";
import {
  type ParameterNameFormValues,
  parameterNameSchema,
} from "@/lib/zod-schemas/parameter";

/** Adds an entry to `kind`'s list without `parameter`, renames it with one */
export function ParameterDialog({
  kind,
  parameter,
  open,
  onOpenChange,
}: {
  kind: ParameterKind;
  parameter?: Parameter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const label = PARAMETER_KIND_LABELS[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {parameter ? `${label} Düzenle` : `Yeni ${label}`}
          </DialogTitle>
        </DialogHeader>
        {/* the content unmounts when closed, so each opening starts fresh */}
        <ParameterForm
          kind={kind}
          parameter={parameter}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ParameterForm({
  kind,
  parameter,
  onSaved,
}: {
  kind: ParameterKind;
  parameter?: Parameter;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(parameterNameSchema),
    defaultValues: { name: parameter?.name ?? "" },
  });
  const { errors } = form.formState;

  const { mutate, isPending } = useMutation({
    mutationFn: (values: ParameterNameFormValues) =>
      parameter
        ? updateParameter(parameter.id, values)
        : createParameter({ kind, ...values }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["parameters"] }),
        // payments show the tür and tip names
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        // Organizasyon pages show the Dernek Görevi names
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      ]);
      onSaved();
    },
    // e.g. "Bu listede aynı isimde bir kayıt zaten var"
    onError: (error) => form.setError("name", { message: error.message }),
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutate(values))}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="parameter-name">Ad</FieldLabel>
        <Input
          id="parameter-name"
          autoComplete="off"
          autoFocus
          aria-invalid={!!errors.name}
          {...form.register("name")}
        />
        <FieldError errors={[errors.name]} />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </form>
  );
}
