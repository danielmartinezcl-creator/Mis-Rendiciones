import { redirect } from 'next/navigation'
import { getAuthProfile } from '@/lib/auth'

/* Gasto rápido está oculto para empleados hasta que sirva también para
   rendiciones (hoy solo registra en caja chica). Esconderlo del menú no
   alcanza: la ruta se puede escribir a mano o venir de un marcador. */
export default async function QuickLayout({ children }: { children: React.ReactNode }) {
  const profile = await getAuthProfile()
  if (profile?.role !== 'admin') redirect('/')
  return children
}
