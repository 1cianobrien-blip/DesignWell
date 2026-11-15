import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Footer, Nav } from "@/components/ui";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["700"], variable: "--font-fraunces", display: "swap" });

const SITE_URL = process.env.SITE_URL ?? "https://designwell.co";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "DesignWell: design work happening inside companies", template: "%s · DesignWell" },
  description: "Discover great design work happening inside companies, the teams doing it, and the design roles open there.",
  openGraph: { siteName: "DesignWell", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
