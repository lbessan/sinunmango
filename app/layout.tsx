import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SWRegister } from "@/components/sw-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "sinunmango",
  description: "Tu gestor financiero personal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "sinunmango",
  },
  // `apple` lo maneja Next 16 automáticamente vía app/apple-icon.png (180×180
  // con fondo de marca). NO declararlo acá — duplica el link tag.
  icons: {
    icon: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d2137",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // viewport-fit=cover: en iOS standalone permite usar todo el ancho/alto
  // de la pantalla, incluyendo notch y home indicator. Las páginas deben
  // compensar con env(safe-area-inset-*) — ver globals.css.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SWRegister />
        {/* Vercel Analytics (visitas) + Speed Insights (Core Web Vitals).
            Solo trackean en producción (no en dev local). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
