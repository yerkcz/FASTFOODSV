import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import Navigation from "@/components/Navigation";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Fast Food San Vicente — POS",
  description: "Sistema POS de Fast Food San Vicente, Costa Rica",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fast Food San Vicente",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Dark mode initialization — runs before paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('ffsv_theme');
                  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
                } catch(e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `
          }}
        />
        {/* Roboto for all POS/Staff pages — loaded once globally */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={outfit.variable}>
        <div style={{ paddingTop: '0px' }}>
          {children}
        </div>
        <Navigation />
      </body>
    </html>
  );
}
