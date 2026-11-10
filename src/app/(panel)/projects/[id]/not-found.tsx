import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-10 text-center">
      <p className="font-medium">Proje bulunamadı</p>
      <p className="text-sm text-muted-foreground">
        Bu proje silinmiş ya da bağlantı hatalı olabilir.
      </p>
      <Link
        href="/projects"
        className={buttonVariants({ variant: "outline", className: "mt-4" })}
      >
        Projelere dön
      </Link>
    </div>
  );
}
