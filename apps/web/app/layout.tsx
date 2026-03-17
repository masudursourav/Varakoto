import type { Metadata } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import { LanguageProvider } from "@/context/language-context";
import { ThemeProvider } from "@/context/theme-context";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  variable: "--font-bengali",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ভাড়া কত — Vara Koto | BRTA Fare Calculator",
  description:
    "BRTA অনুমোদিত বাস ভাড়া ক্যালকুলেটর। Calculate exact bus fares for Dhaka using official BRTA rates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${notoSansBengali.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <LanguageProvider>
            <Navbar />
            <div className="pb-20">{children}</div>
            <BottomNav />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
