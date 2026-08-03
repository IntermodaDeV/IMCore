import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { PieChart } from 'react-native-gifted-charts'

import { ticketsService } from '../../../api/modules/mantenimiento/tickets.service'
import { ITicketResumen } from '../../../api/modules/mantenimiento/tickets.types'
import { ACCENT, colorEstado } from '../mantenimiento.helpers'
import { SectionCard } from '../components'
import { shadows } from '../../../theme/shadows'
import { usePeriodo, PeriodoFiltro, fmtLocal } from '../periodo'

const fmtMin = (n: number | null | undefined): string => {
  if (n == null) return '—'
  const m = Math.round(n)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), mm = m % 60
  return mm ? `${h} h ${mm} min` : `${h} h`
}

export default function TicketsResumen() {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const isWide = width >= 700
  const CONTENT_MAX = 1000
  const donutR = Math.min(110, Math.max(70, (isWide ? 360 : width) / 3.4))

  // Selector de período compartido con el Listado.
  const periodo = usePeriodo('semana')
  const { desde, hasta } = periodo

  const [data, setData] = useState<ITicketResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 12, paddingBottom: 96 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <YStack width="100%" maxWidth={CONTENT_MAX} alignSelf="center" gap="$3">

        {/* Filtro de período (compartido con el Listado) */}
        <PeriodoFiltro {...periodo} />

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

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <XStack alignItems="center" gap="$1.5" backgroundColor="$backgroundHover" borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
      <View width={8} height={8} borderRadius={4} backgroundColor={color} />
      <Text fontSize="$1" color="$textMuted">{label}</Text>
      <Text fontSize="$2" fontWeight="800" color="$text">{value}</Text>
    </XStack>
  )
}
