import type { Metadata } from "next";
import Link from "next/link";
import { OAuthCallbackHandler } from "@/components/auth/oauth-callback-handler";
import { Header } from "@/components/layout/header";
import { fontMono, fontSans } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenGet — Human Verification for Open Source",
  description:
    "7-factor Kinetic tier scores, verified profiles, SVG badges, and supply-chain–oriented risk signals for the AI-code era.",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body className="min-h-dvh flex flex-col og-mesh">
        <div className="og-grid pointer-events-none fixed inset-0 -z-10" aria-hidden />
        <OAuthCallbackHandler />
        <Header />
        <main className="flex-1 min-h-[50vh]">{children}</main>
        <footer className="border-t border-border/40 bg-card/20 backdrop-blur-sm mt-auto">
          <div className="container flex flex-col gap-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="font-display">
              <span className="font-semibold text-foreground">OpenGet</span>
              <span className="text-muted-foreground"> — human verification for critical dependencies</span>
            </div>
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Legal and status">
              <Link href="/legal/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <a href="/api/health" className="font-mono text-xs text-primary/90 hover:text-primary transition-colors">
                /api/health
              </a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
