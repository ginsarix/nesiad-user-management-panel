import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function CounterpartyNotFound() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-10 text-center">
      <p className="font-medium">Cari bulunamadı</p>
      <p className="text-sm text-muted-foreground">
        Bu cari silinmiş ya da bağlantı hatalı olabilir.
      </p>
      <Link
        href="/counterparties"
        className={buttonVariants({ variant: "outline", className: "mt-4" })}
      >
        Carilere dön
      </Link>
    </div>
  );
}
