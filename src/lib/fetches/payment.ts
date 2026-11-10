import type { ClientRequestOptions } from "hono/client";
import { displayToIso } from "../dates";
import { parseAmountInput } from "../money";
import {
  type PaymentFilters,
  paymentFiltersToParams,
} from "../payment-filters";
import { rpcClient } from "../rpc-client";
import type { PaymentFormValues } from "../zod-schemas/payment";
import { throwResponseError } from "./errors";

/** The filtered payments, newest first, with their count and total */
export async function getPayments(
  filters: PaymentFilters,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api.payments.$get(
    { query: paymentFiltersToParams(filters) },
    options,
  );

  if (!res.ok) throw new Error("An error occured while getting payments");

  return await res.json();
}

/** Resolves to null when the payment does not exist */
export async function getPayment(id: number, options?: ClientRequestOptions) {
  const res = await rpcClient.api.payments[":id"].$get(
    { param: { id: String(id) } },
    options,
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("An error occured while getting the payment");

  return await res.json();
}

/** The form's Turkish amount and gg.aa.yyyy date in the API's forms */
function toPaymentJson({
  counterpartyId,
  categoryId,
  methodId,
  amount,
  date,
  note,
}: PaymentFormValues) {
  return {
    // the form schema guarantees these are picked and the amount parses
    counterpartyId: counterpartyId as number,
    categoryId: categoryId as number,
    methodId: methodId as number,
    amount: parseAmountInput(amount) ?? "",
    date: displayToIso(date),
    note,
  };
}

export async function createPayment(values: PaymentFormValues) {
  const res = await rpcClient.api.payments.$post({
    json: toPaymentJson(values),
  });

  if (!res.ok) await throwResponseError(res, "Ödeme kaydedilemedi");

  return ((await res.json()) as { id: number }).id;
}

export async function updatePayment(id: number, values: PaymentFormValues) {
  const res = await rpcClient.api.payments[":id"].$patch({
    param: { id: String(id) },
    json: toPaymentJson(values),
  });

  if (!res.ok) await throwResponseError(res, "Ödeme güncellenemedi");
}

export async function deletePayment(id: number) {
  const res = await rpcClient.api.payments[":id"].$delete({
    param: { id: String(id) },
  });

  if (!res.ok) await throwResponseError(res, "Ödeme silinemedi");
}

export type PaymentList = Awaited<ReturnType<typeof getPayments>>;
export type PaymentRow = PaymentList["payments"][number];
export type Payment = NonNullable<Awaited<ReturnType<typeof getPayment>>>;
