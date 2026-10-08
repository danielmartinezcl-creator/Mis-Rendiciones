// Los nombres de lo que aparece en los chips, desde los ids que traen los
// documentos. Recibe el cliente de QUIEN CONSULTA: lo que su RLS no le deja
// ver, no aparece como opción. No es una acción del servidor a propósito: la
// llaman las páginas, no el navegador.

import type { createClient } from '@/lib/supabase/server'
import type { DocumentoFiltrable, OpcionesFiltro } from '@/lib/filtro-documentos'

type Cliente = Awaited<ReturnType<typeof createClient>>

export async function cargarOpcionesFiltro(supabase: Cliente, docs: DocumentoFiltrable[]): Promise<OpcionesFiltro> {
  const idsProyecto = [...new Set(docs.map(d => d.proyectoId).filter((id): id is string => !!id))]
  const idsCategoria = [...new Set(docs.flatMap(d => d.gastos.map(g => g.categoriaId)).filter((id): id is string => !!id))]

  const [{ data: proyectos }, { data: categorias }] = await Promise.all([
    idsProyecto.length
      ? supabase.from('proyectos').select('id, numero, nombre').in('id', idsProyecto).order('numero')
      : Promise.resolve({ data: [] as OpcionesFiltro['proyectos'] }),
    idsCategoria.length
      ? supabase.from('expense_categories').select('id, name').in('id', idsCategoria).order('name')
      : Promise.resolve({ data: [] as OpcionesFiltro['categorias'] }),
  ])

  return { proyectos: proyectos ?? [], categorias: categorias ?? [] }
}
