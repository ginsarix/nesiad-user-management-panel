"use client";

import type { ColumnVisibilityState } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ParameterList } from "./parameter-list";
import { Sectors } from "./sectors";

export function Settings({
  savedSectorColumnVisibility,
}: {
  savedSectorColumnVisibility: ColumnVisibilityState;
}) {
  return (
    <Tabs defaultValue="parameters" className="flex flex-col gap-3">
      <TabsList>
        <TabsTrigger value="parameters">Parametreler</TabsTrigger>
      </TabsList>
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
          description="Üyelerden alınan ödemeler: ne için alındığı ve nasıl."
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
