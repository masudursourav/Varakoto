import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import { LanguageProvider } from "@/context/language-context";
import { ThemeProvider } from "@/context/theme-context";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { PwaRegister } from "@/components/pwa-register";
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
  applicationName: "ভাড়া কত",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ভাড়া কত",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1a4a8e" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * Inline script injected into <head> before any CSS or JS is parsed.
 *
 * Reading localStorage here — synchronously, before the first paint —
 * prevents the Flash of Unstyled Content (FOUC) where users who have
 * saved "dark" mode briefly see the light-mode background on load.
 *
 * We also restore the preferred language so that the <html lang="…">
 * attribute reflects the user's choice before hydration.
 */
const themeInitScript = `
(function () {
  try {
    var theme = localStorage.getItem('varakoto-theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
    var lang = localStorage.getItem('varakoto-lang');
    if (lang === 'en' || lang === 'bn') {
      document.documentElement.setAttribute('lang', lang);
    }
  } catch (e) {
    // localStorage may be unavailable (private browsing, SSR, etc.)
  }
})();
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        {/*
          FOUC prevention: apply saved theme + language before first paint.
          Must be a blocking (non-deferred) script so it runs synchronously
          before the browser renders any element.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
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

        {/* Register the PWA service worker after the page has mounted */}
        <PwaRegister />
      </body>
    </html>
  );
}
