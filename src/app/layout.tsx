import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/layout/header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OpenGet - Reward Open Source Contributors",
  description:
    "List your repo, donate to the pool, and reward open-source contributors based on their code quality.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
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
