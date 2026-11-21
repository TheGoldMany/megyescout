import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

// Barlow: the grotesque of road and stadium signage; the condensed cut carries headings and scoreboard numbers.
const barlow = Barlow({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-barlow" });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow-condensed",
});

export const metadata: Metadata = {
  title: { default: "Megyescout – piaci értékek, klubok, átigazolások", template: "%s · Megyescout" },
  description: "Becsült piaci értékek, keretek, tabellák és átigazolások az NB III-tól a megyei osztályokig.",
};

export const viewport: Viewport = { themeColor: "#D6D8D1", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <TooltipProvider>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
