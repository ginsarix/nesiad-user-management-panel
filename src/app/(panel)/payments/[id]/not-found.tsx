import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function PaymentNotFound() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-10 text-center">
      <p className="font-medium">Ödeme bulunamadı</p>
      <p className="text-sm text-muted-foreground">
        Bu ödeme silinmiş ya da bağlantı hatalı olabilir.
      </p>
      <Link
        href="/payments"
        className={buttonVariants({ variant: "outline", className: "mt-4" })}
      >
        Ödemelere dön
      </Link>
    </div>
  );
}
