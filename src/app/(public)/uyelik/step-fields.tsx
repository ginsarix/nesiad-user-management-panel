import { type Control, Controller, type UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ApplicationFormInput,
  ApplicationFormValues,
} from "@/lib/zod-schemas/application";
import { FileField } from "./file-field";

type Form = UseFormReturn<ApplicationFormInput, unknown, ApplicationFormValues>;

const PRIVACY_PDF_URL = "https://www.nesiad.org.tr/dosya/Uyelik_Formu.pdf";

const GENDER_ITEMS = [
  { value: "", label: "Seçin" },
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
];

function Label({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      <span>
        {children}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </span>
    </FieldLabel>
  );
}

type TextName =
  | "applicantFirstName"
  | "applicantLastName"
  | "birthPlace"
  | "nationalId"
  | "education"
  | "mobilePhone"
  | "email"
  | "title"
  | "applicantRole"
  | "employeeCount"
  | "phone"
  | "website"
  | "referenceName";

function TextField({
  form,
  name,
  label,
  required = true,
  type = "text",
  inputMode,
  autoComplete = "off",
  className,
}: {
  form: Form;
  name: TextName;
  label: string;
  required?: boolean;
  type?: string;
  inputMode?: "numeric" | "tel" | "email" | "url" | "text";
  autoComplete?: string;
  className?: string;
}) {
  const error = form.formState.errors[name];
  return (
    <Field className={className} data-invalid={!!error}>
      <Label htmlFor={name} required={required}>
        {label}
      </Label>
      <Input
        id={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        {...form.register(name)}
      />
      <FieldError errors={[error]} />
    </Field>
  );
}

export function PersonalStep({ form }: { form: Form }) {
  const { errors } = form.formState;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        form={form}
        name="applicantFirstName"
        label="Ad"
        autoComplete="given-name"
      />
      <TextField
        form={form}
        name="applicantLastName"
        label="Soyad"
        autoComplete="family-name"
      />
      <Controller
        control={form.control}
        name="birthDate"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <Label htmlFor="birthDate" required>
              Doğum Tarihi
            </Label>
            <DatePickerInput
              id="birthDate"
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <TextField form={form} name="birthPlace" label="Doğum Yeri" />
      <TextField
        form={form}
        name="nationalId"
        label="TC Kimlik No"
        inputMode="numeric"
      />
      <Controller
        control={form.control}
        name="gender"
        render={({ field }) => (
          <Field data-invalid={!!errors.gender}>
            <Label htmlFor="gender" required>
              Cinsiyet
            </Label>
            <Select
              items={GENDER_ITEMS}
              value={field.value}
              onValueChange={(value) => field.onChange(value ?? "")}
            >
              <SelectTrigger
                id="gender"
                className="w-full"
                aria-invalid={!!errors.gender}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENDER_ITEMS.filter((item) => item.value !== "").map(
                  (item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <FieldError errors={[errors.gender]} />
          </Field>
        )}
      />
      <TextField form={form} name="education" label="Eğitim Durumu" />
      <TextField
        form={form}
        name="mobilePhone"
        label="Cep Telefonu"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
      />
      <TextField
        form={form}
        name="email"
        label="E-posta"
        type="email"
        inputMode="email"
        autoComplete="email"
        className="sm:col-span-2"
      />
    </div>
  );
}

export function CompanyStep({ form }: { form: Form }) {
  const { errors } = form.formState;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField form={form} name="title" label="Firma Adı" />
      <TextField
        form={form}
        name="applicantRole"
        label="Göreviniz ve Ünvanınız"
      />
      <TextField
        form={form}
        name="employeeCount"
        label="İstihdam Sayısı"
        inputMode="numeric"
      />
      <TextField
        form={form}
        name="phone"
        label="İş Telefonu"
        type="tel"
        inputMode="tel"
      />
      <Field className="sm:col-span-2" data-invalid={!!errors.address}>
        <Label htmlFor="address" required>
          İş Adresi
        </Label>
        <Textarea
          id="address"
          autoComplete="off"
          aria-invalid={!!errors.address}
          {...form.register("address")}
        />
        <FieldError errors={[errors.address]} />
      </Field>
      <TextField
        form={form}
        name="website"
        label="Web Sitesi"
        inputMode="url"
        className="sm:col-span-2"
      />
      <Field className="sm:col-span-2" data-invalid={!!errors.companyIntro}>
        <Label htmlFor="companyIntro" required>
          Firmanız Hakkında En Az 3 Cümleden Oluşan Tanıtım Yazısı
        </Label>
        <Textarea
          id="companyIntro"
          rows={6}
          aria-invalid={!!errors.companyIntro}
          {...form.register("companyIntro")}
        />
        <FieldError errors={[errors.companyIntro]} />
      </Field>
    </div>
  );
}

export function AssociationStep({ form }: { form: Form }) {
  const { errors } = form.formState;
  return (
    <div className="grid gap-4">
      <TextField form={form} name="referenceName" label="Referans" />
      <Field data-invalid={!!errors.otherAssociations}>
        <Label htmlFor="otherAssociations">Diğer Dernek ve Kulüpler</Label>
        <Textarea
          id="otherAssociations"
          aria-invalid={!!errors.otherAssociations}
          {...form.register("otherAssociations")}
        />
        <FieldError errors={[errors.otherAssociations]} />
      </Field>
    </div>
  );
}

function FileStepField({
  control,
  name,
  label,
  hint,
  accept,
}: {
  control: Control<ApplicationFormInput>;
  name: "logo" | "identityDocument" | "activityDocument";
  label: string;
  hint: string;
  accept: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <Label htmlFor={name} required>
            {label}
          </Label>
          <FieldDescription id={`${name}-hint`}>{hint}</FieldDescription>
          <FileField
            id={name}
            file={field.value}
            accept={accept}
            onPick={field.onChange}
            onBlur={field.onBlur}
            invalid={fieldState.invalid}
            describedBy={`${name}-hint`}
          />
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function DocumentsStep({ form }: { form: Form }) {
  return (
    <div className="grid gap-4">
      <FileStepField
        control={form.control}
        name="logo"
        label="Firma Logosu"
        hint="PNG veya JPG, en fazla 5 MB"
        accept=".png,.jpg,.jpeg"
      />
      <FileStepField
        control={form.control}
        name="identityDocument"
        label="Kimlik Belgesi"
        hint="PDF, PNG veya JPG, en fazla 5 MB"
        accept=".pdf,.png,.jpg,.jpeg"
      />
      <FileStepField
        control={form.control}
        name="activityDocument"
        label="Faaliyet Belgesi veya Sicil Gazetesi"
        hint="PDF, PNG veya JPG, en fazla 5 MB"
        accept=".pdf,.png,.jpg,.jpeg"
      />
    </div>
  );
}

function ConsentField({
  form,
  name,
  children,
}: {
  form: Form;
  name: "consentRules" | "consentData";
  children: React.ReactNode;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <div className="flex items-start gap-3">
            <Checkbox
              id={name}
              className="mt-1"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
            />
            <label htmlFor={name} className="text-sm leading-relaxed">
              {children}
              <span className="text-destructive" aria-hidden="true">
                {" "}
                *
              </span>
            </label>
          </div>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function ConsentStep({ form }: { form: Form }) {
  return (
    <div className="grid gap-5">
      <ConsentField form={form} name="consentRules">
        Yukarıdaki beyanın doğru olduğunu, Nevşehir Sanayici ve İş İnsanları
        Derneği&apos;nin dernek tüzüğünü okudum. Amaç ve yükümlülüklerini kabul
        ettim. Üye olmak istiyorum. Aidatımı üyeliğim süresince ödemeyi ve
        dernek çalışmalarına katkıda bulunacağımı taahhüt eder, derneğe kabul
        edilmemi arz ederim.
      </ConsentField>
      <ConsentField form={form} name="consentData">
        Kişisel verilerin korunması hakkında bilgilendirmeyi okudum,
        onaylıyorum.
      </ConsentField>
      <a
        href={PRIVACY_PDF_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-fit text-sm text-primary hover:underline"
      >
        Ayrıntılar İçin Tıklayınız
      </a>
    </div>
  );
}

/** Off-screen trap for bots: people never see or reach it */
export function TrapField({ form }: { form: Form }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -left-[10000px] top-auto size-px overflow-hidden"
    >
      <label htmlFor="faxNumber">Faks</label>
      <input
        id="faxNumber"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        {...form.register("faxNumber")}
      />
    </div>
  );
}
