'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Tipos ────────────────────────────────────────────────────

interface CreateOrgInput {
  name:      string   // nombre de la empresa
  slug:      string   // identificador URL-safe (ej: "acme-corp")
  adminName: string   // nombre completo del admin inicial
  adminEmail: string  // email del admin inicial
  country?:  string   // default 'CL'
  currency?: string   // default 'CLP'
}

interface CreateOrgResult {
  orgId:   string
  userId:  string
  inviteLink: string  // link para que el admin establezca su contraseña
}

// ── Helper: seed de centros de costo de PENTA (reutilizable) ─

const PENTA_COST_CENTERS = [
  { id: 'EMP',          descripcion: 'EMPRESA',                   imputable: false },
  { id: 'EMPGES',       descripcion: 'AREAS DE GESTION',          imputable: false },
  { id: 'EMPGESCOM',    descripcion: 'COMERCIAL',                 imputable: false },
  { id: 'EMPGESCOMGCO', descripcion: 'GERENCIA COMERCIAL',        imputable: true  },
  { id: 'EMPGESCOMLIC', descripcion: 'LICITACIONES',              imputable: true  },
  { id: 'EMPGESCOMNEG', descripcion: 'NEGOCIOS',                  imputable: true  },
  { id: 'EMPGESFIN',    descripcion: 'FINANZAS',                  imputable: false },
  { id: 'EMPGESFINADM', descripcion: 'ADMINISTRACION',            imputable: true  },
  { id: 'EMPGESFINGER', descripcion: 'GERENCIA FINANZAS',         imputable: true  },
  { id: 'EMPGESFINRHH', descripcion: 'RRHH',                      imputable: true  },
  { id: 'EMPGESGEG',    descripcion: 'GERENCIA GENERAL',          imputable: false },
  { id: 'EMPGESGEGGEG', descripcion: 'GERENCIA GENERAL',          imputable: true  },
  { id: 'EMPGESING',    descripcion: 'INGENIERIA',                imputable: false },
  { id: 'EMPGESINGCEI', descripcion: 'CONTROL E INSTRUMENTACION', imputable: true  },
  { id: 'EMPGESINGELE', descripcion: 'ELECTRICIDAD',              imputable: true  },
  { id: 'EMPGESINGGIN', descripcion: 'GERENCIA INGENIERIA',       imputable: true  },
  { id: 'EMPGESINGING', descripcion: 'INGENIERIA',                imputable: true  },
  { id: 'EMPGESINGPRO', descripcion: 'PROYECTISTAS',              imputable: true  },
  { id: 'EMPGESOPE',    descripcion: 'OPERACIONES',               imputable: false },
  { id: 'EMPGESOPECDO', descripcion: 'CONTROL DOCUMENTAL',        imputable: true  },
  { id: 'EMPGESOPECYS', descripcion: 'CALIDAD Y SEGURIDAD',       imputable: true  },
  { id: 'EMPGESOPEGEO', descripcion: 'GERENCIA OPERACIONES',      imputable: true  },
  { id: 'EMPGESOPEOPE', descripcion: 'OPERACIONES',               imputable: true  },
  { id: 'EMPGESOPESUB', descripcion: 'SUBCONTRATOS',              imputable: true  },
  { id: 'EMPGESVAR',    descripcion: 'VARIOS',                    imputable: false },
  { id: 'EMPGESVAROTR', descripcion: 'OTROS',                     imputable: true  },
  { id: 'EMPNEG',       descripcion: 'AREAS DE NEGOCIOS',         imputable: false },
  { id: 'EMPNEGPRA',    descripcion: 'PROYECTOS ANTIGUOS',        imputable: false },
  { id: 'EMPNEGPRAASS', descripcion: 'PROYECTOS ASS',             imputable: true  },
  { id: 'EMPNEGPRACMP', descripcion: 'PROYECTOS CMP',             imputable: true  },
  { id: 'EMPNEGPRAKEY', descripcion: 'PROYECTOS KEYPRO',          imputable: true  },
  { id: 'EMPNEGPRAKPP', descripcion: 'PROYECTOS KPP',             imputable: true  },
  { id: 'EMPNEGPRAMEL', descripcion: 'PROYECTOS MEL',             imputable: true  },
  { id: 'EMPNEGPRAOTR', descripcion: 'PROYECTOS OTROS',           imputable: true  },
  { id: 'EMPNEGPRAPRD', descripcion: 'PROYECTOS PRDW',            imputable: true  },
  { id: 'EMPNEGPRASPE', descripcion: 'PROYECTOS SPENCE',          imputable: true  },
  { id: 'EMPNEGPRN',    descripcion: 'PROYECTOS NUEVOS',          imputable: false },
  { id: 'EMPNEGPRNASS', descripcion: 'PROYECTOS N ASS',           imputable: true  },
  { id: 'EMPNEGPRNCMP', descripcion: 'PROYECTOS N CMP',           imputable: true  },
  { id: 'EMPNEGPRNKEY', descripcion: 'PROYECTOS N KEYPRO',        imputable: true  },
  { id: 'EMPNEGPRNKPP', descripcion: 'PROYECTOS N KPP',           imputable: true  },
  { id: 'EMPNEGPRNMEL', descripcion: 'PROYECTOS N MEL',           imputable: true  },
  { id: 'EMPNEGPRNOTR', descripcion: 'PROYECTOS N OTROS',         imputable: true  },
  { id: 'EMPNEGPRNPRD', descripcion: 'PROYECTOS N PRDW',          imputable: true  },
  { id: 'EMPNEGPRNSPE', descripcion: 'PROYECTOS N SPENCE',        imputable: true  },
  { id: 'EMPPRU',       descripcion: 'CENTRO PRUEBA',             imputable: true  },
] as const

// ── Server Actions ────────────────────────────────────────────

/**
 * Crea una nueva organización con su admin inicial.
 * El admin recibe un email con link para establecer su contraseña.
 * Usar desde una ruta protegida o script de onboarding manual.
 */
export async function createOrganization(input: CreateOrgInput): Promise<CreateOrgResult> {
  const admin = createAdminClient()

  // 1. Crear la organización
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name:     input.name,
      slug:     input.slug,
      country:  input.country  ?? 'CL',
      currency: input.currency ?? 'CLP',
      plan:     'free' as const,
    })
    .select('id')
    .single()

  if (orgError || !org) {
    throw new Error(`Error creando organización: ${orgError?.message ?? 'desconocido'}`)
  }

  // 2. Crear el usuario admin en auth.users
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email:            input.adminEmail,
    email_confirm:    true,
    user_metadata:    { full_name: input.adminName },
  })

  if (authError || !authData.user) {
    // Rollback: eliminar la org recién creada
    await admin.from('organizations').delete().eq('id', org.id)
    throw new Error(`Error creando usuario admin: ${authError?.message ?? 'desconocido'}`)
  }

  const userId = authData.user.id

  // 3. Insertar en public.users
  const { error: userError } = await admin.from('users').insert({
    id:           userId,
    org_id:       org.id,
    full_name:    input.adminName,
    role:         'admin' as const,
    can_submit:   true,
    can_approve:  true,
    can_manage_petty_cash: true,
    can_load_bank_transfer: true,
    can_authorize_bank_transfer: true,
  })

  if (userError) {
    // Rollback: eliminar auth user y org
    await admin.auth.admin.deleteUser(userId)
    await admin.from('organizations').delete().eq('id', org.id)
    throw new Error(`Error creando perfil de usuario: ${userError.message}`)
  }

  // 4. Generar link de invitación para que el admin establezca su contraseña
  const { data: linkData } = await admin.auth.admin.generateLink({
    type:  'recovery',
    email: input.adminEmail,
  })

  const inviteLink = linkData?.properties?.action_link ?? ''

  return { orgId: org.id, userId, inviteLink }
}

/**
 * Seed de los centros de costo de PENTA para una org.
 * Útil si en el futuro otra empresa quiere usar la misma estructura.
 * NOTA: los códigos EMP* deben ser únicos en el sistema. Solo usar
 * en organizaciones que efectivamente quieran la estructura PENTA.
 */
export async function seedPentaCostCenters(orgId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('cost_centers').insert(
    PENTA_COST_CENTERS.map(c => ({ ...c, org_id: orgId, activo: true }))
  )
}

/**
 * Crea centros de costo personalizados para una organización.
 * Cada centro debe tener un código único en todo el sistema.
 */
export async function createCostCenter(input: {
  orgId:       string
  code:        string   // ej: 'VENTAS', 'ADMIN', 'OPERACIONES'
  descripcion: string
  imputable?:  boolean
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('cost_centers').insert({
    id:          input.code,
    org_id:      input.orgId,
    descripcion: input.descripcion,
    imputable:   input.imputable ?? false,
    activo:      true,
  })
  if (error) throw new Error(`Error creando centro de costo: ${error.message}`)
}

/**
 * Lista todas las organizaciones. Solo para uso interno / super-admin.
 */
export async function listOrganizations() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('organizations')
    .select('id, name, slug, plan, created_at')
    .order('created_at', { ascending: false })
  return data ?? []
}
