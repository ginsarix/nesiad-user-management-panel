import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { CollectionNoticeSettings } from "./collection-notice-settings";
import { NoticeSettings } from "./notice-settings";
import { SmsSettings } from "./sms-settings";

type Section =
  | "celebrations-sms"
  | "applications-sms"
  | "applications-email"
  | "collections-sms"
  | "collections-email";

type Group = {
  title: string;
  description: string;
  items: { section: Section; label: string }[];
};

const GROUPS: Group[] = [
  {
    title: "Kutlama Bildirimleri",
    description:
      "Her gün seçilen saatten sonra (Türkiye saati) o gün kuruluş yıl dönümü olan aktif üyelere ve doğum günü olan yetkililere birer SMS gider. Sunucu o saatte kapalıysa aynı gün içinde telafi edilir; ertesi güne kalmaz. Kimseye aynı gün ikinci kez gönderilmez.",
    items: [{ section: "celebrations-sms", label: "SMS" }],
  },
  {
    title: "Başvuru Bildirimleri",
    description:
      "Üyelik formundan bir başvuru gelince, başvuru kabul edilince ya da reddedilince başvurana hem SMS hem e-posta gider. Otomatik kutlama SMS'lerinin açık ya da kapalı olması bunları etkilemez.",
    items: [
      { section: "applications-sms", label: "SMS" },
      { section: "applications-email", label: "E-posta" },
    ],
  },
  {
    title: "Tahsilat Bildirimleri",
    description:
      "Yeni bir tahsilat kaydedilince üyeye ve tahsilatı kaydeden dışındaki bütün aktif panel kullanıcılarına hem SMS hem e-posta gider. Üyenin SMS'i Telefon numarasına gider. Tahsilat düzenlenince veya silinince bildirim gönderilmez.",
    items: [
      { section: "collections-sms", label: "SMS" },
      { section: "collections-email", label: "E-posta" },
    ],
  },
];

/** The Ayarlar page's Bildirimler tab: a side nav of groups and their channels */
export function NotificationsTab() {
  const [selected, setSelected] = useState<Section>("celebrations-sms");
  const [dirty, setDirty] = useState<Partial<Record<Section, boolean>>>({});
  const markDirty = (section: Section) => (value: boolean) =>
    setDirty((current) =>
      !!current[section] === value ? current : { ...current, [section]: value },
    );

  const forms: Record<Section, ReactNode> = {
    "celebrations-sms": (
      <SmsSettings onDirtyChange={markDirty("celebrations-sms")} />
    ),
    "applications-sms": (
      <NoticeSettings
        channel="sms"
        onDirtyChange={markDirty("applications-sms")}
      />
    ),
    "applications-email": (
      <NoticeSettings
        channel="email"
        onDirtyChange={markDirty("applications-email")}
      />
    ),
    "collections-sms": (
      <CollectionNoticeSettings
        channel="sms"
        onDirtyChange={markDirty("collections-sms")}
      />
    ),
    "collections-email": (
      <CollectionNoticeSettings
        channel="email"
        onDirtyChange={markDirty("collections-email")}
      />
    ),
  };

  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Bildirimler" className="flex flex-col gap-4">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 text-sm font-medium">{group.title}</div>
            <ul className="mt-1 ml-3 border-l">
              {group.items.map((item) => (
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
                    {dirty[item.section] && (
                      <span
                        className="size-2 rounded-full bg-amber-500"
                        title="Kaydedilmemiş değişiklik var"
                        role="img"
                        aria-label="Kaydedilmemiş değişiklik var"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="min-w-0">
        {/* every form stays mounted, so switching doesn't lose unsaved edits */}
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
              {forms[item.section]}
            </section>
          )),
        )}
      </div>
    </div>
  );
}
