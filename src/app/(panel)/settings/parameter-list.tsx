"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getParameters, type Parameter } from "@/lib/fetches/parameter";
import { PARAMETER_KIND_LABELS, type ParameterKind } from "@/lib/parameters";
import { DeleteParameterButton } from "./delete-parameter-button";
import { ParameterDialog } from "./parameter-dialog";

const emptyParameters: Parameter[] = [];

/**
 * One Parametreler list as a small card. `title` is short ("Tür") because
 * the group around it names the topic; buttons and dialogs use the full name.
 */
export function ParameterList({
  kind,
  title,
}: {
  kind: ParameterKind;
  title: string;
}) {
  const label = PARAMETER_KIND_LABELS[kind];
  // keeps the entry while the dialog animates closed
  const [dialog, setDialog] = useState<{
    open: boolean;
    parameter?: Parameter;
  }>({ open: false });

  // every list reads the same query; the API sorts entries by name
  const { data: parameters = emptyParameters, isError } = useQuery({
    queryKey: ["parameters"],
    queryFn: () => getParameters(),
  });
  const entries = parameters.filter((p) => p.kind === kind);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/50 py-1.5 pr-1.5 pl-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-sm text-muted-foreground">{entries.length}</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          aria-label={`${label} ekle`}
          onClick={() => setDialog({ open: true })}
        >
          <Plus />
          Ekle
        </Button>
      </div>

      {entries.length > 0 ? (
        <ul className="max-h-72 divide-y overflow-y-auto">
          {entries.map((parameter) => (
            <li
              key={parameter.id}
              className="flex items-center gap-2 py-1 pr-1.5 pl-3 text-sm"
            >
              <span className="min-w-0 flex-1 break-words">
                {parameter.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${label}: ${parameter.name} düzenle`}
                className="text-muted-foreground"
                onClick={() => setDialog({ open: true, parameter })}
              >
                <Pencil />
              </Button>
              <DeleteParameterButton parameter={parameter} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {isError ? "Yüklenirken bir hata oluştu." : "Henüz kayıt eklenmemiş."}
        </p>
      )}

      <ParameterDialog
        kind={kind}
        parameter={dialog.parameter}
        open={dialog.open}
        onOpenChange={(open) =>
          setDialog((previous) => ({ ...previous, open }))
        }
      />
    </div>
  );
}
