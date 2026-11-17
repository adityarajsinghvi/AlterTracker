import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Alteration Tracker", template: "%s · Alteration Tracker" },
  description: "Singhvi Readymades alteration tracking",
  applicationName: "Alteration Tracker",
  appleWebApp: { capable: true, title: "Alterations", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f5c4d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-dvh">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
