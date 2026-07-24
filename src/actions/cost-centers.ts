'use server'

import { createClient } from '@/lib/supabase/server'
import type { CostCenter } from '@/lib/supabase/types'

// Cualquier usuario autenticado puede leer cost_centers (necesario para dropdowns)
export async function getCostCenters(): Promise<CostCenter[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('cost_centers')
    .select('*')
    .eq('activo', true)
    .order('descripcion')
  return data ?? []
}

export async function getImputableCostCenters(): Promise<CostCenter[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('cost_centers')
    .select('*')
    .eq('activo', true)
    .eq('imputable', true)
    .order('descripcion')
  return data ?? []
}
