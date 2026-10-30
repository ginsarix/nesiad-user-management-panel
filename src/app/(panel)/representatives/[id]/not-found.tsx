import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function RepresentativeNotFound() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-10 text-center">
      <p className="font-medium">Yetkili bulunamadı</p>
      <p className="text-sm text-muted-foreground">
        Bu yetkili silinmiş ya da bağlantı hatalı olabilir.
      </p>
      <Link
        href="/representatives"
        className={buttonVariants({ variant: "outline", className: "mt-4" })}
      >
        Yetkililere dön
      </Link>
    </div>
  );
}
