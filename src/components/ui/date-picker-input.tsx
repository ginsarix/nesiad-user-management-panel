"use client";

import { isValid, parse as parseDate } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
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

const DATE_FORMAT = "dd.MM.yyyy";

function formatDate(date: Date | undefined) {
  if (!date) {
    return "";
  }

  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Free-text value; only a full dd.MM.yyyy date is picked up by the calendar */
function parseValue(value: string) {
  const date = parseDate(value, DATE_FORMAT, new Date());
  return isValid(date) ? date : undefined;
}

/**
 * Text input with an optional calendar. The value stays free text (e.g.
 * "Mart 2014"); picking a day fills it in as dd.MM.yyyy.
 */
export function DatePickerInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder = "Ocak 01, 2025",
  "aria-invalid": ariaInvalid,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = parseValue(value);
  const [month, setMonth] = useState<Date | undefined>(date);

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={ariaInvalid}
        onBlur={onBlur}
        onChange={(e) => {
          const value = e.target.value;
          onChange(value);
          const date = parseValue(value);
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
                aria-label="Tarih seçiniz"
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
              selected={date}
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => {
                onChange(formatDate(date));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}
