import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat_Brush, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const body = Plus_Jakarta_Sans({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const hand = Caveat_Brush({ variable: "--font-hand", subsets: ["latin"], weight: "400", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Safiri Nasi Tour & Travel | Kenya safaris, beach holidays & trips abroad",
    template: "%s | Safiri Nasi Tour & Travel",
  },
  description:
    "Book Maasai Mara safaris, Diani beach holidays, weekend getaways and international trips with Safiri Nasi. Pay securely with M-Pesa, Airtel Money or card.",
  applicationName: "Safiri Nasi",
  openGraph: {
    type: "website",
    siteName: "Safiri Nasi Tour & Travel",
    images: [{ url: "/brand/logo.png", width: 465, height: 381, alt: "Safiri Nasi Tour & Travel" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0f160e" },
  ],
};

// Applied before paint so dark mode never flashes.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('sn_theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Extensions such as Grammarly add attributes to <body> before hydration. */}
      <body className="flex min-h-dvh flex-col antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
