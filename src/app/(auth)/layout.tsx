import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 border-t-4 border-sidebar px-4 py-10">
      <Image
        src="/nesiad-logo.png"
        alt="NESİAD"
        width={220}
        height={67}
        preload
      />
      <main className="w-full max-w-sm">{children}</main>
      <p className="text-center text-xs text-muted-foreground">
        Nevşehir Sanayici ve İş İnsanları Derneği · Üye Yönetim Paneli
      </p>
    </div>
  );
}
