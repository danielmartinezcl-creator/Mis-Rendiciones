import {
  Utensils, Building2, GraduationCap, Fuel, Smartphone,
  Clapperboard, Package, Tag, Wrench, Car,
  Briefcase, Coffee, Home, Heart, ShoppingBag, Plane,
  Globe, DollarSign, FileText, Stethoscope, Hotel, Bus,
  type LucideIcon,
} from 'lucide-react'

/**
 * `expense_categories.icon` guarda una CLAVE de este catálogo (`fuel`, `car`…),
 * no un emoji. Hasta el 2026-09-23 la tarjeta del ítem y la bandeja del
 * aprobador imprimían la clave tal cual: «fuel Combustible», «car TAG».
 * Toda pantalla que muestre una categoría pasa por acá.
 */
export const ICON_CATALOG: Array<{ key: string; Icon: LucideIcon; label: string }> = [
  { key: 'utensils',       Icon: Utensils,      label: 'Alimentación' },
  { key: 'coffee',         Icon: Coffee,        label: 'Café' },
  { key: 'building2',      Icon: Building2,     label: 'Alojamiento' },
  { key: 'hotel',          Icon: Hotel,         label: 'Hotel' },
  { key: 'graduation-cap', Icon: GraduationCap, label: 'Capacitación' },
  { key: 'fuel',           Icon: Fuel,          label: 'Combustible' },
  { key: 'smartphone',     Icon: Smartphone,    label: 'Comunicaciones' },
  { key: 'clapperboard',   Icon: Clapperboard,  label: 'Entretenimiento' },
  { key: 'package',        Icon: Package,       label: 'Materiales' },
  { key: 'wrench',         Icon: Wrench,        label: 'Servicios' },
  { key: 'car',            Icon: Car,           label: 'Vehículo' },
  { key: 'bus',            Icon: Bus,           label: 'Transporte' },
  { key: 'plane',          Icon: Plane,         label: 'Viajes' },
  { key: 'briefcase',      Icon: Briefcase,     label: 'Negocio' },
  { key: 'shopping-bag',   Icon: ShoppingBag,   label: 'Compras' },
  { key: 'home',           Icon: Home,          label: 'Inmueble' },
  { key: 'heart',          Icon: Heart,         label: 'Salud' },
  { key: 'stethoscope',    Icon: Stethoscope,   label: 'Médico' },
  { key: 'dollar-sign',    Icon: DollarSign,    label: 'Financiero' },
  { key: 'globe',          Icon: Globe,         label: 'Internacional' },
  { key: 'file-text',      Icon: FileText,      label: 'Documentos' },
  { key: 'tag',            Icon: Tag,           label: 'Otro' },
]

/** Una clave desconocida —o un emoji viejo guardado en la base— cae al genérico. */
export function getIconByKey(key: string | null | undefined): LucideIcon {
  if (!key) return Tag
  return ICON_CATALOG.find(e => e.key === key)?.Icon ?? Tag
}

/** Ícono de categoría en línea con el texto (metadatos de un ítem). */
export function IconoCategoria({ icon, size = 13, className }: {
  icon?: string | null
  size?: number
  className?: string
}) {
  const Icon = getIconByKey(icon)
  /* `Icon` sale de ICON_CATALOG, un catálogo de nivel de módulo con
     referencias fijas: no se recrea en cada render. */
  // eslint-disable-next-line react-hooks/static-components
  return <Icon size={size} strokeWidth={2} className={className} aria-hidden="true" />
}
