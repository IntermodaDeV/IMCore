import { DoorOpen, ShoppingCart, Bell, CheckCheck, Clock, CircleX, CircleCheck, Scale } from 'lucide-react-native'
import type { NotificationCategory } from '../api/modules/notifications/notifications.service'

/**
 * Registro visual de categorías de notificación.
 * Para agregar una categoría nueva (ej. cuando se integren las solicitudes de
 * compra), basta con añadir una entrada aquí — la bandeja la usa automáticamente.
 */
export type CategoryMeta = {
  label: string
  Icon: typeof Bell
  color: string   // color del icono / acento
  bg: string      // fondo del chip del icono
}

export const NOTIFICATION_CATEGORIES: Record<string, CategoryMeta> = {
  visita_acceso: {
    label: 'Pases',
    Icon: DoorOpen,
    color: '#2563EB',
    bg: 'rgba(37,99,235,0.12)',
  },
  solicitud_compra: {
    label: 'Solicitudes de compra',
    Icon: ShoppingCart,
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.12)',
  },
  solicitud_compra_historico: {
    label: 'Solicitudes de compra',
    Icon: ShoppingCart,
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.12)',
  },
  pase_aprobacion: {
    label: 'Aprobación de pase',
    Icon: CheckCheck,
    color: '#FF551A',
    bg: 'rgba(255,85,26,0.12)',
  },
  pase_estado: {
    label: 'Pases',
    Icon: DoorOpen,
    color: '#15803D',
    bg: 'rgba(34,197,94,0.12)',
  },
  horas_extra_aprobacion: {
    label: 'Aprobación de horas extra',
    Icon: Clock,
    color: '#0284C7',
    bg: 'rgba(2,132,199,0.12)',
  },
  horas_extra_rechazo: {
    label: 'Horas extra rechazadas',
    Icon: CircleX,
    color: '#DC2626',
    bg: 'rgba(220,38,38,0.12)',
  },
  horas_extra_completada: {
    label: 'Horas extra aprobadas',
    Icon: CircleCheck,
    color: '#15803D',
    bg: 'rgba(34,197,94,0.12)',
  },
  horas_extra_revision: {
    label: 'Diferencia de horas',
    Icon: Scale,
    color: '#B45309',
    bg: 'rgba(245,158,11,0.12)',
  },
  horas_extra_revision_resultado: {
    label: 'Revisión de horas resuelta',
    Icon: Scale,
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.12)',
  },
}

const DEFAULT_CATEGORY: CategoryMeta = {
  label: 'Notificación',
  Icon: Bell,
  color: '#64748B',
  bg: 'rgba(100,116,139,0.12)',
}

export function getCategoryMeta(category?: NotificationCategory): CategoryMeta {
  if (category && NOTIFICATION_CATEGORIES[category]) {
    return NOTIFICATION_CATEGORIES[category]
  }
  return DEFAULT_CATEGORY
}
