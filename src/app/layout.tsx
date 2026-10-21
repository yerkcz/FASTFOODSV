import type { Metadata, Viewport } from "next";
import { Outfit, Roboto } from "next/font/google";
import Navigation from "@/components/Navigation";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
  variable: "--font-roboto",
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
        {/* Tema oscuro permanente — se aplica antes del primer paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.documentElement.setAttribute('data-theme', 'dark');
            `
          }}
        />
        {/* PWA: "Add to Home Screen" con icono propio. Sin esto, appleWebApp
            de abajo no genera el icono y el POS abre en el navegador. */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#047857" />
      </head>
      <body className={`${outfit.variable} ${roboto.variable}`}>
        <div style={{ paddingTop: '0px' }}>
          {children}
        </div>
        <Navigation />
      </body>
    </html>
  );
}
