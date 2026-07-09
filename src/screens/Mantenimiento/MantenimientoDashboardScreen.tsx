
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, Button, useTheme } from 'tamagui'
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts'
import { RefreshCw } from 'lucide-react-native'

import { usePageHeader } from '../../hooks/usePageHeader'
import AppSelect from '../../components/commons/AppSelect'
import { ticketsService } from '../../api/modules/mantenimiento/tickets.service'
import { MantenimientoPeriodo } from '../../api/modules/sharepoint/mantenimiento.types'
import {
  ACCENT,
  MESES,
  FILTROS_FINOS_DEFAULT,
  FiltrosFinos,
  ESCALA_AZUL,
  ESCALA_NARANJA,
  ESCALA_VERDE,
  ESCALA_ROJA,
  aplicarFiltrosFinos,
  calcularKpis,
  conteoArea,
  conteoEstado,
  conteoPrioridad,
  conteoTipoParo,
  colorEstado,
  colorPrioridad,
  tendenciaPorDia,
  topN,
} from './mantenimiento.helpers'
import { FiltrosColapsables, HBarList, KpiCard, SectionCard, TabBar } from './components'

const TABS = ['📊 Resumen', '📈 Análisis', '🏆 Rankings', '📋 Detalle']

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

  // Período (se resuelve contra el backend). semana=0 ⇒ mes completo.
  const [anio, setAnio] = useState<number | undefined>(undefined)
  const [mes, setMes] = useState<number | undefined>(undefined)
  const [semana, setSemana] = useState<number>(0)

  // Filtros finos (en cliente, sobre los registros del período).
  const [filtros, setFiltros] = useState<FiltrosFinos>(FILTROS_FINOS_DEFAULT)
  const [tab, setTab] = useState(0)
  // Toggle Máquina/Área (en cliente, sobre TipoDestino de los registros).
  const [tipoDest, setTipoDest] = useState<'Todos' | 'MAQUINA' | 'AREA'>('Todos')

  const fetchData = useCallback(
    async (params?: { anio?: number; mes?: number; semana?: number }) => {
      setError(null)
      try {
        const resp = await ticketsService.getDashboard(params)
        if (!resp.Success || !resp.Data) {
          throw new Error(resp.ErrorMessage || 'No se pudo cargar la información.')
        }
        setData(resp.Data)
        setAnio(resp.Data.Anio)
        setMes(resp.Data.Mes)
        setSemana(resp.Data.Semana ?? 0)
      } catch (e: any) {
        setError(e?.message ?? 'Error al conectar con el servidor.')
      }
    },
    [],
  )

  useEffect(() => {
    ;(async () => {
      setCargando(true)
      await fetchData()
      setCargando(false)
    })()
  }, [fetchData])

  // Cambiar año/mes/semana ⇒ recarga desde el backend.
  const cambiarPeriodo = useCallback(
    async (p: { anio?: number; mes?: number; semana?: number }) => {
      setCargando(true)
      setFiltros(FILTROS_FINOS_DEFAULT)
      await fetchData({
        anio: p.anio ?? anio,
        mes: p.mes ?? mes,
        semana: p.semana ?? semana,
      })
      setCargando(false)
    },
    [anio, mes, semana, fetchData],
  )

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await fetchData({ anio, mes, semana })
    setRefrescando(false)
  }, [anio, mes, semana, fetchData])

  // ── Datos derivados ──
  const registros = useMemo(() => {
    const base = data ? aplicarFiltrosFinos(data.Registros, filtros) : []
    return tipoDest === 'Todos' ? base : base.filter(r => r.TipoDestino === tipoDest)
  }, [data, filtros, tipoDest])
  const kpis = useMemo(() => calcularKpis(registros), [registros])
  const estado = useMemo(() => conteoEstado(registros), [registros])
  const prioridad = useMemo(() => conteoPrioridad(registros), [registros])
  const areas = useMemo(() => conteoArea(registros), [registros])
  const tiposParo = useMemo(() => conteoTipoParo(registros), [registros])
  const topMecanicos = useMemo(() => topN(registros, r => r.Mecanico), [registros])
  const topFallas = useMemo(() => topN(registros, r => r.TipoFalla), [registros])
  const tendencia = useMemo(() => tendenciaPorDia(registros), [registros])

  // ── Opciones de filtros ──
  const opcAnios = (data?.Filtros.Anios ?? [anio ?? 0]).map(a => ({
    label: String(a),
    value: String(a),
  }))
  const opcMeses = Object.entries(MESES).map(([k, v]) => ({ label: v, value: k }))
  const opcSemanas = [
    { label: 'Todas', value: '0' },
    ...(data?.Filtros.Semanas ?? []).map(s => ({ label: `Sem ${s}`, value: String(s) })),
  ]
  const opcAreas = [
    { label: 'Todas', value: 'Todas' },
    ...(data?.Filtros.Areas ?? []).map(a => ({ label: a, value: a })),
  ]
  const opcPrioridades = [
    { label: 'Todas', value: 'Todas' },
    ...(data?.Filtros.Prioridades ?? []).map(p => ({ label: p, value: p })),
  ]
  const opcTiposParo = [
    { label: 'Todos', value: 'Todos' },
    ...(data?.Filtros.TiposParo ?? []).map(t => ({ label: t, value: t })),
  ]

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
        <Button backgroundColor={ACCENT} color="white" onPress={() => cambiarPeriodo({})}>
          Reintentar
        </Button>
      </YStack>
    )
  }

  const periodoTxt = `${MESES[mes ?? 1]} ${anio ?? ''}` + (semana ? ` · Semana ${semana}` : '')

  return (
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />
      }
    >
      <YStack padding="$4" gap="$3">
        {/* ── Encabezado ── */}
        <YStack>
          <Text fontSize={18} fontWeight="800" color="$text">
            🔧 Dashboard de Mantenimiento
          </Text>
          <Text fontSize={12} color="$text">
            📅 {periodoTxt} · {filtros.area} · {filtros.prioridad} ·{' '}
            <Text fontWeight="700">{registros.length}</Text> registros
          </Text>
        </YStack>

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

        {/* ── Filtros colapsables (acordeón, como Python móvil) ── */}
        <FiltrosColapsables resumen={periodoTxt}>
          <XStack gap="$2">
            <View flex={1}>
              <AppSelect
                label="Año"
                value={anio ? String(anio) : undefined}
                options={opcAnios}
                onValueChange={v => cambiarPeriodo({ anio: Number(v) })}
              />
            </View>
            <View flex={1.2}>
              <AppSelect
                label="Mes"
                value={mes ? String(mes) : undefined}
                options={opcMeses}
                onValueChange={v => cambiarPeriodo({ mes: Number(v) })}
              />
            </View>
            <View flex={1.2}>
              <AppSelect
                label="Semana"
                value={String(semana)}
                options={opcSemanas}
                onValueChange={v => cambiarPeriodo({ semana: Number(v) })}
              />
            </View>
          </XStack>
          <XStack gap="$2" alignItems="flex-end">
            <View flex={1}>
              <AppSelect
                label="Área"
                value={filtros.area}
                options={opcAreas}
                onValueChange={v => setFiltros(f => ({ ...f, area: String(v) }))}
              />
            </View>
            <View flex={1}>
              <AppSelect
                label="Prioridad"
                value={filtros.prioridad}
                options={opcPrioridades}
                onValueChange={v => setFiltros(f => ({ ...f, prioridad: String(v) }))}
              />
            </View>
            <View flex={1}>
              <AppSelect
                label="Tipo de Paro"
                value={filtros.tipoParo}
                options={opcTiposParo}
                onValueChange={v => setFiltros(f => ({ ...f, tipoParo: String(v) }))}
              />
            </View>
            <Button
              marginTop="$2"
              height={40}
              width={40}
              padding={0}
              backgroundColor={ACCENT}
              onPress={onRefresh}
              disabled={refrescando}
            >
              <RefreshCw size={18} color="white" />
            </Button>
          </XStack>
        </FiltrosColapsables>

        {/* ── Tabs ── */}
        <TabBar tabs={TABS} activo={tab} onChange={setTab} />

        {cargando ? (
          <YStack height={200} alignItems="center" justifyContent="center">
            <Spinner size="large" color={ACCENT} />
          </YStack>
        ) : registros.length === 0 ? (
          <YStack height={160} alignItems="center" justifyContent="center">
            <Text color="$textMuted" fontSize={13}>
              No hay registros para los filtros seleccionados.
            </Text>
          </YStack>
        ) : (
          <>
            {tab === 0 && (
              <TabResumen
                kpis={kpis}
                estado={estado}
                prioridad={prioridad}
                chartWidth={chartWidth}
              />
            )}
            {tab === 1 && (
              <TabAnalisis
                areas={areas}
                tiposParo={tiposParo}
                tendencia={tendencia}
                chartWidth={chartWidth}
              />
            )}
            {tab === 2 && <TabRankings topMecanicos={topMecanicos} topFallas={topFallas} />}
            {tab === 3 && <TabDetalle registros={registros} />}
          </>
        )}
      </YStack>
    </ScrollView>
  )
}

// ════════ TAB: Resumen ════════
function TabResumen({ kpis, estado, prioridad, chartWidth }: any) {
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

// ════════ TAB: Análisis ════════
function TabAnalisis({ areas, tiposParo, tendencia, chartWidth }: any) {
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
