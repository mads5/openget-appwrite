import { Outfit, JetBrains_Mono } from "next/font/google";

export const fontSans = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});
