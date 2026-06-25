import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { PieChart } from 'react-native-gifted-charts'

import { ticketsService } from '../../../api/modules/mantenimiento/tickets.service'
import { ITicketResumen } from '../../../api/modules/mantenimiento/tickets.types'
import { ACCENT, MESES, colorEstado } from '../mantenimiento.helpers'
import { SectionCard } from '../components'
import { shadows } from '../../../theme/shadows'
import AppSelect from '../../../components/commons/AppSelect'

type Modo = 'semana' | 'mes' | 'anio'

// Fecha local como 'YYYY-MM-DDTHH:mm:ss' (sin zona) para que el backend la
// interprete en hora local del servidor y no se desfase el rango por UTC.
const fmtLocal = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const fmtMin = (n: number | null | undefined): string => {
  if (n == null) return '—'
  const m = Math.round(n)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), mm = m % 60
  return mm ? `${h} h ${mm} min` : `${h} h`
}

// Número de semana ISO-8601 (lunes como inicio).
const isoWeek = (d: Date): number => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}

const HOY = new Date()

export default function TicketsResumen() {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const isWide = width >= 700
  const CONTENT_MAX = 1000
  const donutR = Math.min(110, Math.max(70, (isWide ? 360 : width) / 3.4))

  const [modo, setModo] = useState<Modo>('semana')
  const [mes, setMes] = useState<number>(HOY.getMonth() + 1)
  const [anio, setAnio] = useState<number>(HOY.getFullYear())

  const [data, setData] = useState<ITicketResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Rango [desde, hasta) según el modo seleccionado.
  const { desde, hasta, etiqueta } = useMemo(() => {
    if (modo === 'semana') {
      const now = new Date()
      const diffToMon = (now.getDay() + 6) % 7 // lunes = inicio de semana
      const lunes = new Date(now); lunes.setHours(0, 0, 0, 0); lunes.setDate(now.getDate() - diffToMon)
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
  }, [modo, mes, anio])

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const res = await ticketsService.getResumen(fmtLocal(desde), fmtLocal(hasta))
      if (!res.Success) { setError(res.ErrorMessage || 'No se pudo cargar el resumen'); setData([]); return }
      setData(res.Data ?? [])
    } catch (e: any) {
      setError(e?.message || 'Error de conexión'); setData([])
    }
  }, [desde, hasta])

  useEffect(() => { (async () => { setCargando(true); await cargar(); setCargando(false) })() }, [cargar])

  // Recarga silenciosa al volver a enfocar (p. ej. tras operar un ticket).
  const primerFoco = React.useRef(true)
  useFocusEffect(useCallback(() => {
    if (primerFoco.current) { primerFoco.current = false; return }
    cargar()
  }, [cargar]))

  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const global = useMemo(() => data.find(d => d.EsGlobal), [data])
  const mecanicos = useMemo(() => data.filter(d => !d.EsGlobal), [data])

  const total = global?.Total ?? 0
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : '0%')

  const dona = useMemo(() => {
    if (!global) return []
    return [
      { label: 'Pendiente', value: global.Pendientes },
      { label: 'En Proceso', value: global.EnProceso },
      { label: 'Pausado', value: global.Pausados },
      { label: 'Completado', value: global.Completados },
      { label: 'Cancelado', value: global.Cancelados },
    ].filter(d => d.value > 0)
  }, [global])
  const totalDona = dona.reduce((a, d) => a + d.value, 0) || 1

  const aniosOpts = useMemo(() => {
    const y = HOY.getFullYear()
    return [y, y - 1, y - 2].map(a => ({ label: String(a), value: String(a) }))
  }, [])
  const mesesOpts = useMemo(
    () => Object.entries(MESES).map(([k, v]) => ({ label: v, value: k })),
    [],
  )

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 12, paddingBottom: 96 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <YStack width="100%" maxWidth={CONTENT_MAX} alignSelf="center" gap="$3">

        {/* Filtro de período */}
        <XStack gap="$2">
          <PeriodoChip label="Semana" active={modo === 'semana'} onPress={() => setModo('semana')} />
          <PeriodoChip label="Mes" active={modo === 'mes'} onPress={() => setModo('mes')} />
          <PeriodoChip label="Año" active={modo === 'anio'} onPress={() => setModo('anio')} />
        </XStack>

        {modo !== 'semana' && (
          <XStack gap="$2">
            {modo === 'mes' && (
              <View flex={1}>
                <AppSelect label="Mes" value={String(mes)} options={mesesOpts}
                  onValueChange={v => setMes(Number(v))} />
              </View>
            )}
            <View flex={1}>
              <AppSelect label="Año" value={String(anio)} options={aniosOpts}
                onValueChange={v => setAnio(Number(v))} />
            </View>
          </XStack>
        )}

        <Text fontSize="$2" color="$textMuted">📅 {etiqueta}</Text>

        {cargando ? (
          <YStack alignItems="center" justifyContent="center" paddingVertical="$10" gap="$3">
            <Spinner size="large" color={ACCENT} />
            <Text color="$textMuted">Cargando resumen…</Text>
          </YStack>
        ) : error ? (
          <YStack alignItems="center" justifyContent="center" paddingVertical="$10" gap="$2">
            <Text fontSize="$4" fontWeight="700" color="$text">No se pudo cargar</Text>
            <Text fontSize="$2" color="$textMuted" textAlign="center">{error}</Text>
          </YStack>
        ) : total === 0 ? (
          <YStack alignItems="center" justifyContent="center" paddingVertical="$10" gap="$2">
            <Text fontSize="$4" fontWeight="700" color="$text">Sin tickets</Text>
            <Text fontSize="$2" color="$textMuted" textAlign="center">No hay tickets en este período.</Text>
          </YStack>
        ) : (
          <>
            {/* KPIs */}
            <XStack flexWrap="wrap" gap="$2">
              <Kpi titulo="Total" valor={total.toLocaleString()} />
              <Kpi titulo="Pendientes" valor={String(global!.Pendientes)}
                badgeText={pct(global!.Pendientes)} badgeColor={colorEstado('Pendiente')} />
              <Kpi titulo="En Proceso" valor={String(global!.EnProceso + global!.Pausados)}
                badgeText={pct(global!.EnProceso + global!.Pausados)} badgeColor={colorEstado('En Proceso')} />
              <Kpi titulo="Completados" valor={String(global!.Completados)}
                badgeText={pct(global!.Completados)} badgeColor={colorEstado('Completado')} />
              <Kpi titulo="T. Respuesta Prom." valor={fmtMin(global!.TiempoRespuestaProm)} />
              <Kpi titulo="T. Resolución Prom." valor={fmtMin(global!.TiempoResolucionProm)} />
            </XStack>

            {/* Estado (dona + leyenda) */}
            <SectionCard titulo="Estado de tickets">
              <YStack alignItems="center" gap="$3">
                <PieChart
                  donut
                  data={dona.map(d => ({
                    value: d.value,
                    color: colorEstado(d.label),
                    text: `${Math.round((d.value / totalDona) * 100)}%`,
                  }))}
                  radius={donutR}
                  innerRadius={donutR / 1.9}
                  innerCircleColor={theme.backgroundElevated?.val}
                  showText
                  textColor="#fff"
                  textSize={11}
                />
                <YStack gap="$1.5" width="100%">
                  {dona.map(d => (
                    <XStack key={d.label} alignItems="center" gap="$2">
                      <View width={12} height={12} borderRadius={3} backgroundColor={colorEstado(d.label)} />
                      <Text fontSize={12} color="$text" flex={1}>{d.label}</Text>
                      <Text fontSize={12} color="$textMuted" marginRight="$2">
                        {((d.value / totalDona) * 100).toFixed(1)}%
                      </Text>
                      <Text fontSize={12} fontWeight="700" color="$text">{d.value}</Text>
                    </XStack>
                  ))}
                </YStack>
              </YStack>
            </SectionCard>

            {/* Por mecánico / técnico */}
            <SectionCard titulo="Por mecánico / técnico">
              {mecanicos.length === 0 ? (
                <Text fontSize="$2" color="$textMuted">Sin tickets asignados en este período.</Text>
              ) : (
                <YStack gap="$2.5">
                  {mecanicos.map(m => (
                    <YStack key={m.Mecanico_UserCode} backgroundColor="$background" borderRadius="$4" padding="$3" gap="$2">
                      <XStack alignItems="center" justifyContent="space-between">
                        <Text fontSize="$3" fontWeight="800" color="$text" flex={1} numberOfLines={1}>
                          {m.Mecanico || m.Mecanico_UserCode}
                        </Text>
                        <Text fontSize="$2" color="$textMuted">{m.Total} ticket{m.Total === 1 ? '' : 's'}</Text>
                      </XStack>
                      <XStack gap="$2" flexWrap="wrap">
                        <MiniStat label="Pend." value={m.Pendientes} color={colorEstado('Pendiente')} />
                        <MiniStat label="Proc." value={m.EnProceso + m.Pausados} color={colorEstado('En Proceso')} />
                        <MiniStat label="Comp." value={m.Completados} color={colorEstado('Completado')} />
                      </XStack>
                      <XStack gap="$4" flexWrap="wrap">
                        <Text fontSize="$2" color="$textMuted">T. resp.: <Text color="$text" fontWeight="700">{fmtMin(m.TiempoRespuestaProm)}</Text></Text>
                        <Text fontSize="$2" color="$textMuted">T. resol.: <Text color="$text" fontWeight="700">{fmtMin(m.TiempoResolucionProm)}</Text></Text>
                      </XStack>
                    </YStack>
                  ))}
                </YStack>
              )}
            </SectionCard>
          </>
        )}
      </YStack>
    </ScrollView>
  )
}

// KPI compacto: número y porcentaje en la misma línea (tarjeta más baja).
function Kpi({ titulo, valor, badgeText, badgeColor }: {
  titulo: string; valor: string; badgeText?: string; badgeColor?: string
}) {
  return (
    <YStack
      flex={1}
      minWidth="44%"
      {...shadows.sm}
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      gap="$1"
    >
      <Text fontSize={11} fontWeight="600" color="$textMuted" numberOfLines={1}>{titulo}</Text>
      <XStack alignItems="center" gap="$2">
        <Text fontSize={22} fontWeight="800" color="$text">{valor}</Text>
        {!!badgeText && (
          <XStack alignItems="center" backgroundColor={(badgeColor ?? ACCENT) + '22'}
            paddingHorizontal={7} paddingVertical={2} borderRadius={7}>
            <Text fontSize={10} color={badgeColor ?? ACCENT} fontWeight="800">{badgeText}</Text>
          </XStack>
        )}
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

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <XStack alignItems="center" gap="$1.5" backgroundColor="$backgroundHover" borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
      <View width={8} height={8} borderRadius={4} backgroundColor={color} />
      <Text fontSize="$1" color="$textMuted">{label}</Text>
      <Text fontSize="$2" fontWeight="800" color="$text">{value}</Text>
    </XStack>
  )
}
