"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoSms } from "./auto-sms";
import { CollectionNoticeSettings } from "./collection-notice-settings";
import { ManualSms } from "./manual-sms";
import { NoticeSettings } from "./notice-settings";
import { SmsSettings } from "./sms-settings";

export function Sms() {
  return (
    <Tabs defaultValue="manual" className="flex max-w-5xl flex-col gap-3">
      <TabsList>
        <TabsTrigger value="manual">Manuel</TabsTrigger>
        <TabsTrigger value="auto">Otomatik</TabsTrigger>
        <TabsTrigger value="settings">Ayarlar</TabsTrigger>
      </TabsList>
      <TabsContent value="manual">
        <ManualSms />
      </TabsContent>
      <TabsContent value="auto">
        <AutoSms />
      </TabsContent>
      <TabsContent value="settings" className="flex flex-col gap-6">
        <SmsSettings />
        <NoticeSettings />
        <CollectionNoticeSettings />
      </TabsContent>
    </Tabs>
  );
}
