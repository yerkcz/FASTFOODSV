import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Navigation from "@/components/Navigation";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Hideaway — Menu Digital",
  description: "Ordena desde tu mesa en Restaurante Hideaway, Costa Rica",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hideaway Menu",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {/* Roboto for all POS/Staff pages — loaded once globally */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={inter.className}>
        <div style={{ paddingBottom: '70px' /* Spacer for mobile navbar */, paddingTop: '0px' }}>
          {children}
        </div>
        <Navigation />
      </body>
    </html>
  );
}
