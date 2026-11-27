"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ImageUp } from "lucide-react";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import {
  logoUrl,
  type MemberCompany,
  type MemberDetails,
  setMemberLogo,
} from "@/lib/fetches/member";
import { drawnLogoError, toLogoUpload } from "@/lib/logo-upload";
import { memberLogoFormSchema } from "@/lib/zod-schemas/member";
import { LogoDropZone } from "../_components/logo-drop-zone";

/** Every page that shows a company's logo */
export function invalidateLogoQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["members"] }),
    queryClient.invalidateQueries({ queryKey: ["companies"] }),
  ]);
}

export function ChangeLogoButton({
  member,
  company,
}: {
  member: MemberDetails;
  company: MemberCompany & { logo: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <ImageUp />
            Logo Değiştir
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Logo Değiştir</DialogTitle>
        </DialogHeader>
        {/* the content unmounts when closed, so each opening starts fresh */}
        <ChangeLogoForm
          member={member}
          company={company}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ChangeLogoForm({
  member,
  company,
  onSaved,
}: {
  member: MemberDetails;
  company: MemberCompany & { logo: string };
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(memberLogoFormSchema),
    defaultValues: { logo: null },
  });
  const logo = useController({ control: form.control, name: "logo" });

  const { mutate, isPending } = useMutation({
    mutationFn: async (file: File) =>
      setMemberLogo(member.id, await toLogoUpload(file)),
    onSuccess: async () => {
      await invalidateLogoQueries(queryClient);
      onSaved();
    },
    onError: (error) => form.setError("logo", { message: error.message }),
  });

  const pick = async (file: File | null) => {
    logo.field.onChange(file);
    if (!(await form.trigger("logo"))) return;
    // a PDF or SVG is drawn now, so one that can't be is reported before saving
    const message = await drawnLogoError(file);
    if (message && form.getValues("logo") === file) {
      form.setError("logo", { message });
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit(({ logo }) => {
        if (logo) mutate(logo);
      })}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field data-invalid={!!logo.fieldState.error}>
        <LogoDropZone
          id="new-logo"
          file={logo.field.value}
          currentUrl={logoUrl(company.logo)}
          onPick={pick}
          // back to the current logo
          onRemove={logo.field.value ? () => pick(null) : undefined}
        />
        <FieldError errors={[logo.fieldState.error]} />
      </Field>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          İptal
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </form>
  );
}
