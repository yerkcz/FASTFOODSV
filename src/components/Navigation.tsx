"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Navigation.module.css";

export default function Navigation() {
  const pathname = usePathname();

  // Ocultar la barra de navegación en el panel Admin y sus sub-rutas
  if (pathname === '/admin' || pathname?.startsWith('/admin/')) {
    return null;
  }

  return (
    <nav className={styles.navbar}>
      <Link 
        href="/nueva-comanda" 
        className={`${styles.navItem} ${pathname === "/nueva-comanda" ? styles.active : ""}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span>NUEVA COMANDA</span>
      </Link>

      <Link 
        href="/inicio" 
        className={`${styles.navItem} ${pathname === "/inicio" ? styles.active : ""}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>INICIO</span>
      </Link>

      <Link 
        href="/" 
        className={`${styles.navItem} ${pathname === "/" ? styles.active : ""}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        <span>MENÚ</span>
      </Link>
    </nav>
  );
}
