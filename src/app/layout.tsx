import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { baloo, caveman, inter } from "@/lib/fuentes";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"),
  title: "Radio Chiripa · Festival De Música y Arte",
  description:
    "La radio del Festival Chiripa: música alternativa y arte en una sola señal. 7 nov 2026 · Shekinah Beach Club, Mazatlán. Boletos Fase 1 en Passline.",
  applicationName: "Chiripa",
  icons: { icon: "/chiripa-logo.jpg", apple: "/chiripa-logo.jpg" },
  openGraph: {
    title: "Radio Chiripa · Festival De Música y Arte",
    description:
      "Música alternativa y arte en una sola señal. 7 nov 2026 · Shekinah Beach Club, Mazatlán.",
    siteName: "Chiripa",
    type: "website",
    images: ["/chiripa-logo.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Radio Chiripa · Festival De Música y Arte",
    description:
      "Música alternativa y arte en una sola señal. 7 nov 2026 · Shekinah Beach Club, Mazatlán.",
  },
};

export const viewport: Viewport = {
  themeColor: "#241510",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${baloo.variable} ${caveman.variable} ${inter.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
