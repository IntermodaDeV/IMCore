import React from 'react'
import { Text, View, XStack } from 'tamagui'
import { EstadoSolicitud } from '../../api/modules/solicitudesRepuestos/solicitudes.types'

export const ACCENT = '#FF551A'

// Los seis pasos del recorrido de una pieza, en orden.
export const PASOS: EstadoSolicitud[] = [
  'SOLICITADO', 'ENVIADO', 'CREADO', 'EN_SOLICITUD_COMPRA', 'EN_ORDEN_COMPRA', 'INGRESADO',
]

// En el teléfono la etiqueta tiene que caber en una línea, así que es más corta
// que en el web. Lo que explica cada paso va en AYUDA, que sí se muestra completo
// en el detalle (hay espacio) y no compite con la lista.
export const ETIQUETA: Record<EstadoSolicitud, string> = {
  SOLICITADO: 'Solicitado',
  ENVIADO: 'Con Datos Maestros',
  CREADO: 'Creado en AX',
  EN_SOLICITUD_COMPRA: 'En solicitud de compra',
  EN_ORDEN_COMPRA: 'En orden de compra',
  INGRESADO: 'Ya está en bodega',
  CANCELADO: 'Cancelado',
}

export const AYUDA: Record<EstadoSolicitud, string> = {
  SOLICITADO: 'Falta que bodega le asigne el código.',
  ENVIADO: 'Datos Maestros lo está creando en AX.',
  CREADO: 'Ya existe en AX. Sigue la compra.',
  EN_SOLICITUD_COMPRA: 'Bodega levantó la solicitud de compra.',
  EN_ORDEN_COMPRA: 'Ya está pedido al proveedor.',
  INGRESADO: 'Llegó. Puede ir a bodega a traerlo.',
  CANCELADO: 'No siguió adelante.',
}

// Cuatro situaciones, no siete colores. El paso exacto lo dice el "n/6" y el
// texto; el color solo separa "sin salir / en camino / llegó / cancelado".
const COLORES: Record<EstadoSolicitud, { bg: string; fg: string }> = {
  SOLICITADO:          { bg: 'rgba(107,114,128,0.15)', fg: '#6b7280' },
  ENVIADO:             { bg: 'rgba(37,99,235,0.13)',   fg: '#1d4ed8' },
  CREADO:              { bg: 'rgba(37,99,235,0.13)',   fg: '#1d4ed8' },
  EN_SOLICITUD_COMPRA: { bg: 'rgba(37,99,235,0.13)',   fg: '#1d4ed8' },
  EN_ORDEN_COMPRA:     { bg: 'rgba(37,99,235,0.13)',   fg: '#1d4ed8' },
  INGRESADO:           { bg: 'rgba(34,197,94,0.15)',   fg: '#16a34a' },
  CANCELADO:           { bg: 'rgba(239,68,68,0.15)',   fg: '#dc2626' },
}

export const pasoDe = (e: EstadoSolicitud) => {
  const i = PASOS.indexOf(e)
  return i < 0 ? 0 : i + 1
}

export function EstadoChip({ estado, conPaso = true }: { estado: EstadoSolicitud; conPaso?: boolean }) {
  const c = COLORES[estado] ?? COLORES.SOLICITADO
  const paso = pasoDe(estado)
  return (
    <View backgroundColor={c.bg} borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
      <Text fontSize={11} fontWeight="700" color={c.fg}>
        {ETIQUETA[estado]}
        {conPaso && paso > 0 && estado !== 'INGRESADO' ? ` · ${paso}/${PASOS.length}` : ''}
      </Text>
    </View>
  )
}

// Barra de avance: seis segmentos, los recorridos en color. Es lo que contesta
// de un vistazo "¿cuánto falta?" sin tener que leer nada.
export function BarraAvance({ estado }: { estado: EstadoSolicitud }) {
  if (estado === 'CANCELADO') return null
  const paso = pasoDe(estado)
  const c = COLORES[estado]
  return (
    <XStack gap={3} marginTop="$1.5">
      {PASOS.map((_, i) => (
        <View
          key={i}
          flex={1}
          height={4}
          borderRadius={2}
          backgroundColor={i < paso ? c.fg : 'rgba(148,163,184,0.28)'}
        />
      ))}
    </XStack>
  )
}

export const fmtFecha = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: '2-digit' })
}

export const fmtFechaHora = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}`
}

// Tickets a los que tiene sentido amarrar una solicitud: los que todavía están
// vivos sobre esa máquina. Un ticket completado o cancelado ya no explica por
// qué se está pidiendo la pieza.
export const ESTADOS_TICKET_ABIERTO = ['PENDIENTE', 'EN_PROCESO', 'PAUSADO']
