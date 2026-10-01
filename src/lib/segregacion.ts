// Las alertas de segregación de funciones. NO bloquean: en una empresa chica
// pueden ser deliberadas (Daniel, 2026-10-01). Se calculan sobre el estado
// RESULTANTE —la base más lo que la planilla va a escribir—, porque el problema
// puede nacer justo de la carga.
//
// Los permisos bancarios NO son columnas de la planilla: se leen de la base. Es
// la forma de dar visibilidad sobre la segregación sin repartir esos permisos
// desde un Excel.
//
// Spec: docs/superpowers/specs/2026-10-01-planilla-de-alta-design.md

import type { Persona, FilaResuelta } from '@/lib/planilla-alta'

export type Alerta = {
  tipo: 'banco' | 'circular' | 'concentracion'
  texto: string
  personas: string[]
}

const TOPE_A_CARGO = 15

export function alertasDeSegregacion(
  personas: Persona[],
  resueltas: FilaResuelta[],
  topeACargo: number = TOPE_A_CARGO,
): Alerta[] {
  const alertas: Alerta[] = []
  const nombre = (id: string) => personas.find(x => x.id === id)?.nombre ?? id

  // El estado resultante: la cadena de cada quien, ya con el parche encima. Una
  // fila con errores no se va a cargar, así que su parche no cuenta.
  const l1 = new Map<string, string | null>()
  const l2 = new Map<string, string | null>()
  for (const x of personas) { l1.set(x.id, x.approver_l1_id); l2.set(x.id, x.approver_l2_id) }
  for (const r of resueltas) {
    if (!r.persona || r.errores.length) continue
    if (r.parche.approver_l1_id) l1.set(r.persona.id, r.parche.approver_l1_id)
    if (r.parche.approver_l2_id) l2.set(r.persona.id, r.parche.approver_l2_id)
  }

  // 1. Carga Y autoriza pagos. La app impide usar ambas en el MISMO pago
  //    («quien cargó no autoriza»), pero tener las dos es lo que marca un auditor.
  for (const x of personas) {
    if (x.activo && x.can_load_bank_transfer && x.can_authorize_bank_transfer) {
      alertas.push({
        tipo: 'banco',
        texto: `${x.nombre} puede cargar y autorizar pagos`,
        personas: [x.nombre],
      })
    }
  }

  // 2. Se aprueban mutuamente: ninguno tiene supervisión real. validarCadena no
  //    lo ve, porque mira la cadena de una persona a la vez y nunca el conjunto.
  const pares = new Set<string>()
  for (const id of l1.keys()) {
    for (const quien of [l1.get(id), l2.get(id)]) {
      if (!quien) continue
      if (l1.get(quien) === id || l2.get(quien) === id) {
        const par = [id, quien].sort().join('|')
        if (pares.has(par)) continue
        pares.add(par)
        alertas.push({
          tipo: 'circular',
          texto: `${nombre(id)} y ${nombre(quien)} se aprueban mutuamente`,
          personas: [nombre(id), nombre(quien)].sort(),
        })
      }
    }
  }

  // 3. Cuello de botella y punto único de falla.
  const aCargo = new Map<string, number>()
  for (const jefe of l1.values()) {
    if (jefe) aCargo.set(jefe, (aCargo.get(jefe) ?? 0) + 1)
  }
  for (const [jefe, cuantos] of aCargo) {
    if (cuantos > topeACargo) {
      alertas.push({
        tipo: 'concentracion',
        texto: `${nombre(jefe)} queda como aprobador N1 de ${cuantos} personas`,
        personas: [nombre(jefe)],
      })
    }
  }

  return alertas
}
