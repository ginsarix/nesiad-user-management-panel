"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generatePassword } from "@/lib/password";

/**
 * A visible password input (it's read off the screen and texted) with
 * "new password" and "copy" buttons.
 */
export function PasswordField({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className="flex gap-1">
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        className="font-mono"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Yeni şifre üret"
        title="Yeni şifre üret"
        onClick={() => onChange(generatePassword())}
      >
        <RefreshCw />
      </Button>
      <CopyButton text={value} />
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={copied ? "Kopyalandı" : "Kopyala"}
      title={copied ? "Kopyalandı" : "Kopyala"}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
