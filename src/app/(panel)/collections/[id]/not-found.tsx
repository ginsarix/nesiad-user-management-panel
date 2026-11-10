import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function CollectionNotFound() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-10 text-center">
      <p className="font-medium">Tahsilat bulunamadı</p>
      <p className="text-sm text-muted-foreground">
        Bu tahsilat silinmiş ya da bağlantı hatalı olabilir.
      </p>
      <Link
        href="/collections"
        className={buttonVariants({ variant: "outline", className: "mt-4" })}
      >
        Tahsilatlara dön
      </Link>
    </div>
  );
}
