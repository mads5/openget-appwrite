import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import "@fontsource-variable/inter/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenGet - Reward Open Source Contributors",
  description:
    "List your repo, donate to the pool, and reward open-source contributors based on their code quality.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Header />
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
        <footer className="border-t border-border/50 py-8">
          <div className="container text-center text-sm text-muted-foreground">
            Open<span className="text-primary">Get</span> — Rewarding Open Source Contributors
          </div>
        </footer>
      </body>
    </html>
  );
}
