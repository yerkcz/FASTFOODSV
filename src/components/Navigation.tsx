"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Navigation.module.css";

export default function Navigation() {
  const pathname = usePathname();

  // Only show on staff pages — hide on customer POS (/) and admin portal
  // KDS pages (cocina, bebidas) excluded — they need max screen density
  const staffPages = [
    "/inicio", "/mesas", "/entregados", "/nueva-comanda"
  ];
  
  if (!staffPages.includes(pathname || "")) {
    return null;
  }

  return (
    <>
      {/* Spacer so content isn't hidden behind the fixed navbar */}
      <div style={{ paddingBottom: '70px' }} />
      <nav className={styles.navbar}>
        <Link
          href="/nueva-comanda"
          className={`${styles.navItem} ${pathname === "/nueva-comanda" ? styles.active : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>COMANDA</span>
        </Link>

        <Link
          href="/inicio"
          className={`${styles.navItem} ${pathname === "/inicio" ? styles.active : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>INICIO</span>
        </Link>

        <Link 
          href="/mesas" 
          className={`${styles.navItem} ${pathname === "/mesas" ? styles.active : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h18v18H3z" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          <span>MESAS</span>
        </Link>
      </nav>
    </>
  );
}
