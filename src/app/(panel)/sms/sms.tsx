"use client";

import { Lock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManualSms } from "./manual-sms";

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
        <Locked text="Kilitli. Açmak için Level 4'ü tamamla (kimin kutlaması var?)." />
      </TabsContent>
      <TabsContent value="settings">
        <Locked text="Kilitli. Açmak için Level 4'ü tamamla (saat ve mesaj metni)." />
      </TabsContent>
    </Tabs>
  );
}

// TODO(level 4): remove with the last locked tab
function Locked({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border bg-card p-10 text-sm text-muted-foreground">
      <Lock className="size-4" />
      {text}
    </div>
  );
}
