"use client";

import type { ColumnVisibilityState } from "@tanstack/react-table";
import { type ReactNode, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationsTab } from "./notifications-tab";
import { ParameterList } from "./parameter-list";
import { Sectors } from "./sectors";
import { parseSettingsTab, type SettingsTab } from "./tabs";

export function Settings({
  initialTab,
  savedSectorColumnVisibility,
}: {
  initialTab: SettingsTab;
  savedSectorColumnVisibility: ColumnVisibilityState;
}) {
  const [tab, setTab] = useState(initialTab);

  function showTab(value: unknown) {
    const next = parseSettingsTab(value);
    setTab(next);
    // so a reload or a shared link opens the same tab
    const url = new URL(window.location.href);
    if (next === "parameters") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    history.replaceState(history.state, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={showTab} className="flex flex-col gap-3">
      <TabsList>
        <TabsTrigger value="parameters">Parametreler</TabsTrigger>
        <TabsTrigger value="notifications">Bildirimler</TabsTrigger>
      </TabsList>
      {/* kept mounted so unsaved template edits survive a tab switch */}
      <TabsContent value="notifications" keepMounted className="max-w-6xl pt-3">
        <NotificationsTab onReveal={() => showTab("notifications")} />
      </TabsContent>
      <TabsContent
        value="parameters"
        className="flex max-w-6xl flex-col divide-y"
      >
        <SettingsGroup
          title="Sektörler"
          description="Üyelerin sektörü bu listeden seçilir."
        >
          <Sectors savedColumnVisibility={savedSectorColumnVisibility} />
        </SettingsGroup>

        <SettingsGroup
          title="Tahsilat"
          description="Yetkililerden alınan ödemeler: ne için alındığı ve nasıl."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ParameterList kind="collection_category" title="Tür" />
            <ParameterList kind="collection_method" title="Tip" />
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="Ödeme"
          description="Derneğin yaptığı ödemeler: ne için yapıldığı ve nasıl."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ParameterList kind="payment_category" title="Tür" />
            <ParameterList kind="payment_method" title="Tip" />
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="Dernek Görevleri"
          description="Derneğin görev listesi."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ParameterList kind="association_role" title="Görev" />
          </div>
        </SettingsGroup>
      </TabsContent>
    </Tabs>
  );
}

/** A title and explanation on the left, the lists on the right */
function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-3 py-6 first:pt-3 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
