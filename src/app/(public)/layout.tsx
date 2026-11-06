import Image from "next/image";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center gap-6 border-t-4 border-sidebar px-4 py-8">
      <Image
        src="/nesiad-logo.png"
        alt="NESİAD"
        width={220}
        height={67}
        preload
      />
      <main className="w-full max-w-2xl">{children}</main>
      <p className="text-center text-xs text-muted-foreground">
        Nevşehir Sanayici ve İş İnsanları Derneği · 0 (384) 212 36 50 ·
        nesiad@nesiad.org.tr
      </p>
    </div>
  );
}
