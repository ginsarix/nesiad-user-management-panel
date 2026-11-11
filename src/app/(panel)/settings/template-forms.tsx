import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  type FieldError as FormFieldError,
  type UseFormRegisterReturn,
  type UseFormReturn,
  useForm,
  useWatch,
} from "react-hook-form";
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
import { cn } from "@/lib/utils";
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
      className="flex flex-col divide-y rounded-lg border bg-card px-4"
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

      <div className="py-4">
        <SaveRow
          isDirty={isDirty}
          isPending={isPending}
          saved={justSaved}
          error={error}
        />
      </div>
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
  return (
    <SmsTemplateRow
      id={`template-${template.name}`}
      label={template.label}
      registration={form.register(template.name)}
      value={value ?? ""}
      error={form.formState.errors[template.name]}
      placeholders={placeholders}
      sample={sample}
    />
  );
}

/** An SMS template: the text on the left, how it reads on the right */
export function SmsTemplateRow({
  id,
  label,
  registration,
  value,
  error,
  placeholders,
  sample,
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  value: string;
  error: FormFieldError | undefined;
  placeholders: Record<string, string>;
  sample: Record<string, string>;
}) {
  const preview = fillTemplate(value.trim(), sample);
  const tooLong = preview.length > SMS_MAX_LENGTH;

  return (
    <div className={ROW}>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea id={id} rows={3} aria-invalid={!!error} {...registration} />
        <PlaceholderList placeholders={placeholders} />
        <FieldError errors={[error]} />
      </Field>
      <PreviewColumn>
        <div className="max-w-md rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm whitespace-pre-wrap">
          {preview || <Empty />}
        </div>
        <div
          className={cn(
            "text-xs text-muted-foreground",
            tooLong && "text-destructive",
          )}
        >
          {preview.length} / {SMS_MAX_LENGTH} karakter
        </div>
      </PreviewColumn>
    </div>
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
  const filledSubject = fillTemplate((subject ?? "").trim(), sample);
  const filledBody = fillTemplate((body ?? "").trim(), sample);

  return (
    <section className="flex flex-col gap-3 py-5">
      <h3 className="font-medium">{template.label}</h3>
      <div className={cn(ROW, "py-0")}>
        <div className="flex flex-col gap-4">
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
          </Field>
        </div>
        <PreviewColumn>
          <div className="rounded-md border bg-background text-sm shadow-xs">
            <div className="border-b px-3 py-2">
              <span className="text-muted-foreground">Konu: </span>
              <span className="font-medium">{filledSubject || <Empty />}</span>
            </div>
            <div className="px-3 py-3 whitespace-pre-wrap">
              {filledBody || <Empty />}
            </div>
          </div>
        </PreviewColumn>
      </div>
    </section>
  );
}

/** Editor and preview side by side on wide screens, stacked otherwise */
const ROW = "grid gap-x-6 gap-y-3 py-5 xl:grid-cols-2";

function PreviewColumn({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* lines up with the editor's label */}
      <div className="text-sm leading-snug font-medium text-muted-foreground">
        Örnek
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <span className="text-muted-foreground italic">(boş)</span>;
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
