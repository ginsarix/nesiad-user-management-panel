import { type ReactNode, useRef } from "react";
import {
  type FieldError as FormFieldError,
  type UseFormRegisterReturn,
  type UseFormReturn,
  useWatch,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fillTemplate } from "@/lib/sms/templates";
import { cn } from "@/lib/utils";
import { SMS_MAX_LENGTH } from "@/lib/zod-schemas/sms";

/** Every notice template is a plain string, keyed by its API field name */
export type Templates = Record<string, string>;

export type SmsTemplate = { label: string; name: string };
export type EmailTemplate = { label: string; subject: string; body: string };

/** A group of notice templates (e.g. Başvuru) and how to show them */
export type NoticeGroup = {
  placeholders: Record<string, string>;
  sample: Record<string, string>;
  sms: SmsTemplate[];
  email: EmailTemplate[];
};

export function smsFields(group: NoticeGroup): string[] {
  return group.sms.map((t) => t.name);
}

export function emailFields(group: NoticeGroup): string[] {
  return group.email.flatMap((t) => [t.subject, t.body]);
}

/** One channel (SMS or e-posta) of a group's templates */
export function TemplateChannelFields({
  form,
  group,
  channel,
}: {
  form: UseFormReturn<Templates>;
  group: NoticeGroup;
  channel: "sms" | "email";
}) {
  return (
    <div className="flex flex-col divide-y rounded-lg border bg-card px-4">
      {channel === "sms"
        ? group.sms.map((template) => (
            <SmsTemplateField
              key={template.name}
              form={form}
              template={template}
              placeholders={group.placeholders}
              sample={group.sample}
            />
          ))
        : group.email.map((template) => (
            <EmailTemplateFields
              key={template.subject}
              form={form}
              template={template}
              placeholders={group.placeholders}
              sample={group.sample}
            />
          ))}
    </div>
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
      setValue={(next) => setTemplate(form, template.name, next)}
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
  setValue,
  value,
  error,
  placeholders,
  sample,
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  /** Sets the field's value as if typed, for the placeholder buttons */
  setValue: (value: string) => void;
  value: string;
  error: FormFieldError | undefined;
  placeholders: Record<string, string>;
  sample: Record<string, string>;
}) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  const focused = useRef(false);
  const preview = fillTemplate(value.trim(), sample);
  const tooLong = preview.length > SMS_MAX_LENGTH;

  return (
    <div className={ROW}>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea
          id={id}
          rows={3}
          aria-invalid={!!error}
          {...registration}
          ref={(element) => {
            registration.ref(element);
            field.current = element;
          }}
          onFocus={() => {
            focused.current = true;
          }}
        />
        <PlaceholderChips
          placeholders={placeholders}
          onPick={(token) => {
            if (field.current) {
              insertToken(field.current, token, focused.current, setValue);
            }
          }}
        />
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
  const subjectField = useRef<HTMLInputElement | null>(null);
  const bodyField = useRef<HTMLTextAreaElement | null>(null);
  // the placeholder buttons insert into whichever was used last, Metin at first
  const lastFocused = useRef<"subject" | "body" | null>(null);
  const subjectRegistration = form.register(template.subject);
  const bodyRegistration = form.register(template.body);
  const subjectId = `template-${template.subject}`;
  const bodyId = `template-${template.body}`;
  const filledSubject = fillTemplate((subject ?? "").trim(), sample);
  const filledBody = fillTemplate((body ?? "").trim(), sample);

  function insert(token: string) {
    const intoSubject = lastFocused.current === "subject";
    const element = intoSubject ? subjectField.current : bodyField.current;
    if (!element) return;
    insertToken(element, token, lastFocused.current !== null, (next) =>
      setTemplate(form, intoSubject ? template.subject : template.body, next),
    );
  }

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
              {...subjectRegistration}
              ref={(element) => {
                subjectRegistration.ref(element);
                subjectField.current = element;
              }}
              onFocus={() => {
                lastFocused.current = "subject";
              }}
            />
            <FieldError errors={[errors[template.subject]]} />
          </Field>
          <Field data-invalid={!!errors[template.body]}>
            <FieldLabel htmlFor={bodyId}>Metin</FieldLabel>
            <Textarea
              id={bodyId}
              rows={7}
              aria-invalid={!!errors[template.body]}
              {...bodyRegistration}
              ref={(element) => {
                bodyRegistration.ref(element);
                bodyField.current = element;
              }}
              onFocus={() => {
                lastFocused.current = "body";
              }}
            />
            <PlaceholderChips placeholders={placeholders} onPick={insert} />
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

function setTemplate(
  form: UseFormReturn<Templates>,
  name: string,
  value: string,
) {
  form.setValue(name, value, {
    shouldDirty: true,
    // like typing: errors update live only once saving has been tried
    shouldValidate: form.formState.isSubmitted,
  });
}

/**
 * Puts `token` where the cursor is (replacing a selection), or at the end
 * when the field hasn't been used yet, and leaves the cursor after it.
 */
function insertToken(
  element: HTMLInputElement | HTMLTextAreaElement,
  token: string,
  atCursor: boolean,
  setValue: (value: string) => void,
) {
  const { value } = element;
  const start = atCursor
    ? (element.selectionStart ?? value.length)
    : value.length;
  const end = atCursor ? (element.selectionEnd ?? start) : value.length;
  element.focus();
  element.setSelectionRange(start, end);

  // Typed in through the browser's own editing, so Cmd/Ctrl+Z undoes it and
  // the form sees an ordinary input event. execCommand is deprecated but is
  // still the only way into a text field's undo history.
  if (document.execCommand("insertText", false, token)) return;

  setValue(value.slice(0, start) + token + value.slice(end));
  const caret = start + token.length;
  element.setSelectionRange(caret, caret);
}

/** One button per placeholder; hovering shows what it stands for */
function PlaceholderChips({
  placeholders,
  onPick,
}: {
  placeholders: Record<string, string>;
  onPick: (token: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Ekle:</span>
      {Object.entries(placeholders).map(([key, text]) => (
        <Tooltip key={key}>
          <TooltipTrigger
            type="button"
            aria-label={`{${key}} ekle: ${text}`}
            onClick={() => onPick(`{${key}}`)}
            className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground hover:border-primary/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            {`{${key}}`}
          </TooltipTrigger>
          <TooltipContent>{text}</TooltipContent>
        </Tooltip>
      ))}
    </div>
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
