import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type FieldValues, type UseFormReturn, useForm } from "react-hook-form";
import type { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  getCollectionNoticeTemplates,
  getNoticeSettings,
  getSmsContacts,
  getSmsSettings,
  updateCollectionNoticeTemplates,
  updateNoticeSettings,
  updateSmsSettings,
} from "@/lib/fetches/sms";
import { cn } from "@/lib/utils";
import { noticeSettingsSchema } from "@/lib/zod-schemas/application-notices";
import { collectionNoticeSettingsSchema } from "@/lib/zod-schemas/collection-notices";
import {
  type SmsSettingsValues,
  smsSettingsSchema,
} from "@/lib/zod-schemas/sms";
import { COLLECTION_NOTICES } from "./collection-notice-settings";
import { APPLICATION_NOTICES } from "./notice-settings";
import { CelebrationFields } from "./sms-settings";
import {
  emailFields,
  smsFields,
  TemplateChannelFields,
  type Templates,
} from "./template-forms";

type GroupKey = "celebrations" | "applications" | "collections";

type Section =
  | "celebrations-sms"
  | "applications-sms"
  | "applications-email"
  | "collections-sms"
  | "collections-email";

const GROUPS: {
  key: GroupKey;
  title: string;
  description: string;
  items: { section: Section; label: string; fields: string[] }[];
}[] = [
  {
    key: "celebrations",
    title: "Kutlama Bildirimleri",
    description:
      "Her gün seçilen saatten sonra (Türkiye saati) o gün kuruluş yıl dönümü olan aktif üyelere ve doğum günü olan yetkililere birer SMS gider. Sunucu o saatte kapalıysa aynı gün içinde telafi edilir; ertesi güne kalmaz. Kimseye aynı gün ikinci kez gönderilmez.",
    items: [
      {
        section: "celebrations-sms",
        label: "SMS",
        fields: [
          "autoEnabled",
          "sendTime",
          "foundingMessage",
          "birthdayMessage",
        ],
      },
    ],
  },
  {
    key: "applications",
    title: "Başvuru Bildirimleri",
    description:
      "Üyelik formundan bir başvuru gelince, başvuru kabul edilince ya da reddedilince başvurana hem SMS hem e-posta gider. Otomatik kutlama SMS'lerinin açık ya da kapalı olması bunları etkilemez.",
    items: [
      {
        section: "applications-sms",
        label: "SMS",
        fields: smsFields(APPLICATION_NOTICES),
      },
      {
        section: "applications-email",
        label: "E-posta",
        fields: emailFields(APPLICATION_NOTICES),
      },
    ],
  },
  {
    key: "collections",
    title: "Tahsilat Bildirimleri",
    description:
      "Yeni bir tahsilat kaydedilince üyeye ve tahsilatı kaydeden dışındaki bütün aktif panel kullanıcılarına hem SMS hem e-posta gider. Üyenin SMS'i Telefon numarasına gider. Tahsilat düzenlenince veya silinince bildirim gönderilmez.",
    items: [
      {
        section: "collections-sms",
        label: "SMS",
        fields: smsFields(COLLECTION_NOTICES),
      },
      {
        section: "collections-email",
        label: "E-posta",
        fields: emailFields(COLLECTION_NOTICES),
      },
    ],
  },
];

// the notice forms are typed loosely so the template fields can serve both
const APPLICATIONS_SCHEMA: z.ZodType<Templates, Templates> =
  noticeSettingsSchema;
const COLLECTIONS_SCHEMA: z.ZodType<Templates, Templates> =
  collectionNoticeSettingsSchema;

const QUERY_KEYS: Record<GroupKey, string[]> = {
  celebrations: ["sms-settings"],
  applications: ["notice-settings"],
  collections: ["collection-notice-settings"],
};

/** The Ayarlar page's Bildirimler tab: a side nav of groups and their channels */
export function NotificationsTab() {
  const celebrations = useQuery({
    queryKey: QUERY_KEYS.celebrations,
    queryFn: () => getSmsSettings(),
  });
  const applications = useQuery({
    queryKey: QUERY_KEYS.applications,
    queryFn: () => getNoticeSettings(),
  });
  const collections = useQuery({
    queryKey: QUERY_KEYS.collections,
    queryFn: () => getCollectionNoticeTemplates(),
  });
  const { data: contacts } = useQuery({
    queryKey: ["sms-contacts"],
    queryFn: () => getSmsContacts(),
  });

  if (celebrations.isError || applications.isError || collections.isError) {
    return (
      <p className="text-sm text-destructive">Bildirim ayarları yüklenemedi.</p>
    );
  }
  if (!celebrations.data || !applications.data || !collections.data) {
    return null;
  }
  return (
    <NotificationsEditor
      saved={{
        celebrations: celebrations.data,
        applications: applications.data,
        collections: collections.data,
      }}
      dryRun={contacts?.dryRun ?? false}
    />
  );
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; message: string };

function NotificationsEditor({
  saved,
  dryRun,
}: {
  saved: {
    celebrations: SmsSettingsValues;
    applications: Templates;
    collections: Templates;
  };
  dryRun: boolean;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Section>("celebrations-sms");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const forms = {
    celebrations: useForm<SmsSettingsValues>({
      resolver: zodResolver(smsSettingsSchema),
      defaultValues: saved.celebrations,
    }),
    applications: useForm<Templates>({
      resolver: zodResolver(APPLICATIONS_SCHEMA),
      defaultValues: saved.applications,
    }),
    collections: useForm<Templates>({
      resolver: zodResolver(COLLECTIONS_SCHEMA),
      defaultValues: saved.collections,
    }),
  };
  // read during render so a change in any of them redraws the tab
  const formStates = {
    celebrations: forms.celebrations.formState,
    applications: forms.applications.formState,
    collections: forms.collections.formState,
  };
  const dirtyGroups = (Object.keys(forms) as GroupKey[]).filter(
    (key) => formStates[key].isDirty,
  );
  const hasChanges = dirtyGroups.length > 0;

  function sectionState(group: GroupKey, fields: string[]) {
    const { dirtyFields, errors } = formStates[group] as {
      dirtyFields: Record<string, unknown>;
      errors: Record<string, unknown>;
    };
    return {
      dirty: fields.some((field) => dirtyFields[field]),
      invalid: fields.some((field) => errors[field]),
    };
  }

  // the browser asks before a reload or closing the tab drops unsaved edits
  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  async function saveAll() {
    clearTimeout(savedTimer.current);
    setSaveState({ kind: "saving" });

    // validate everything first, so nothing is saved while any of it is wrong
    const values = await Promise.all(
      dirtyGroups.map((key) => validatedValues(forms[key] as AnyForm)),
    );
    if (values.some((value) => value === null)) {
      setSaveState({ kind: "idle" });
      showFirstError();
      return;
    }

    const results = await Promise.allSettled(
      dirtyGroups.map((key, i) => saveGroup(key, values[i] as FieldValues)),
    );
    const failed: string[] = [];
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        const title = GROUPS.find(
          (group) => group.key === dirtyGroups[i],
        )?.title;
        failed.push(`${title}: ${errorMessage(result.reason)}`);
      }
    });

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] }),
      // the SMS page's Otomatik tab shows the celebration messages
      dirtyGroups.includes("celebrations")
        ? queryClient.invalidateQueries({ queryKey: ["sms-celebrations"] })
        : undefined,
    ]);

    if (failed.length > 0) {
      setSaveState({ kind: "failed", message: failed.join(" · ") });
      return;
    }
    setSaveState({ kind: "saved" });
    savedTimer.current = setTimeout(() => setSaveState({ kind: "idle" }), 2500);
  }

  /** Saves one group and makes what the server returned the new baseline */
  async function saveGroup(key: GroupKey, values: FieldValues) {
    switch (key) {
      case "celebrations": {
        const result = await updateSmsSettings(smsSettingsSchema.parse(values));
        forms.celebrations.reset(result);
        queryClient.setQueryData(QUERY_KEYS.celebrations, result);
        return;
      }
      case "applications": {
        const result = await updateNoticeSettings(
          noticeSettingsSchema.parse(values),
        );
        forms.applications.reset(result);
        queryClient.setQueryData(QUERY_KEYS.applications, result);
        return;
      }
      case "collections": {
        const result = await updateCollectionNoticeTemplates(
          collectionNoticeSettingsSchema.parse(values),
        );
        forms.collections.reset(result);
        queryClient.setQueryData(QUERY_KEYS.collections, result);
        return;
      }
    }
  }

  /** Opens the first section with an error and puts the cursor in it */
  function showFirstError() {
    for (const group of GROUPS) {
      const form = forms[group.key] as AnyForm;
      for (const item of group.items) {
        const field = item.fields.find(
          (name) => form.getFieldState(name).invalid,
        );
        if (field) {
          setSelected(item.section);
          // after the section is shown, or the field can't take focus
          requestAnimationFrame(() => form.setFocus(field));
          return;
        }
      }
    }
  }

  function discardAll() {
    for (const key of Object.keys(forms) as GroupKey[]) {
      (forms[key] as AnyForm).reset();
    }
    setSaveState({ kind: "idle" });
    setConfirmDiscard(false);
  }

  const sectionContent: Record<Section, ReactNode> = {
    "celebrations-sms": (
      <CelebrationFields form={forms.celebrations} dryRun={dryRun} />
    ),
    "applications-sms": (
      <TemplateChannelFields
        form={forms.applications}
        group={APPLICATION_NOTICES}
        channel="sms"
      />
    ),
    "applications-email": (
      <TemplateChannelFields
        form={forms.applications}
        group={APPLICATION_NOTICES}
        channel="email"
      />
    ),
    "collections-sms": (
      <TemplateChannelFields
        form={forms.collections}
        group={COLLECTION_NOTICES}
        channel="sms"
      />
    ),
    "collections-email": (
      <TemplateChannelFields
        form={forms.collections}
        group={COLLECTION_NOTICES}
        channel="email"
      />
    ),
  };

  const barVisible = hasChanges || saveState.kind !== "idle";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (hasChanges && saveState.kind !== "saving") void saveAll();
      }}
      noValidate
      className="grid gap-x-10 gap-y-6 pb-24 md:grid-cols-[13rem_minmax(0,1fr)]"
    >
      <nav aria-label="Bildirimler" className="flex flex-col gap-4">
        {GROUPS.map((group) => (
          <div key={group.key}>
            <div className="px-3 text-sm font-medium">{group.title}</div>
            <ul className="mt-1 ml-3 border-l">
              {group.items.map((item) => {
                const { dirty, invalid } = sectionState(group.key, item.fields);
                return (
                  <li key={item.section}>
                    <button
                      type="button"
                      aria-current={
                        selected === item.section ? "true" : undefined
                      }
                      onClick={() => setSelected(item.section)}
                      className={cn(
                        "-ml-px flex w-full items-center gap-2 rounded-r-md border-l-2 border-transparent py-1.5 pr-3 pl-4 text-left text-sm text-muted-foreground",
                        "hover:bg-muted/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                        "aria-[current=true]:border-primary aria-[current=true]:bg-muted/60 aria-[current=true]:font-medium aria-[current=true]:text-foreground",
                      )}
                    >
                      {item.label}
                      {invalid ? (
                        <StatusDot
                          className="bg-destructive"
                          label="Hatalı alan var"
                        />
                      ) : (
                        dirty && (
                          <StatusDot
                            className="bg-amber-500"
                            label="Kaydedilmemiş değişiklik var"
                          />
                        )
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="min-w-0">
        {/* every section stays mounted, so switching doesn't lose edits */}
        {GROUPS.flatMap((group) =>
          group.items.map((item) => (
            <section
              key={item.section}
              hidden={selected !== item.section}
              aria-label={`${group.title}: ${item.label}`}
            >
              <div className="mb-4 max-w-3xl">
                <h2 className="font-medium">
                  {group.title}
                  <span className="text-muted-foreground"> · {item.label}</span>
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {group.description}
                </p>
              </div>
              {sectionContent[item.section]}
            </section>
          )),
        )}
      </div>

      {barVisible && (
        <section
          aria-label="Kaydedilmemiş değişiklikler"
          className="fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 shadow-lg animate-in fade-in-0 slide-in-from-bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6"
        >
          <div aria-live="polite" className="mr-auto text-sm">
            {saveState.kind === "saved" && !hasChanges ? (
              <span className="flex items-center gap-1.5 text-primary">
                <CircleCheck className="size-4" />
                Değişiklikler kaydedildi
              </span>
            ) : saveState.kind === "failed" ? (
              <span className="text-destructive">
                Kaydedilemedi. {saveState.message}
              </span>
            ) : (
              "Kaydedilmemiş değişiklikler var"
            )}
          </div>
          {hasChanges && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saveState.kind === "saving"}
                onClick={() => setConfirmDiscard(true)}
              >
                İptal
              </Button>
              <Button type="submit" disabled={saveState.kind === "saving"}>
                {saveState.kind === "saving"
                  ? "Kaydediliyor…"
                  : "Değişiklikleri Kaydet"}
              </Button>
            </div>
          )}
        </section>
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Değişiklikler iptal edilsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bildirimlerde kaydetmediğiniz bütün değişiklikler silinir ve
              ayarlar kayıtlı haline döner. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discardAll}>
              Değişiklikleri Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

/** The three forms differ only in field types; this is what saving needs */
type AnyForm = UseFormReturn<FieldValues>;

/** The form's parsed values, or null after showing its errors */
async function validatedValues(form: AnyForm): Promise<FieldValues | null> {
  let values: FieldValues | null = null;
  await form.handleSubmit(
    (parsed) => {
      values = parsed;
    },
    () => {},
  )();
  return values;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "Bilinmeyen hata";
}

function StatusDot({ className, label }: { className: string; label: string }) {
  return (
    <span
      className={cn("size-2 rounded-full", className)}
      title={label}
      role="img"
      aria-label={label}
    />
  );
}
