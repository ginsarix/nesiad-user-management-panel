"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { InferRequestType } from "hono";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getMembers } from "@/lib/fetches/member";
import { getQueryClient } from "@/lib/query-client";
import { rpcClient } from "@/lib/rpc-client";

export function Members() {
  const { data: membersData } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  const { mutate } = useMutation({
    mutationKey: ["members"],
    mutationFn: async (
      form: Omit<
        InferRequestType<typeof rpcClient.api.members.$post>["form"],
        "title"
      > & { title: string },
    ) => {
      const res = await rpcClient.api.members.$post({
        form,
      });

      if (!res.ok) {
        console.error("Error occured while creating member", await res.json());
        return;
      }

      return await res.json();
    },
    onSuccess: async () => {
      await getQueryClient().invalidateQueries({ queryKey: ["members"] });
    },
  });

  return (
    <div className="flex justify-center">
      {membersData?.map((m) => (
        <span key={m.id}>{m.title}</span>
      ))}

      <div className="w-3/6">
        <FieldSet>
          <FieldLegend>Üye</FieldLegend>
          <FieldDescription>Üye Ekleme Formu.</FieldDescription>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Ünvan</FieldLabel>
              <Input id="name" autoComplete="off" placeholder="Ünvan" />
            </Field>
            <Field>
              <DatePickerInput fieldLabelText="Üye Giriş Tarihi" />
            </Field>
            <Field>
              <FieldLabel htmlFor="address">Adres</FieldLabel>
              <Input id="address" autoComplete="off" placeholder="Adres" />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Telefon No</FieldLabel>
              <Input id="phone" autoComplete="off" placeholder="Telefon No" />
            </Field>
            <Field>
              <FieldLabel htmlFor="sector">Sektör</FieldLabel>
              <Input id="sector" autoComplete="off" placeholder="Sektör" />
            </Field>
            <Field>
              <DatePickerInput fieldLabelText="Kuruluş Tarihi" />
            </Field>
            <Field>
              <DatePickerInput fieldLabelText="Kıdem Tarihi" />
            </Field>
          </FieldGroup>
        </FieldSet>

        <div className="mt-3 flex flex-row-reverse">
          <Button
            onClick={() =>
              mutate({ title: `Merhaba ${Math.floor(Math.random() * 10)}` })
            }
            type="button"
          >
            Oluştur
          </Button>
        </div>
      </div>
    </div>
  );
}
