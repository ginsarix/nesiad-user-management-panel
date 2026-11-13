"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { amountToInput, parseAmountInput } from "@/lib/money";

/**
 * A TL amount typed the Turkish way ("1.250,50"). Keeps what is typed and
 * tidies it to "1.250,50" on blur when it parses.
 */
export function AmountInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  "aria-invalid": ariaInvalid,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  "aria-invalid"?: boolean;
}) {
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        className="text-right tabular-nums"
        value={value}
        aria-invalid={ariaInvalid}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          // only a real change: passing through a field changes nothing
          const amount = parseAmountInput(value);
          const tidied = amount === null ? value : amountToInput(amount);
          if (tidied !== value) onChange(tidied);
          onBlur?.();
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>₺</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
