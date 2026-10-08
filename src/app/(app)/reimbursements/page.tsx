import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getMisRendicionesFiltrables } from '@/actions/expenses'
import { cargarOpcionesFiltro } from '@/lib/opciones-filtro'
import { fechaEnChile } from '@/lib/filtro-documentos'
import { leerFiltro, paramsDePagina } from '@/lib/filtro-url'
import { MisRendiciones } from './MisRendiciones'

export default async function ReimbursementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [documentos, params] = await Promise.all([getMisRendicionesFiltrables(), searchParams])
  const opciones = await cargarOpcionesFiltro(await createClient(), documentos)

  return (
    <MisRendiciones
      documentos={documentos}
      opciones={opciones}
      filtroInicial={leerFiltro(paramsDePagina(params))}
      hoy={fechaEnChile()}
    />
  )
}
