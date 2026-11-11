import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { type UseFormReturn, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fillTemplate } from "@/lib/sms/templates";
import { SMS_MAX_LENGTH } from "@/lib/zod-schemas/sms";

/** Every notice template is a plain string, keyed by its API field name */
type Templates = Record<string, string>;

export type SmsTemplate = { label: string; name: string };
export type EmailTemplate = { label: string; subject: string; body: string };

type Channel =
  | { channel: "sms"; templates: SmsTemplate[] }
  | { channel: "email"; templates: EmailTemplate[] };

type TemplateChannelFormProps = Channel & {
  queryKey: readonly string[];
  load: () => Promise<Templates>;
  /** Saves every template of the group: the saved ones with this channel's edits */
  save: (values: Templates) => Promise<Templates>;
  /** Validates only this channel's fields */
  schema: z.ZodType<Templates, Templates>;
  placeholders: Record<string, string>;
  sample: Record<string, string>;
  loadError: string;
  onDirtyChange?: (dirty: boolean) => void;
};

/**
 * One channel (SMS or e-posta) of a group of notice templates. The other
 * channel has its own form, so each Kaydet saves only what is on screen.
 */
export function TemplateChannelForm(props: TemplateChannelFormProps) {
  const { data, isError } = useQuery<Templates>({
    queryKey: props.queryKey,
    queryFn: () => props.load(),
  });

  if (isError) {
    return <p className="text-sm text-destructive">{props.loadError}</p>;
  }
  return data ? <LoadedForm {...props} saved={data} /> : null;
}

function fieldNames(props: Channel): string[] {
  return props.channel === "sms"
    ? props.templates.map((t) => t.name)
    : props.templates.flatMap((t) => [t.subject, t.body]);
}

function pick(values: Templates, names: string[]): Templates {
  return Object.fromEntries(names.map((name) => [name, values[name] ?? ""]));
}

function LoadedForm(props: TemplateChannelFormProps & { saved: Templates }) {
  const { queryKey, save, schema, saved, onDirtyChange } = props;
  const queryClient = useQueryClient();
  const [justSaved, setJustSaved] = useState(false);
  const names = fieldNames(props);

  const form = useForm<Templates>({
    resolver: zodResolver(schema),
    defaultValues: pick(saved, names),
  });
  const { isDirty } = form.formState;
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const { mutate, isPending, error } = useMutation({
    mutationFn: (values: Templates) => {
      // the latest saved group, so the other channel's saved texts are kept
      const current = queryClient.getQueryData<Templates>(queryKey) ?? saved;
      return save({ ...current, ...values });
    },
    onSuccess: async (result) => {
      form.reset(pick(result, names));
      setJustSaved(true);
      queryClient.setQueryData(queryKey, result);
      await queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutate(values))}
      onChange={() => setJustSaved(false)}
      className="flex max-w-3xl flex-col gap-6 rounded-lg border bg-card p-4"
      noValidate
    >
      {props.channel === "sms"
        ? props.templates.map((template) => (
            <SmsTemplateField
              key={template.name}
              form={form}
              template={template}
              placeholders={props.placeholders}
              sample={props.sample}
            />
          ))
        : props.templates.map((template) => (
            <EmailTemplateFields
              key={template.subject}
              form={form}
              template={template}
              placeholders={props.placeholders}
              sample={props.sample}
            />
          ))}

      <SaveRow
        isDirty={isDirty}
        isPending={isPending}
        saved={justSaved}
        error={error}
      />
    </form>
  );
}

function SmsTemplateField({
  form,
  template,
  placeholders,
  sample,
}: {
  form: UseFormReturn<Templates>;
  template: SmsTemplate;
  placeholders: Record<string, string>;
  sample: Record<string, string>;
}) {
  const value = useWatch({ control: form.control, name: template.name });
  const error = form.formState.errors[template.name];
  const preview = fillTemplate((value ?? "").trim(), sample);
  const id = `template-${template.name}`;

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{template.label}</FieldLabel>
      <Textarea
        id={id}
        rows={3}
        aria-invalid={!!error}
        {...form.register(template.name)}
      />
      <PlaceholderList placeholders={placeholders} />
      <FieldError errors={[error]} />
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
        <div className="text-xs text-muted-foreground">
          Örnek · {preview.length} / {SMS_MAX_LENGTH} karakter
        </div>
        {preview}
      </div>
    </Field>
  );
}

function EmailTemplateFields({
  form,
  template,
  placeholders,
  sample,
}: {
  form: UseFormReturn<Templates>;
  template: EmailTemplate;
  placeholders: Record<string, string>;
  sample: Record<string, string>;
}) {
  const { errors } = form.formState;
  const [subject, body] = useWatch({
    control: form.control,
    name: [template.subject, template.body],
  });
  const subjectId = `template-${template.subject}`;
  const bodyId = `template-${template.body}`;

  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-medium">{template.label}</h3>

      <Field data-invalid={!!errors[template.subject]}>
        <FieldLabel htmlFor={subjectId}>Konu</FieldLabel>
        <Input
          id={subjectId}
          aria-invalid={!!errors[template.subject]}
          {...form.register(template.subject)}
        />
        <FieldError errors={[errors[template.subject]]} />
      </Field>

      <Field data-invalid={!!errors[template.body]}>
        <FieldLabel htmlFor={bodyId}>Metin</FieldLabel>
        <Textarea
          id={bodyId}
          rows={7}
          aria-invalid={!!errors[template.body]}
          {...form.register(template.body)}
        />
        <PlaceholderList placeholders={placeholders} />
        <FieldError errors={[errors[template.body]]} />
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">Örnek · e-posta</div>
          <div className="font-medium">
            {fillTemplate((subject ?? "").trim(), sample)}
          </div>
          <div className="mt-2 whitespace-pre-wrap">
            {fillTemplate((body ?? "").trim(), sample)}
          </div>
        </div>
      </Field>
    </section>
  );
}

function PlaceholderList({
  placeholders,
}: {
  placeholders: Record<string, string>;
}) {
  return (
    <FieldDescription>
      {Object.entries(placeholders).map(([key, text], i) => (
        <span key={key}>
          {i > 0 && " · "}
          <code>{`{${key}}`}</code> {text}
        </span>
      ))}
    </FieldDescription>
  );
}

export function SaveRow({
  isDirty,
  isPending,
  saved,
  error,
}: {
  isDirty: boolean;
  isPending: boolean;
  saved: boolean;
  error: Error | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={!isDirty || isPending}>
        {isPending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
      {saved && !isDirty && (
        <span className="flex items-center gap-1.5 text-sm text-primary">
          <CircleCheck className="size-4" />
          Kaydedildi
        </span>
      )}
      {error && <FieldError>{error.message}</FieldError>}
    </div>
  );
}
