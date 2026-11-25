"use client";

import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultCarryPair } from "@/lib/cash-account-periods";
import { isoToDisplay } from "@/lib/dates";
import type { CashAccount } from "@/lib/fetches/cash-account";
import { CarryOverButton } from "./carry-over-button";

const NOTE =
  "Geçmiş yıla/döneme ait verilerinizi girdikten sonra dönemi devir ediniz, Devir için herhangi bir tarih kıstası yoktur, Önceki dönem bittikten sonra herhangi bir tarihte devir yapılabilir.";

/**
 * Devir: pick a source and a later destination period. Shown only with two
 * or more periods. The source list offers only periods before the
 * destination.
 */
export function CarryOverBox({ account }: { account: CashAccount }) {
  const { periods } = account;
  const currentIndex = periods.findIndex(
    (period) => period.id === account.currentPeriodId,
  );
  const initial = defaultCarryPair(periods, currentIndex);
  const [toId, setToId] = useState(initial?.toId ?? null);
  const [fromId, setFromId] = useState(initial?.fromId ?? null);

  const toIndex = periods.findIndex((period) => period.id === toId);
  const to = periods[toIndex];
  const sources = toIndex > 0 ? periods.slice(0, toIndex) : [];
  const from = sources.find((period) => period.id === fromId);
  const item = (period: (typeof periods)[number]) => ({
    value: String(period.id),
    label: isoToDisplay(period.startDate),
  });

  if (!initial) return null;

  return (
    <section className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2.5 text-sm font-medium">Devir</h3>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-40">
            <FieldLabel htmlFor="carry-from">Kaynak dönem</FieldLabel>
            <Select
              items={sources.map(item)}
              value={from ? String(from.id) : null}
              onValueChange={(value) => setFromId(Number(value))}
            >
              <SelectTrigger id="carry-from" className="w-full">
                <SelectValue placeholder="Seçin" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((period) => (
                  <SelectItem key={period.id} value={String(period.id)}>
                    {isoToDisplay(period.startDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <span className="pb-2 text-muted-foreground" aria-hidden>
            →
          </span>
          <Field className="w-40">
            <FieldLabel htmlFor="carry-to">Hedef dönem</FieldLabel>
            <Select
              items={periods.slice(1).map(item)}
              value={to ? String(to.id) : null}
              onValueChange={(value) => {
                const index = periods.findIndex(
                  (period) => period.id === Number(value),
                );
                setToId(Number(value));
                // a source no longer before the destination becomes the one just before it
                if (!periods.slice(0, index).some((p) => p.id === fromId)) {
                  setFromId(periods[index - 1]?.id ?? null);
                }
              }}
            >
              <SelectTrigger id="carry-to" className="w-full">
                <SelectValue placeholder="Seçin" />
              </SelectTrigger>
              <SelectContent>
                {periods.slice(1).map((period) => (
                  <SelectItem key={period.id} value={String(period.id)}>
                    {isoToDisplay(period.startDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {from && to && (
            <CarryOverButton accountId={account.id} from={from} to={to} />
          )}
        </div>
        <p className="text-sm text-muted-foreground">{NOTE}</p>
      </div>
    </section>
  );
}
