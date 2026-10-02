import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
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
  title: "easystem — POS",
  description: "Sistema POS y KDS — easystem",
  // Iconos declarados a mano: antes solo habia favicon.ico y NO habia
  // apple-touch-icon, asi que iOS tomaba un screenshot de la pagina como
  // icono de la pantalla de inicio.
  icons: {
    icon: "/logo.svg",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "easystem",
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
                  var t = localStorage.getItem('eas_theme');
                  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
                } catch(e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `
          }}
        />
        {/* PWA: "Add to Home Screen" con icono propio. Sin esto, appleWebApp
            de abajo no genera el icono y el POS abre en el navegador. */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#047857" />
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
      </body>
    </html>
  );
}
