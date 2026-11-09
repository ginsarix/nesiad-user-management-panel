"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { type FieldErrors, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ApplicationError, submitApplication } from "@/lib/fetches/application";
import {
  type ApplicationFormInput,
  type ApplicationFormValues,
  applicationFormSchema,
} from "@/lib/zod-schemas/application";
import {
  AssociationStep,
  CompanyStep,
  ConsentStep,
  DocumentsStep,
  PersonalStep,
  TrapField,
} from "./step-fields";
import { APPLICATION_STEPS, stepOfField } from "./steps";

const CONTACT_LINE = "0 (384) 212 36 50 · nesiad@nesiad.org.tr";

const DEFAULT_VALUES: ApplicationFormInput = {
  applicantFirstName: "",
  applicantLastName: "",
  birthDate: "",
  birthPlace: "",
  nationalId: "",
  gender: "",
  education: "",
  mobilePhone: "",
  email: "",
  title: "",
  applicantRole: "",
  employeeCount: "",
  address: "",
  phone: "",
  website: "",
  companyIntro: "",
  referenceName: "",
  otherAssociations: "",
  logo: null,
  identityDocument: null,
  activityDocument: null,
  consentRules: false,
  consentData: false,
  leaveBlank: "",
};

export function ApplicationForm() {
  // One form for every step: values and chosen files live here, so moving
  // between steps never loses them
  const form = useForm<ApplicationFormInput, unknown, ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: DEFAULT_VALUES,
    shouldUnregister: false,
  });
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepChanged = useRef(false);
  // field to focus once the step it's on has rendered
  const focusAfterStep = useRef<keyof ApplicationFormInput | null>(null);
  const { isDirty, errors } = form.formState;

  // a refresh clears the form, so warn once something was entered
  useEffect(() => {
    if (!isDirty || done) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, done]);

  // after moving between steps, start at the top with the step's heading,
  // or at the field with an error when the move was to show it
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on step change only
  useEffect(() => {
    if (!stepChanged.current) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
    const field = focusAfterStep.current;
    focusAfterStep.current = null;
    if (field) form.setFocus(field);
  }, [step]);

  function goTo(next: number) {
    stepChanged.current = true;
    setStep(next);
  }

  // show the step holding a field with an error and put focus on that field
  function showField(field: keyof ApplicationFormInput) {
    const target = stepOfField(field);
    if (target < 0) return;
    if (target === step) {
      form.setFocus(field);
    } else {
      focusAfterStep.current = field;
      goTo(target);
    }
  }

  const isLast = step === APPLICATION_STEPS.length - 1;

  // steps move freely; every step is validated only when the form is sent
  const stepHasError = APPLICATION_STEPS.map((s) =>
    s.fields.some((field) => errors[field]),
  );

  async function submit(values: ApplicationFormValues) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitApplication(values);
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Başvuru gönderilemedi";
      const field = error instanceof ApplicationError ? error.field : undefined;
      if (field && stepOfField(field) >= 0) {
        form.setError(field as keyof ApplicationFormInput, { message });
        showField(field as keyof ApplicationFormInput);
      } else {
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // go to the first field with an error, in step and field order
  function invalid(invalidFields: FieldErrors<ApplicationFormInput>) {
    const first = APPLICATION_STEPS.flatMap((s) => s.fields).find(
      (field) => invalidFields[field],
    );
    if (first) showField(first);
  }

  if (done) {
    return (
      <section className="rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Başvurunuz alındı</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Teşekkür ederiz. Başvurunuz incelendikten sonra size e-posta ve SMS
          ile bilgi verilecektir.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">{CONTACT_LINE}</p>
      </section>
    );
  }

  const current = APPLICATION_STEPS[step];

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!isLast) goTo(step + 1);
        else void form.handleSubmit(submit, invalid)(event);
      }}
      className="relative flex flex-col gap-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
    >
      <div>
        <h1 className="text-lg font-semibold">Üyelik Başvurusu</h1>
        <p className="text-sm text-muted-foreground">
          <span className="text-destructive">*</span> ile işaretli alanların
          doldurulması zorunludur.
        </p>
      </div>

      <nav aria-label="Adımlar">
        <ol className="flex gap-1">
          {APPLICATION_STEPS.map((s, index) => (
            <li key={s.id} className="flex flex-1">
              <button
                type="button"
                onClick={() => {
                  if (index !== step) goTo(index);
                }}
                aria-current={index === step ? "step" : undefined}
                className={`flex-1 cursor-pointer border-t-4 pt-1 text-center text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm ${
                  stepHasError[index]
                    ? index === step
                      ? "border-destructive text-destructive"
                      : "border-destructive/40 text-destructive"
                    : index === step
                      ? "border-sidebar"
                      : index < step
                        ? "border-sidebar/40 text-muted-foreground hover:text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                } ${index === step ? "font-semibold" : ""}`}
              >
                <span className="sr-only">{index + 1}. adım: </span>
                {s.title}
                {stepHasError[index] && (
                  <span className="sr-only"> (hatalı alan var)</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold outline-none"
      >
        {step + 1}. Adım: {current.title}
      </h2>

      {step === 0 && <PersonalStep form={form} />}
      {step === 1 && <CompanyStep form={form} />}
      {step === 2 && <AssociationStep form={form} />}
      {step === 3 && <DocumentsStep form={form} />}
      {step === 4 && (
        <>
          <ConsentStep form={form} />
          <TrapField form={form} />
        </>
      )}

      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => goTo(step - 1)}
          >
            Geri
          </Button>
        ) : (
          <span />
        )}
        {isLast ? (
          <Button type="submit" disabled={submitting}>
            {submitting ? "Gönderiliyor…" : "Ön Üyelik Başvurusunu Yap"}
          </Button>
        ) : (
          <Button type="submit">Devam Et</Button>
        )}
      </div>
    </form>
  );
}
