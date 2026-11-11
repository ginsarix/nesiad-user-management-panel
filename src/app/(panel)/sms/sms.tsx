"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoSms } from "./auto-sms";
import { ManualSms } from "./manual-sms";

export function Sms() {
  return (
    <Tabs defaultValue="manual" className="flex max-w-5xl flex-col gap-3">
      <TabsList>
        <TabsTrigger value="manual">Manuel</TabsTrigger>
        <TabsTrigger value="auto">Otomatik</TabsTrigger>
      </TabsList>
      <TabsContent value="manual">
        <ManualSms />
      </TabsContent>
      <TabsContent value="auto">
        <AutoSms />
      </TabsContent>
    </Tabs>
  );
}
