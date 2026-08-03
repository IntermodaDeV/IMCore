import React, { useMemo, useState } from 'react'
import { Text, XStack, YStack, View } from 'tamagui'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { ACCENT, MESES } from './mantenimiento.helpers'

// Selector de período (Semana / Mes / Año) + navegador ‹ ›, compartido por el
// Resumen y el Listado de tickets para que ambos usen EXACTAMENTE el mismo filtro.

export type ModoPeriodo = 'semana' | 'mes' | 'anio'

// Fecha local como 'YYYY-MM-DDTHH:mm:ss' (sin zona) para que el backend la
// interprete en hora local del servidor y no se desfase el rango por UTC.
export const fmtLocal = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Número de semana ISO-8601 (lunes como inicio).
const isoWeek = (d: Date): number => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}

export interface PeriodoState {
  modo: ModoPeriodo
  desde: Date
  hasta: Date
  etiqueta: string
  puedeAvanzar: boolean
  cambiarModo: (m: ModoPeriodo) => void
  navegar: (dir: -1 | 1) => void
}

// Hook con el estado y el rango [desde, hasta) del período seleccionado.
export function usePeriodo(inicial: ModoPeriodo = 'semana'): PeriodoState {
  const [modo, setModo] = useState<ModoPeriodo>(inicial)
  const [mes, setMes] = useState<number>(() => new Date().getMonth() + 1)
  const [anio, setAnio] = useState<number>(() => new Date().getFullYear())
  // Ancla de la semana mostrada (permite navegar a semanas anteriores con las flechas).
  const [semRef, setSemRef] = useState<Date>(() => new Date())

  // Cambiar de modo reinicia el período al actual.
  const cambiarModo = (m: ModoPeriodo) => {
    const hoy = new Date()
    setModo(m); setSemRef(hoy); setMes(hoy.getMonth() + 1); setAnio(hoy.getFullYear())
  }
  // Navegar ‹ / › según el modo (anterior / siguiente).
  const navegar = (dir: -1 | 1) => {
    if (modo === 'semana') {
      setSemRef(prev => { const d = new Date(prev); d.setDate(d.getDate() + dir * 7); return d })
    } else if (modo === 'mes') {
      let m = mes + dir, a = anio
      if (m < 1) { m = 12; a -= 1 } else if (m > 12) { m = 1; a += 1 }
      setMes(m); setAnio(a)
    } else {
      setAnio(a => a + dir)
    }
  }

  // Rango [desde, hasta) según el modo seleccionado.
  const { desde, hasta, etiqueta } = useMemo(() => {
    if (modo === 'semana') {
      const base = new Date(semRef)
      const diffToMon = (base.getDay() + 6) % 7 // lunes = inicio de semana
      const lunes = new Date(base); lunes.setHours(0, 0, 0, 0); lunes.setDate(base.getDate() - diffToMon)
      const sigLunes = new Date(lunes); sigLunes.setDate(lunes.getDate() + 7)
      return {
        desde: lunes,
        hasta: sigLunes,
        etiqueta: `Semana ${isoWeek(lunes)} · ${MESES[lunes.getMonth() + 1]} ${lunes.getFullYear()}`,
      }
    }
    if (modo === 'mes') {
      return {
        desde: new Date(anio, mes - 1, 1),
        hasta: new Date(anio, mes, 1),
        etiqueta: `${MESES[mes]} ${anio}`,
      }
    }
    return { desde: new Date(anio, 0, 1), hasta: new Date(anio + 1, 0, 1), etiqueta: `Año ${anio}` }
  }, [modo, mes, anio, semRef])

  // No permitir avanzar al futuro: el período mostrado ya alcanza/incluye hoy.
  const puedeAvanzar = hasta.getTime() <= Date.now()

  return { modo, desde, hasta, etiqueta, puedeAvanzar, cambiarModo, navegar }
}

// UI del filtro: chips Semana/Mes/Año + navegador ‹ etiqueta ›.
export function PeriodoFiltro({ modo, etiqueta, puedeAvanzar, cambiarModo, navegar }: PeriodoState) {
  return (
    <YStack gap="$2">
      <XStack gap="$2">
        <PeriodoChip label="Semana" active={modo === 'semana'} onPress={() => cambiarModo('semana')} />
        <PeriodoChip label="Mes" active={modo === 'mes'} onPress={() => cambiarModo('mes')} />
        <PeriodoChip label="Año" active={modo === 'anio'} onPress={() => cambiarModo('anio')} />
      </XStack>
      <XStack alignItems="center" justifyContent="space-between" gap="$2"
        borderWidth={1} borderColor="$border" borderRadius="$4" paddingVertical="$2" paddingHorizontal="$3">
        <View onPress={() => navegar(-1)} pressStyle={{ opacity: 0.6 }} padding="$1" hitSlop={8}>
          <ChevronLeft size={22} color={ACCENT} />
        </View>
        <Text fontSize="$4" fontWeight="800" color="$text" textAlign="center" flex={1}>{etiqueta}</Text>
        <View onPress={puedeAvanzar ? () => navegar(1) : undefined} pressStyle={{ opacity: 0.6 }}
          padding="$1" hitSlop={8} opacity={puedeAvanzar ? 1 : 0.3}>
          <ChevronRight size={22} color={ACCENT} />
        </View>
      </XStack>
    </YStack>
  )
}

function PeriodoChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <View
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      flex={1}
      borderRadius="$4"
      height={36}
      alignItems="center"
      justifyContent="center"
      borderWidth={1.5}
      borderColor={ACCENT}
      backgroundColor={active ? ACCENT : 'transparent'}
    >
      <Text fontSize="$2" fontWeight="700" color={active ? '#fff' : ACCENT}>{label}</Text>
    </View>
  )
}