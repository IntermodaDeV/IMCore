
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, Button, useTheme } from 'tamagui'
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts'

import { usePageHeader } from '../../hooks/usePageHeader'
import { ticketsService } from '../../api/modules/mantenimiento/tickets.service'
import { ITiempoMecanico, IActivoPeriodo, IMttr } from '../../api/modules/mantenimiento/tickets.types'
import { MantenimientoPeriodo } from '../../api/modules/sharepoint/mantenimiento.types'
import { usePeriodo, PeriodoFiltro, fmtLocal } from './periodo'
import {
  ACCENT,
  ESCALA_AZUL,
  ESCALA_NARANJA,
  ESCALA_VERDE,
  ESCALA_ROJA,
  calcularKpis,
  conteoArea,
  conteoEstado,
  conteoPrioridad,
  conteoTipoParo,
  colorEstado,
  colorPrioridad,
  rangoAnterior,
  tendenciaPorDia,
  topN,
} from './mantenimiento.helpers'
import { HBarList, KpiCard, SectionCard, TabBar } from './components'
import { DashboardAnalisis, EsperaAhora } from './DashboardAnalisis'

// El ORDEN de esta lista es el orden de los tabs; cada pestaña se resuelve por su
// `key`, no por su índice, para poder reordenarlas moviendo una sola línea.
const TABS = [
  { key: 'resumen', label: '📊 Resumen' },
  { key: 'analisis', label: '🔎 Análisis' },
  { key: 'tiempos', label: '⏱ Tiempos' },
  { key: 'activos', label: '🏭 Activos' },
  { key: 'distribucion', label: '📈 Distribución' },
  { key: 'rankings', label: '🏆 Rankings' },
  { key: 'detalle', label: '📋 Detalle' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function MantenimientoDashboardScreen() {
  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Mantenimiento
      </Text>
    ),
  })

  const { width } = useWindowDimensions()
  const chartWidth = width - 90 // ancho de pantalla menos paddings de página + tarjeta

  const [data, setData] = useState<MantenimientoPeriodo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Período dinámico (Semana/Mes/Año + flechas ‹ ›). Gobierna TODO el dashboard.
  const periodo = usePeriodo('semana')
  const desde = useMemo(() => fmtLocal(periodo.desde), [periodo.desde])
  const hasta = useMemo(() => fmtLocal(periodo.hasta), [periodo.hasta])
  // Rango previo del mismo largo: la pestaña Análisis compara contra él.
  const previo = useMemo(
    () => rangoAnterior(periodo.desde, periodo.hasta, periodo.modo),
    [periodo.desde, periodo.hasta, periodo.modo],
  )
  const desdePrev = useMemo(() => fmtLocal(previo.desde), [previo.desde])
  const hastaPrev = useMemo(() => fmtLocal(previo.hasta), [previo.hasta])

  const [tab, setTab] = useState(0)
  // Qué pestaña está activa, por nombre: reordenar TABS no toca el render.
  const tabKey: TabKey = TABS[tab]?.key ?? 'resumen'
  // Toggle Máquina/Área (en cliente, sobre TipoDestino de los registros).
  const [tipoDest, setTipoDest] = useState<'Todos' | 'MAQUINA' | 'AREA'>('Todos')
  // Breve indicador de carga al cambiar el toggle Máquina/Área (filtrado en cliente).
  const [filtrando, setFiltrando] = useState(false)

  const fetchData = useCallback(async () => {
    setError(null)
    try {
      const resp = await ticketsService.getDashboard(desde, hasta)
      if (!resp.Success || !resp.Data) {
        throw new Error(resp.ErrorMessage || 'No se pudo cargar la información.')
      }
      setData(resp.Data)
    } catch (e: any) {
      setError(e?.message ?? 'Error al conectar con el servidor.')
    }
  }, [desde, hasta])

  // Carga inicial y cada vez que cambia el período (desde/hasta).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      await fetchData()
      if (vivo) setCargando(false)
    })()
    return () => { vivo = false }
  }, [fetchData])

  // Se incrementa en cada "pull to refresh": los bloques de dato VIVO (lo que
  // está detenido ahora) lo usan para volver a pedirlo.
  const [recarga, setRecarga] = useState(0)

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await fetchData()
    setRecarga(n => n + 1)
    setRefrescando(false)
  }, [fetchData])

  // Flash breve de "carga" al cambiar el toggle Máquina/Área (filtrado instantáneo en cliente).
  const primerFiltroFino = useRef(true)
  useEffect(() => {
    if (primerFiltroFino.current) { primerFiltroFino.current = false; return }
    setFiltrando(true)
    const t = setTimeout(() => setFiltrando(false), 300)
    return () => clearTimeout(t)
  }, [tipoDest])

  // ── Datos derivados ── (solo el toggle Máquina/Área filtra en cliente)
  const registros = useMemo(() => {
    const base = data?.Registros ?? []
    return tipoDest === 'Todos' ? base : base.filter(r => r.TipoDestino === tipoDest)
  }, [data, tipoDest])
  const kpis = useMemo(() => calcularKpis(registros), [registros])
  const estado = useMemo(() => conteoEstado(registros), [registros])
  const prioridad = useMemo(() => conteoPrioridad(registros), [registros])
  const areas = useMemo(() => conteoArea(registros), [registros])
  const tiposParo = useMemo(() => conteoTipoParo(registros), [registros])
  const topMecanicos = useMemo(() => topN(registros, r => r.Mecanico), [registros])
  const topFallas = useMemo(() => topN(registros, r => r.TipoFalla), [registros])
  const tendencia = useMemo(() => tendenciaPorDia(registros), [registros])

  // ── Pantalla de carga inicial ──
  if (cargando && !data) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color={ACCENT} />
        <Text color="$textMuted" fontSize={13}>
          Cargando datos…
        </Text>
      </YStack>
    )
  }

  if (error && !data) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3" padding="$5">
        <Text color="$error" fontSize={14} textAlign="center">
          No se pudieron cargar los datos:
        </Text>
        <Text color="$textMuted" fontSize={12} textAlign="center">
          {error}
        </Text>
        <Button backgroundColor={ACCENT} color="white" onPress={onRefresh}>
          Reintentar
        </Button>
      </YStack>
    )
  }

  // Vista "cargando": cambio de período (backend) o flash de filtro de cliente.
  const refetching = (cargando && !!data) || filtrando
  return (
    <View flex={1} backgroundColor="$backgroundPage">
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />
      }
    >
      <YStack padding="$4" gap="$3" opacity={refetching ? 0.45 : 1}>
        {/* ── Encabezado ── */}
        <YStack>
          <Text fontSize={18} fontWeight="800" color="$text">
            🔧 Dashboard de Mantenimiento
          </Text>
          <Text fontSize={12} color="$text">
            📅 {periodo.etiqueta} · <Text fontWeight="700">{registros.length}</Text> registros
          </Text>
        </YStack>

        {/* ── Filtro de período: Semana / Mes / Año + navegador ‹ › ── */}
        <PeriodoFiltro {...periodo} />

        {/* ── Toggle Máquina / Área (separa los tickets por tipo de destino) ── */}
        <XStack backgroundColor="$backgroundHover" borderRadius="$4" padding={3} gap={3}>
          {(['Todos', 'MAQUINA', 'AREA'] as const).map(t => {
            const on = tipoDest === t
            const label = t === 'Todos' ? 'Todos' : t === 'MAQUINA' ? '🛠 Máquina' : '📍 Área'
            return (
              <View
                key={t}
                flex={1}
                onPress={() => setTipoDest(t)}
                pressStyle={{ opacity: 0.85 }}
                backgroundColor={on ? ACCENT : 'transparent'}
                borderRadius="$3"
                height={34}
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize={13} fontWeight="700" color={on ? '#fff' : '$textMuted'}>{label}</Text>
              </View>
            )
          })}
        </XStack>

        {/* ── Tabs ── */}
        <TabBar tabs={TABS.map(t => t.label)} activo={tab} onChange={setTab} />

        {cargando ? (
          <YStack height={200} alignItems="center" justifyContent="center">
            <Spinner size="large" color={ACCENT} />
          </YStack>
        ) : tabKey === 'analisis' ? (
          // Análisis: KPIs agregados en SQL (el toggle Máquina/Área va al servidor).
          <DashboardAnalisis
            desde={desde}
            hasta={hasta}
            desdePrev={desdePrev}
            hastaPrev={hastaPrev}
            tipoDest={tipoDest}
          />
        ) : tabKey === 'tiempos' ? (
          // Tiempos: datos por evento, mismo período que el filtro de arriba.
          <TabTiempos desde={desde} hasta={hasta} />
        ) : tabKey === 'activos' ? (
          // Activos: datos por evento/costo, mismo período que el filtro de arriba.
          <TabActivos desde={desde} hasta={hasta} />
        ) : registros.length === 0 ? (
          <YStack height={160} alignItems="center" justifyContent="center">
            <Text color="$textMuted" fontSize={13}>
              No hay registros para los filtros seleccionados.
            </Text>
          </YStack>
        ) : (
          <>
            {tabKey === 'resumen' && (
              <TabResumen
                kpis={kpis}
                estado={estado}
                prioridad={prioridad}
                chartWidth={chartWidth}
                desde={desde}
                hasta={hasta}
                tipoDest={tipoDest}
                recarga={recarga}
              />
            )}
            {tabKey === 'distribucion' && (
              <TabDistribucion
                areas={areas}
                tiposParo={tiposParo}
                tendencia={tendencia}
                chartWidth={chartWidth}
              />
            )}
            {tabKey === 'rankings' && <TabRankings topMecanicos={topMecanicos} topFallas={topFallas} />}
            {tabKey === 'detalle' && <TabDetalle registros={registros} />}
          </>
        )}
      </YStack>
    </ScrollView>
    {refetching && (
      <View
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        alignItems="center"
        justifyContent="center"
        pointerEvents="none"
      >
        <XStack
          backgroundColor="$background"
          borderColor="$border"
          borderWidth={1}
          borderRadius="$4"
          paddingHorizontal="$4"
          paddingVertical="$3"
          gap="$2"
          alignItems="center"
        >
          <Spinner color={ACCENT} />
          <Text color="$text" fontWeight="700">Actualizando…</Text>
        </XStack>
      </View>
    )}
    </View>
  )
}

// ════════ TAB: Resumen ════════
function TabResumen({ kpis, estado, prioridad, chartWidth, desde, hasta, tipoDest, recarga }: any) {
  const theme = useTheme()
  const txt = theme.text?.val ?? '#0F172A'
  const muted = theme.textMuted?.val ?? '#94A3B8'
  const grid = theme.border?.val ?? '#E2E8F0'
  const fmtMin = (n: number | null) => (n != null ? `${Math.round(n)} min` : '—')
  const pct = (n: number) => (kpis.total ? `${Math.round((n / kpis.total) * 100)}%` : '')
  const totalEstado = estado.reduce((a: number, d: any) => a + d.value, 0) || 1

  const barWidth = 40;
  const spacing = 25;
  const initialSpacing = 25;

  const graphWidth = prioridad.length * (barWidth + spacing) + initialSpacing;
  return (
    <YStack gap="$3">
      <XStack flexWrap="wrap" gap="$2">
        <KpiCard titulo="Total Tickets" valor={kpis.total.toLocaleString()} />
        <KpiCard
          titulo="Sin Atender"
          valor={kpis.sinAtender.toLocaleString()}
          badge={{ text: pct(kpis.sinAtender) + ' del total', color: '#ef4444', up: true }}
        />
        <KpiCard
          titulo="Completados"
          valor={kpis.completados.toLocaleString()}
          badge={{ text: pct(kpis.completados), color: '#22c55e', up: true }}
        />
        <KpiCard titulo="En Proceso" valor={kpis.enProceso.toLocaleString()} />
        <KpiCard titulo="T. Respuesta Prom." valor={fmtMin(kpis.tRespProm)} />
        <KpiCard titulo="T. Resolución Prom." valor={fmtMin(kpis.tResolProm)} />
      </XStack>

      <SectionCard titulo="Estado de Tickets">
        <YStack alignItems="center" gap="$3">
          <PieChart
            donut
            data={estado.map((d: any) => ({
              value: d.value,
              color: colorEstado(d.label),
              text: `${Math.round((d.value / totalEstado) * 100)}%`,
            }))}
            radius={chartWidth / 3.4}
            innerRadius={chartWidth / 7}
            innerCircleColor={theme.backgroundElevated?.val}
            showText
            textColor="#fff"
            textSize={11}
          />
          <YStack gap="$1.5" width="100%">
            {estado.map((d: any) => (
              <XStack key={d.label} alignItems="center" gap="$2">
                <View width={12} height={12} borderRadius={3} backgroundColor={colorEstado(d.label)} />
                <Text fontSize={12} color="$text" flex={1}>
                  {d.label}
                </Text>
                <Text fontSize={12} color="$textMuted" marginRight="$2">
                  {((d.value / totalEstado) * 100).toFixed(1)}%
                </Text>
                <Text fontSize={12} fontWeight="700" color="$text">
                  {d.value}
                </Text>
              </XStack>
            ))}
          </YStack>
        </YStack>
      </SectionCard>

      {/* Lo que está detenido AHORA (no depende del período de arriba). */}
      <EsperaAhora desde={desde} hasta={hasta} tipoDest={tipoDest} recarga={recarga} />

      <SectionCard titulo="Tickets por Prioridad" ejeX="Cantidad">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <BarChart
            data={prioridad.map((d: any) => ({
              value: d.value,
              label: d.label,
              frontColor: colorPrioridad(d.label),
              topLabelComponent: () => (
                <Text fontSize={11} fontWeight="700" color="$text">
                  {d.value}
                </Text>
              ),
            }))}
            width={Math.max(chartWidth, graphWidth)}
            barWidth={barWidth}
            spacing={spacing}
            initialSpacing={initialSpacing}
            noOfSections={4}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={grid}
            rulesColor={grid}
            rulesType="dashed"
            yAxisTextStyle={{ color: muted, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: txt, fontSize: 11 }}
          />
        </ScrollView>
      </SectionCard>
    </YStack>
  )
}

// ════════ TAB: Distribución (áreas, tipo de paro y tendencia del período) ════════
function TabDistribucion({ areas, tiposParo, tendencia, chartWidth }: any) {
  const theme = useTheme()
  const txt = theme.text?.val ?? '#0F172A'
  const muted = theme.textMuted?.val ?? '#94A3B8'
  const grid = theme.border?.val ?? '#E2E8F0'

  const spacing = 40;
  const initialSpacing = 25;
  const endSpacing = 25;

  const graphWidth = tendencia.length * spacing + initialSpacing + endSpacing;

  return (
    <YStack gap="$3">
      <SectionCard titulo="Tickets por Área" ejeX="Cantidad">
        <HBarList datos={areas} escala={ESCALA_AZUL} />
      </SectionCard>
      <SectionCard titulo="Tipo de Paro" ejeX="Cantidad">
        <HBarList datos={tiposParo} escala={ESCALA_NARANJA} />
      </SectionCard>
      <SectionCard titulo="Tendencia (por día)">
        {tendencia.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={tendencia.map((d: any) => ({ value: d.value, label: d.label.slice(8) }))}
              color={ACCENT}
              thickness={2}
              width={Math.max(chartWidth, graphWidth)}
              spacing={spacing}
              initialSpacing={initialSpacing}
              endSpacing={endSpacing}
              noOfSections={4}
              yAxisThickness={0}
              xAxisThickness={1}
              xAxisColor={grid}
              rulesColor={grid}
              rulesType="dashed"
              yAxisTextStyle={{ color: muted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: txt, fontSize: 10 }}
              dataPointsColor={ACCENT}
              curved
            />
          </ScrollView>
        ) : (
          <Text fontSize={12} color="$textMuted">
            Se necesitan al menos 2 días con registros para la tendencia.
          </Text>
        )}
      </SectionCard>
    </YStack>
  )
}

// ════════ TAB: Rankings ════════
function TabRankings({ topMecanicos, topFallas }: any) {
  return (
    <YStack gap="$3">
      <SectionCard titulo="Top 10 Mecánicos" ejeX="Tickets atendidos">
        <HBarList datos={topMecanicos} escala={ESCALA_VERDE} />
      </SectionCard>
      <SectionCard titulo="Top 10 Tipos de Falla" ejeX="Cantidad">
        <HBarList datos={topFallas} escala={ESCALA_ROJA} />
      </SectionCard>
    </YStack>
  )
}

// ════════ TAB: Tiempos (minutos netos por mecánico vs meta) ════════
function fmtHM(min: number) {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`
}

function TabTiempos({ desde, hasta }: { desde: string; hasta: string }) {
  const VERDE = '#22c55e'
  const [tiempos, setTiempos] = useState<ITiempoMecanico[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      try {
        const resp = await ticketsService.getTiempoMecanicos(desde, hasta)
        if (vivo) setTiempos(resp.Success && resp.Data ? resp.Data : [])
      } catch {
        if (vivo) setTiempos([])
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [desde, hasta])

  const metaSemanal = tiempos[0]?.MetaSemanal ?? 0
  const semanas = tiempos[0]?.SemanasPeriodo ?? 0
  const metaPeriodo = tiempos[0]?.MetaPeriodo || 1
  const totalMin = tiempos.reduce((a, t) => a + t.MinNetos, 0)
  const cumplen = tiempos.filter(t => t.MinNetos >= metaPeriodo).length

  return (
    <YStack gap="$3">
      {cargando ? (
        <YStack height={160} alignItems="center" justifyContent="center">
          <Spinner size="large" color={ACCENT} />
        </YStack>
      ) : !tiempos.length ? (
        <YStack height={140} alignItems="center" justifyContent="center" paddingHorizontal="$4">
          <Text color="$textMuted" fontSize={13} textAlign="center">
            No hay tiempo de trabajo registrado en este período.
          </Text>
        </YStack>
      ) : (
        <>
          {/* Resumen de meta del período */}
          <XStack flexWrap="wrap" gap="$2">
            <KpiCard titulo="Meta del período" valor={`${metaPeriodo.toLocaleString()} min`} />
            <KpiCard titulo="Mecánicos que cumplen" valor={`${cumplen} / ${tiempos.length}`} />
            <KpiCard titulo="Total trabajado" valor={fmtHM(totalMin)} />
          </XStack>

          <SectionCard titulo="⏱ Minutos por mecánico" ejeX={`Meta ${metaSemanal.toLocaleString()}/sem · ${semanas} sem = ${metaPeriodo.toLocaleString()} min`}>
            <YStack gap="$3">
              {tiempos.map(t => {
                const pct = Math.round((t.MinNetos / metaPeriodo) * 100)
                const cumple = t.MinNetos >= metaPeriodo
                const barColor = cumple ? VERDE : ACCENT
                return (
                  <YStack key={t.Mecanico_UserCode ?? t.Mecanico ?? String(t.MinNetos)} gap="$1.5">
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text fontSize={13} fontWeight="700" color="$text" flex={1} numberOfLines={1}>
                        {t.Mecanico || t.Mecanico_UserCode || '—'}
                      </Text>
                      <Text fontSize={12} color="$textMuted">
                        {t.TicketsTocados} {t.TicketsTocados === 1 ? 'ticket' : 'tickets'}
                      </Text>
                    </XStack>
                    {/* Barra de progreso vs meta del período */}
                    <View height={10} borderRadius={6} backgroundColor="$backgroundHover" overflow="hidden">
                      <View
                        height={10}
                        borderRadius={6}
                        width={`${Math.min(100, pct)}%`}
                        backgroundColor={barColor}
                      />
                    </View>
                    <XStack justifyContent="space-between">
                      <Text fontSize={11} color="$textMuted">
                        {t.MinNetos.toLocaleString()} / {metaPeriodo.toLocaleString()} min
                      </Text>
                      <Text fontSize={12} fontWeight="800" color={cumple ? VERDE : '$textMuted'}>
                        {pct}%{cumple ? ' ✓' : ''}
                      </Text>
                    </XStack>
                  </YStack>
                )
              })}
            </YStack>
          </SectionCard>
        </>
      )}

      {/* FUERA del condicional de arriba a propósito: el MTTR es otra consulta y
          tiene su propio estado de carga/vacío. Si fuera adentro, un período sin
          minutos registrados lo esconderría aunque sí hubiera reparaciones. */}
      <BloqueMttr desde={desde} hasta={hasta} agrupar="MECANICO" />
    </YStack>
  )
}

// ════════ TAB: Activos/Máquinas (minutos y costo por período, sin meta) ════════
function fmtLps(n: number) {
  return `L ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Subtítulo de un activo: nº de máquina (si el título ya es el modelo) + área.
function subActivo(a: IActivoPeriodo): string | null {
  return [a.Modelo ? a.NumeroMaquina : null, a.Area].filter(Boolean).join(' · ') || null
}

function BarraActivo({
  titulo, subtitulo, valor, pct, color, pie,
}: { titulo: string; subtitulo?: string | null; valor: string; pct: number; color: string; pie?: string }) {
  return (
    <YStack gap="$1">
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <YStack flex={1}>
          <Text fontSize={13} fontWeight="700" color="$text" numberOfLines={1}>{titulo}</Text>
          {!!subtitulo && <Text fontSize={10} color="$textMuted" numberOfLines={1}>{subtitulo}</Text>}
        </YStack>
        <Text fontSize={13} fontWeight="800" color="$text">{valor}</Text>
      </XStack>
      <View height={10} borderRadius={6} backgroundColor="$backgroundHover" overflow="hidden">
        <View height={10} borderRadius={6} width={`${Math.max(3, Math.min(100, pct))}%`} backgroundColor={color} />
      </View>
      {!!pie && <Text fontSize={10} color="$textMuted">{pie}</Text>}
    </YStack>
  )
}

const AZUL_COSTO = '#0ea5e9'
const TOP_ACTIVOS = 15

// ════════ MTTR (Mean Time To Repair) ════════
// El MISMO indicador en dos cortes: por mecánico (va en la pestaña Tiempos) y por
// modelo de máquina (en Activos). El SP devuelve las mismas columnas para los dos.
//
// MTTR = del inicio de la reparación a su cierre, con las pausas dentro (esperar un
// repuesto es parte de lo que tardó) pero SIN el tramo reporte → inicio (eso es
// despacho) ni la espera del reproceso (el rato que el ticket pasa completado hasta
// que producción lo rechaza). Ese último descuento lo hace el SP y es lo que evita
// culpar al mecánico de la demora de quien valida.
//
// Con menos de estas reparaciones el promedio no describe nada: la fila se muestra
// igual pero atenuada y fuera del ranking.
const MTTR_MIN_REP = 3
const TOP_MTTR = 12
const ROJO_MTTR = '#b91c1c'
const VERDE_MTTR = '#22c55e'

function BloqueMttr({
  desde,
  hasta,
  agrupar,
}: {
  desde: string
  hasta: string
  agrupar: 'MECANICO' | 'MODELO'
}) {
  const [filas, setFilas] = useState<IMttr[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      try {
        const resp = await ticketsService.getMttr(desde, hasta, agrupar)
        if (vivo) setFilas(resp.Success && resp.Data ? resp.Data : [])
      } catch {
        if (vivo) setFilas([])
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [desde, hasta, agrupar])

  const porMecanico = agrupar === 'MECANICO'
  const titulo = porMecanico ? '🔧 MTTR por mecánico' : '🔧 MTTR por modelo de máquina'

  // Los totales del período vienen denormalizados en cada fila (iguales en todas).
  const global = filas[0]?.MttrGlobalMin ?? 0
  const totalRep = filas[0]?.ReparacionesTotal ?? 0
  const confiables = useMemo(() => filas.filter(f => f.Reparaciones >= MTTR_MIN_REP), [filas])
  const ranking = useMemo(() => confiables.slice(0, TOP_MTTR), [confiables])
  const escasos = filas.length - confiables.length
  const maxMttr = ranking.length ? Math.max(...ranking.map(f => f.MttrMin), 1) : 1
  const conReproceso = filas.reduce((a, f) => a + f.ConReproceso, 0)

  if (cargando)
    return (
      <YStack height={140} alignItems="center" justifyContent="center">
        <Spinner size="large" color={ACCENT} />
      </YStack>
    )

  if (!filas.length)
    return (
      <SectionCard titulo={titulo} ejeX="Del inicio de la reparación a su cierre">
        <Text fontSize={12} color="$textMuted">No hay reparaciones cerradas en este período.</Text>
      </SectionCard>
    )

  return (
    <YStack gap="$3">
      <XStack flexWrap="wrap" gap="$2">
        <KpiCard titulo="MTTR del período" valor={`${global.toLocaleString()} min`} />
        <KpiCard titulo="Reparaciones" valor={totalRep.toLocaleString()} />
        <KpiCard titulo="Reprocesadas" valor={conReproceso.toLocaleString()} />
      </XStack>

      <SectionCard
        titulo={titulo}
        ejeX={`Inicio → cierre, sin la espera del reproceso · promedio ${global.toLocaleString()} min`}
      >
        {!ranking.length ? (
          <Text fontSize={12} color="$textMuted">
            Nadie alcanza {MTTR_MIN_REP} reparaciones en el período.
          </Text>
        ) : (
          <YStack gap="$3">
            {ranking.map(f => {
              // Verde a quien tarda menos que el promedio del equipo: el MTTR no
              // tiene meta configurada, así que la referencia es el propio período.
              const bajoPromedio = global > 0 && f.MttrMin <= global
              const pie = [
                f.MttrMedianaMin != null ? `mediana ${f.MttrMedianaMin.toLocaleString()} min` : null,
                f.NetoPromMin > 0 ? `neto ${f.NetoPromMin.toLocaleString()} min` : null,
                f.ConReproceso > 0 ? `${f.ConReproceso} reproceso${f.ConReproceso === 1 ? '' : 's'}` : null,
                f.RepMas24h > 0 ? `⚠ ${f.RepMas24h} de +24 h` : null,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <BarraActivo
                  key={f.Clave ?? f.Nombre ?? String(f.MttrMin)}
                  titulo={f.Nombre || f.Clave || '—'}
                  // El denominador que le da sentido al promedio, distinto en cada
                  // corte: la variedad que atiende el mecánico, o en cuántas máquinas
                  // del modelo se repartieron esas reparaciones.
                  subtitulo={
                    `${f.Reparaciones} ${f.Reparaciones === 1 ? 'reparación' : 'reparaciones'}` +
                    (porMecanico
                      ? ` · ${f.ModelosDistintos} ${f.ModelosDistintos === 1 ? 'modelo' : 'modelos'}`
                      : ` · ${f.MaquinasDistintas} ${f.MaquinasDistintas === 1 ? 'máquina' : 'máquinas'}`)
                  }
                  valor={`${f.MttrMin.toLocaleString()} min`}
                  pct={(f.MttrMin / maxMttr) * 100}
                  color={bajoPromedio ? VERDE_MTTR : ROJO_MTTR}
                  pie={pie || undefined}
                />
              )
            })}
          </YStack>
        )}
        {/* Nada se recorta en silencio: si quedaron filas fuera, se dice cuántas. */}
        {escasos > 0 && (
          <Text fontSize={10} color="$textMuted" marginTop="$2">
            {escasos === 1 ? 'Hay 1 fila con' : `Hay ${escasos} filas con`} menos de {MTTR_MIN_REP} reparaciones: no
            entran al ranking porque con tan pocos casos el promedio no describe nada.
          </Text>
        )}
        {confiables.length > TOP_MTTR && (
          <Text fontSize={10} color="$textMuted" marginTop="$1">
            Se muestran los {TOP_MTTR} más lentos de {confiables.length}.
          </Text>
        )}
      </SectionCard>
    </YStack>
  )
}

function TabActivos({ desde, hasta }: { desde: string; hasta: string }) {
  const [activos, setActivos] = useState<IActivoPeriodo[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      try {
        const resp = await ticketsService.getActivos(desde, hasta)
        if (vivo) setActivos(resp.Success && resp.Data ? resp.Data : [])
      } catch {
        if (vivo) setActivos([])
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [desde, hasta])

  // El SP ya viene ordenado por minutos; el costo lo reordenamos y filtramos > 0.
  const porMinutos = useMemo(() => activos.filter(a => a.MinNetos > 0).slice(0, TOP_ACTIVOS), [activos])
  const porCosto = useMemo(
    () => activos.filter(a => a.CostoTotal > 0).sort((a, b) => b.CostoTotal - a.CostoTotal).slice(0, TOP_ACTIVOS),
    [activos],
  )
  const maxMin = porMinutos.length ? porMinutos[0].MinNetos : 1
  const maxCosto = porCosto.length ? porCosto[0].CostoTotal : 1

  return (
    <YStack gap="$3">
      {cargando ? (
        <YStack height={160} alignItems="center" justifyContent="center">
          <Spinner size="large" color={ACCENT} />
        </YStack>
      ) : (
        <>
          <SectionCard titulo="🕒 Máquinas con más minutos" ejeX="Minutos de mantenimiento en el período">
            {porMinutos.length === 0 ? (
              <Text fontSize={12} color="$textMuted">No hay minutos de mantenimiento en este período.</Text>
            ) : (
              <YStack gap="$3">
                {porMinutos.map(a => (
                  <BarraActivo
                    key={`m-${a.NumeroMaquina}`}
                    titulo={a.Modelo || a.NumeroMaquina || '—'}
                    subtitulo={subActivo(a)}
                    valor={`${a.MinNetos.toLocaleString()} min`}
                    pct={(a.MinNetos / maxMin) * 100}
                    color={ACCENT}
                    pie={`${a.TicketsCount} ${a.TicketsCount === 1 ? 'ticket' : 'tickets'}`}
                  />
                ))}
              </YStack>
            )}
          </SectionCard>

          <SectionCard titulo="💰 Mayor costo de repuestos" ejeX="Costo de repuestos (Lempiras) en el período">
            {porCosto.length === 0 ? (
              <Text fontSize={12} color="$textMuted">No hay costo de repuestos registrado en este período.</Text>
            ) : (
              <YStack gap="$3">
                {porCosto.map(a => (
                  <BarraActivo
                    key={`c-${a.NumeroMaquina}`}
                    titulo={a.Modelo || a.NumeroMaquina || '—'}
                    subtitulo={subActivo(a)}
                    valor={fmtLps(a.CostoTotal)}
                    pct={(a.CostoTotal / maxCosto) * 100}
                    color={AZUL_COSTO}
                    pie={`${a.RepuestosCount} ${a.RepuestosCount === 1 ? 'repuesto' : 'repuestos'}`}
                  />
                ))}
              </YStack>
            )}
          </SectionCard>
        </>
      )}

      {/* Mismo indicador que en Tiempos, cortado por modelo: aquí la pregunta no es
          quién tarda más, sino qué modelo de máquina cuesta más reparar. */}
      <BloqueMttr desde={desde} hasta={hasta} agrupar="MODELO" />
    </YStack>
  )
}

// ════════ TAB: Detalle ════════
const DETALLE_PAGINA = 30

function TabDetalle({ registros }: any) {
  const [visibles, setVisibles] = useState(DETALLE_PAGINA)

  // Reiniciar la paginación cuando cambian los registros (filtros, período).
  useEffect(() => {
    setVisibles(DETALLE_PAGINA)
  }, [registros])

  const mostrados = registros.slice(0, visibles)
  const hayMas = visibles < registros.length

  return (
    <YStack gap="$2">
      <Text fontSize={15} fontWeight="700" color="$text">
        📋 Detalle de Tickets ({registros.length})
      </Text>
      {mostrados.map((r: any, i: number) => (
        <YStack
          key={r.IDMantenimiento || i}
          backgroundColor="$card2"
          borderWidth={1}
          borderColor="$border"
          borderRadius="$3"
          padding="$3"
          gap="$1"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize={13} fontWeight="700" color="$text">
              {r.CodigoTicket || '—'}
            </Text>
            <View
              paddingHorizontal="$2"
              paddingVertical={2}
              borderRadius={6}
              backgroundColor={colorEstado(r.Estado) + '22'}
            >
              <Text fontSize={10} fontWeight="700" color={colorEstado(r.Estado)}>
                {r.Estado || 'Sin estado'}
              </Text>
            </View>
          </XStack>
          <Text fontSize={11} color="$text">
            {(r.Fecha ?? '').slice(0, 10)} · {r.Area} · {r.TipoFalla}
          </Text>
          <XStack gap="$3" flexWrap="wrap">
            <Text fontSize={11} color="$textMuted">
              Máquina: {r.NumeroMaquina || '—'}
            </Text>
            <Text fontSize={11} color="$textMuted">
              Prioridad: {r.Prioridad || '—'}
            </Text>
            <Text fontSize={11} color="$textMuted">
              Mecánico: {r.Mecanico || '—'}
            </Text>
          </XStack>
        </YStack>
      ))}

      {hayMas && (
        <Button
          marginTop="$2"
          backgroundColor="$card2"
          borderWidth={1}
          borderColor="$border"
          onPress={() => setVisibles(v => v + DETALLE_PAGINA)}
        >
          <Text fontSize={13} fontWeight="700" color={ACCENT}>
            Ver más ({registros.length - visibles} restantes)
          </Text>
        </Button>
      )}
    </YStack>
  )
}
