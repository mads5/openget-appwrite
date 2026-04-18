import type { Metadata } from "next";
import Link from "next/link";
import { OAuthCallbackHandler } from "@/components/auth/oauth-callback-handler";
import { Header } from "@/components/layout/header";
import "@fontsource-variable/inter/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenGet - Reward Open Source Contributors",
  description:
    "List your repo, sponsor the pool, and reward open-source contributors based on their code quality.",
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
    <html lang="en">
      <body className="font-sans antialiased">
        <OAuthCallbackHandler />
        <Header />
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
        <footer className="border-t border-border/50 py-8">
          <div className="container flex flex-col items-center gap-3 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
            <div>
              Open<span className="text-primary">Get</span> — Rewarding Open Source Contributors
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label="Legal">
              <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
                Terms of Service
              </Link>
              <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
                Privacy Policy
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
