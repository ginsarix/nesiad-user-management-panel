import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";

const roboto = Roboto({
  variable: "--font-sans",
  // latin-ext covers Turkish characters (ş, ğ, ı, İ)
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "DERNEK Üye Yönetim Paneli",
  description: "Nesiad dernek üye yönetim paneli",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={cn("h-full", "antialiased", "font-sans", roboto.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
