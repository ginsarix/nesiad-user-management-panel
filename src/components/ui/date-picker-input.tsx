"use client";

import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { tr } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDisplayDate, parseDisplayDate } from "@/lib/dates";

// Earliest year offered in the calendar's year dropdown
const START_MONTH = new Date(1900, 0);
// Latest month offered when future days can be picked
const END_MONTH = new Date(new Date().getFullYear() + 10, 11);

/**
 * Date input typed as gg.aa.yyyy, with a calendar as an alternative. The value
 * is the text as typed; the form validates it (see optionalDisplayDateSchema).
 * Future days can't be picked unless `allowFuture`.
 */
export function DatePickerInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder = "gg.aa.yyyy",
  "aria-invalid": ariaInvalid,
  allowFuture = false,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  "aria-invalid"?: boolean;
  allowFuture?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = parseDisplayDate(value) ?? undefined;
  const [month, setMonth] = useState<Date | undefined>(date);
  const today = new Date();

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        inputMode="numeric"
        maxLength={10}
        autoComplete="off"
        aria-invalid={ariaInvalid}
        onBlur={onBlur}
        onChange={(e) => {
          const value = e.target.value;
          onChange(value);
          const date = parseDisplayDate(value);
          if (date) setMonth(date);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <InputGroupButton
                variant="ghost"
                size="icon-xs"
                aria-label="Takvimden seç"
              >
                <CalendarIcon />
              </InputGroupButton>
            }
          />
          <PopoverContent
            className="w-auto overflow-hidden p-0"
            align="end"
            alignOffset={-8}
            sideOffset={10}
          >
            <Calendar
              mode="single"
              locale={tr}
              captionLayout="dropdown"
              startMonth={START_MONTH}
              endMonth={allowFuture ? END_MONTH : today}
              disabled={allowFuture ? undefined : { after: today }}
              selected={date}
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => {
                if (date) onChange(formatDisplayDate(date));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}
