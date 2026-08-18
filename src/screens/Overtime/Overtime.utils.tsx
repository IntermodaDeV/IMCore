import React from 'react'
import { YStack, XStack, Text, View, useTheme } from 'tamagui'
import dayjs from 'dayjs'

import { IOvertimeConcept } from '../../api/modules/overtime/overtime.types'

// Formato y piezas compartidas por las dos bandejas de horas extra: la de
// solicitudes y la de revisión de la diferencia. Viven acá porque las dos
// muestran las mismas horas y los mismos conceptos, y si el formato se
// duplicara terminaría divergiendo entre pantallas.

/**
 * Color de la banda según el recargo. Se ordena de frío a cálido para que el
 * salto de 25% a 100% se lea como una escalada de costo.
 */
export const colorConcepto = (porcentaje: number | null | undefined): string => {
  if (porcentaje === null || porcentaje === undefined) return '#F59E0B' // sin parámetro
  if (porcentaje <= 0.25) return '#38BDF8'
  if (porcentaje <= 0.5) return '#818CF8'
  if (porcentaje <= 0.75) return '#A78BFA'
  return '#F472B6'
}

export const fmtPorcentaje = (porcentaje: number | null | undefined) =>
  porcentaje === null || porcentaje === undefined ? 's/%' : `${Math.round(porcentaje * 100)}%`

/** 3.5 → '3h 30m'. Las horas extra se piensan en minutos, no en decimales. */
export const fmtHoras = (horas: number | null | undefined) => {
  if (horas === null || horas === undefined || Number.isNaN(horas)) return '—'
  const total = Math.round(horas * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`
}

/** Solo la hora: la fecha ya está en la tarjeta. */
export const fmtHora = (iso: string | null) => (iso ? dayjs(iso).format('HH:mm') : '—')

export const fmtFecha = (iso: string | null) => (iso ? dayjs(iso).format('ddd DD MMM') : '')

export const fmtFechaHora = (iso: string | null) =>
  iso ? dayjs(iso).format('DD/MM/YYYY HH:mm') : '—'

/**
 * Nombre completo con su código: '002168 - Laura Karina Chinchilla Chinchilla'.
 *
 * La vista ya suele traer el código adelante; cuando no, se antepone. El código
 * es lo que identifica sin ambigüedad —hay homónimos— así que va siempre.
 */
export const nombreConCodigo = (valor: string, codigo?: string) => {
  if (!valor) return codigo ?? ''

  const tieneCodigo = valor.includes(' - ')
  const nombre = tieneCodigo ? valor.slice(valor.indexOf(' - ') + 3) : valor
  const code = tieneCodigo ? valor.slice(0, valor.indexOf(' - ')).trim() : (codigo ?? '')

  const propio = nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

  return code ? `${code} - ${propio}` : propio
}

export const parseConceptos = (json: string | null): IOvertimeConcept[] => {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    // De la banda más barata a la más cara, que es el orden en que ocurren.
    return [...parsed].sort((a, b) => (a?.porcentaje ?? 99) - (b?.porcentaje ?? 99))
  } catch {
    return []
  }
}

/**
 * Distribución de las horas por recargo.
 *
 * La barra es proporcional a las horas de cada banda, no a partes iguales: de un
 * vistazo se ve si la solicitud es casi toda al 25% o si carga sobre el 100%,
 * que es lo que cambia el costo. Las pastillas dan el detalle exacto, porque una
 * banda de 15 minutos queda como un hilo imposible de leer en la barra.
 */
export function DistribucionHoras({
  conceptos,
  compacta = false,
}: {
  conceptos: IOvertimeConcept[]
  /** En la bandeja de revisión hay dos distribuciones por tarjeta: se achican. */
  compacta?: boolean
}) {
  const theme = useTheme()

  if (conceptos.length === 0) {
    return (
      <Text fontSize={11} color="$textMuted" fontStyle="italic">
        Sin desglose por concepto
      </Text>
    )
  }

  const suma = conceptos.reduce((acc, c) => acc + (c.hours ?? 0), 0) || 1

  return (
    <YStack gap={compacta ? '$1.5' : '$2'}>
      <XStack gap="$2" flexWrap="wrap">
        {conceptos.map((c, i) => {
          const color = colorConcepto(c.porcentaje)
          return (
            <XStack
              key={`${c.concepto}-chip-${i}`}
              paddingHorizontal={compacta ? 6 : 8}
              paddingVertical={compacta ? 2 : 3}
              borderRadius={20}
              alignItems="center"
              gap="$1"
              style={{ backgroundColor: `${color}26` }}
            >
              <Text fontSize={compacta ? 10 : 11} fontWeight="700" style={{ color }}>
                {fmtPorcentaje(c.porcentaje)}
              </Text>
              <Text fontSize={compacta ? 10 : 11} color={theme.textSecondary?.val as string}>
                {fmtHoras(c.hours)}
              </Text>
            </XStack>
          )
        })}
      </XStack>
    </YStack>
  )
}
