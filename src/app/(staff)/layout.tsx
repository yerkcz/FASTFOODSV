import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

/**
 * Todas las pantallas operativas (POS, mesas, KDS, caja y admin) viven dentro
 * de este grupo. La sesión se valida en el servidor antes de renderizar
 * cualquier dato; las API vuelven a validarla por su cuenta.
 */
export default async function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) redirect('/login');
  return <>{children}</>;
}
