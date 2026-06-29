import { DoorOpen, ShoppingCart, Bell } from 'lucide-react-native'
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
