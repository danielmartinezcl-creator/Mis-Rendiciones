import { Check, AlertTriangle } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { etiquetaDeSaldo, type SaldoRendicion } from '@/lib/saldo-rendicion'

/**
 * ¿Queda algo pendiente en este documento?
 *
 * Reemplaza al distintivo de cuadre que estaba COPIADO en `/admin/reports` y en
 * `/admin/carga-historica`: el mismo markup y la misma lógica en dos archivos, que es
 * justo lo que hace que dos pantallas terminen diciendo cosas distintas. Las reglas
 * viven en `src/lib/saldo-rendicion.ts`, con pruebas; acá solo el dibujo.
 *
 * Merece ser componente —y no una clase, como la hoja— porque tiene lógica: elige tono
 * e ícono por estado y arma la explicación.
 *
 * El `title` no es decorativo: con el reembolso registrado por dos vías, el número a
 * secas no se puede auditar. Dice de dónde sale el saldo y, cuando el pago quedó
 * anotado dos veces, lo nombra.
 */

const TONOS: Record<SaldoRendicion['estado'], string> = {
  'saldado':        'bg-success-50 text-success-700 border-success-200',
  // La empresa le debe plata a la persona: hay un pago que hacer.
  'por-reembolsar': 'bg-warning-50 text-warning-700 border-warning-200',
  // Hay plata de la empresa en manos de alguien: para la empresa es lo más riesgoso.
  'por-devolver':   'bg-danger-50 text-danger-700 border-danger-200',
}

function explicacion(s: SaldoRendicion): string {
  const lineas = [
    `Salidas (gastos y traspasos pagados): ${formatCLP(s.salidas)}`,
    `Recibido: ${formatCLP(s.recibido)}`,
  ]

  if (s.dobleRegistro) {
    lineas.push(
      '',
      'El pago está anotado por dos vías y se cuenta una sola vez:',
      `· como movimiento del documento: ${formatCLP(s.recibidoItems)}`,
      `· como monto reembolsado en la carátula: ${formatCLP(s.recibidoCaratula)}`,
    )
  }

  return lineas.join('\n')
}

export function InsigniaSaldo({ saldo, className }: { saldo: SaldoRendicion; className?: string }) {
  const Icono = saldo.estado === 'saldado' ? Check : AlertTriangle

  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${TONOS[saldo.estado]} ${className ?? ''}`}
      title={explicacion(saldo)}
    >
      <Icono size={11} aria-hidden />
      {etiquetaDeSaldo(saldo.estado)}
      {saldo.estado !== 'saldado' && ` ${formatCLP(Math.abs(saldo.pendiente))}`}
    </span>
  )
}
