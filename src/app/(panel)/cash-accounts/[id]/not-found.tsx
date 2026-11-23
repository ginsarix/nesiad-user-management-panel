import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function CashAccountNotFound() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-10 text-center">
      <p className="font-medium">Kasa - Banka bulunamadı</p>
      <p className="text-sm text-muted-foreground">
        Bu hesap silinmiş ya da bağlantı hatalı olabilir.
      </p>
      <Link
        href="/cash-accounts"
        className={buttonVariants({ variant: "outline", className: "mt-4" })}
      >
        Kasa - Banka listesine dön
      </Link>
    </div>
  );
}
