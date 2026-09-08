import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, useWindowDimensions } from 'react-native'
import { YStack, XStack, Text, View, Button, useTheme } from 'tamagui'
import { BarChart } from 'react-native-gifted-charts'
import { Building2, ChevronDown, ChevronLeft, ChevronRight, Factory, Layers } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import { SkeletonBox } from '../../components/Skeletons/SkeletonList'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeBudgetDashboard,
  IOvertimeBudgetEmployee,
  IOvertimeBudgetRow,
  IOvertimeConceptTotal,
  IOvertimeDayTotal,
  IPayWebWeek,
} from '../../api/modules/overtime/overtime.types'
import { BarraApilada } from '../Mantenimiento/components'
import { shadows } from '../../theme/shadows'
import { ACCENT } from '../Mantenimiento/mantenimiento.helpers'
import {
  DistribucionHoras,
  colorConcepto,
  fmtHoras,
  nombreConCodigo,
  parseConceptos,
} from './Overtime.utils'

// Dashboard de PRESUPUESTO de horas extra.
//
// Responde una sola pregunta: cuánto del presupuesto de cada área se lleva
// gastado en la semana. Por eso el número que manda es dinero y no horas —las
// horas están, pero como apoyo.
//
// Cuenta SOLO lo aprobado por todas las entidades. Lo pedido pero sin firmar no
// compromete presupuesto: contarlo inflaría el consumo con solicitudes que
// quizá terminen rechazadas, y este tablero se usa para decidir si se autorizan
// más horas.
//
// Tocar un área abre el desglose de sus empleados. La barra es el "cuánto"; el
// diálogo es el "quién", que es lo que hace falta para actuar.
//
// QUÉ SE VE Y QUÉ NO
//
// Solo las áreas que el usuario tiene configuradas en sus parámetros
// (OT_AUTH_AREAS), y eso lo resuelve el procedimiento, no esta pantalla. Quien
// administra un departamento ve el presupuesto de SUS centros de costo, no el
// de toda su unidad de negocios, aunque la unidad aparezca como agrupador.
//
// Los tres niveles vienen en una sola llamada: son pestañas del mismo período y
// pedirlos por separado dejaría cada una mirando un momento distinto.
//

const TABS = [
  { key: 'unidad', label: 'Unidades de negocio', Icono: Building2 },
  { key: 'departamento', label: 'Departamentos', Icono: Layers },
  { key: 'centro', label: 'Centros de costo', Icono: Factory },
] as const

type TabKey = (typeof TABS)[number]['key']

/** Cómo se llama cada nivel del otro lado. */
const NIVEL_API: Record<TabKey, string> = {
  unidad: 'businessUnit',
  departamento: 'department',
  centro: 'costCenter',
}

/**
 * Cómo se llama cada nivel para el usuario.
 *
 * Las tres pestañas se ven casi iguales —barras con códigos— y sin decir qué
 * se está mirando es fácil creer que se está viendo otro nivel. Va en el pie
 * del gráfico y en el encabezado del desglose, que es donde se pierde el
 * contexto de la pestaña.
 */
const NIVEL_LABEL: Record<TabKey, string> = {
  unidad: 'Unidad de negocios',
  departamento: 'Departamentos',
  centro: 'Centro de costos',
}

/**
 * Etiqueta de una barra: el CÓDIGO.
 *
 * Se probó con el nombre y quedó peor: debajo de una barra de 38px caben unos
 * pocos caracteres, así que 'COSTURA DENIM' y 'COSTURA DRILL' se recortaban al
 * mismo 'COSTURA D…' y dejaban de distinguirse. El código es corto y único, y
 * el nombre completo está en el detalle de abajo y en el desglose.
 */
const etiquetaArea = (fila: IOvertimeBudgetRow): string => fila.Codigo || '—'

/** Semáforo del consumo. Por encima del 100% ya no es "atención", es rojo. */
const colorConsumo = (pct: number): string => {
  if (pct >= 100) return '#DC2626'
  if (pct >= 85) return '#F59E0B'
  return '#16A34A'
}

/** Lempiras sin decimales: en un tablero el centavo es ruido. */
const fmtDinero = (valor: number | null | undefined): string => {
  const n = Number(valor ?? 0)
  return `L ${Math.round(n).toLocaleString('es-HN')}`
}

const fmtPct = (pct: number | null | undefined) => `${Math.round(Number(pct ?? 0))}%`

/** 'Sem 33 · 11/08 - 17/08' */
const etiquetaSemana = (w: IPayWebWeek): string => {
  const corta = (iso: string | null) => (iso ? iso.substring(0, 10).split('-').reverse().slice(0, 2).join('/') : '')
  return `Sem ${w.WeekNumber} · ${corta(w.InitialDate)} - ${corta(w.FinalDate)}`
}

const claveSemana = (w: IPayWebWeek) => `${w.Year}-${w.WeekNumber}`

// Medidas de las barras. El ancho del gráfico se calcula a partir de ellas y
// NO del ancho de la pantalla: con 12 áreas hacen falta ~670px y el teléfono
// tiene 360, así que el gráfico va dentro de un ScrollView horizontal. Sin
// esto las barras se salen del lienzo y no se ve ninguna.
const BAR_W = 38
const BAR_SPACING = 24
const BAR_INITIAL = 20

/**
 * Tope de la escala. Un área desbordada al 600% aplastaría a todas las demás
 * contra el piso, así que la BARRA se recorta acá; el número de encima sigue
 * siendo el real.
 */
const ESCALA_TOPE = 200

/** Alto del lienzo del gráfico. */
const CHART_H = 180

/**
 * NOTA: se intentó meter el porcentaje DENTRO de la barra con un marginBottom
 * negativo, para que quedara pegado. No funcionó —la librería posiciona la
 * etiqueta por su cuenta y el margen no la mueve— y el número terminaba peor
 * que antes. Va encima, simple, que es como se veía bien.
 */

/**
 * Gris del riel: lo que FALTA por gastar.
 *
 * Estaba puesto '$backgroundHover', que este tema no define — se resolvía a
 * transparente y el riel no se veía: solo aparecía la parte de color y no había
 * contra qué compararla.
 */
const PISTA = '$textDisabled'

/**
 * La barra se dibuja sobre una escala de 0 a 150 para que pasarse del
 * presupuesto SE VEA en lugar de toparse contra el borde. Por eso el 100% cae
 * en los dos tercios del ancho.
 */
const ESCALA_BARRA = 150
const MARCA_100 = `${(100 / ESCALA_BARRA) * 100}%`

/** Porcentaje del riel que ocupa un consumo dado. */
const anchoBarra = (pct: number) => `${(Math.min(Math.max(pct, 0), ESCALA_BARRA) / ESCALA_BARRA) * 100}%`

export default function DashboardHorasExtraScreen() {
  const { defaultCompany } = useAuth()
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const chartWidth = width - 90 // ancho de pantalla menos paddings de página + tarjeta

  const companyCode = defaultCompany?.Code ?? ''

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  const [data, setData] = useState<IOvertimeBudgetDashboard | null>(null)
  const [semanas, setSemanas] = useState<IPayWebWeek[]>([])
  const [semana, setSemana] = useState<string>('')
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [tab, setTab] = useState(0)

  // Área abierta en el desglose. null = diálogo cerrado.
  const [areaAbierta, setAreaAbierta] = useState<IOvertimeBudgetRow | null>(null)
  const [empleados, setEmpleados] = useState<IOvertimeBudgetEmployee[]>([])
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false)
  const [errorEmpleados, setErrorEmpleados] = useState<string>('')

  const tabKey: TabKey = TABS[tab]?.key ?? 'unidad'

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Presupuesto de Horas Extra
      </Text>
    ),
    right: <NotificationBell size={18} />,
  })

  // Última semana con la que se pidieron datos. Evita que el efecto del
  // selector vuelva a pedir lo que la recarga completa acaba de traer.
  const semanaCargadaRef = useRef<string>('')

  // ── Semanas ───────────────────────────────────────────────────────────────
  /**
   * El calendario de PLANILLA, no el natural: la semana de horas extra la
   * define ese calendario y es la misma que filtra las pantallas web.
   *
   * LANZA si falla, y eso es el punto. Antes se tragaba el error —una respuesta
   * con Success en false dejaba la lista vacía sin avisar—, la semana nunca se
   * elegía, el efecto de datos se cortaba en seco y la pantalla quedaba en el
   * esqueleto para siempre. Sin error visible no había ni botón de reintentar
   * ni forma de deslizar, porque el esqueleto reemplaza a la lista.
   *
   * Devuelve la lista y la semana elegida para que quien llama siga de largo
   * sin esperar a que el estado se propague.
   */
  const loadSemanas = useCallback(async () => {
    if (!companyCode) return { lista: [] as IPayWebWeek[], elegida: null as IPayWebWeek | null }

    const res = await overtimeService.getCalendarWeeks(companyCode)

    if (!res?.Success) {
      throw new Error(res?.ErrorMessage || 'No se pudo cargar el calendario de semanas.')
    }

    const lista = res.Data ?? []
    setSemanas(lista)

    // Se conserva la semana elegida si sigue existiendo; si no, la que está en
    // curso, que es "lo que llevo gastado" hoy.
    const previa = lista.find(w => claveSemana(w) === semanaCargadaRef.current)
    const elegida = previa ?? lista.find(w => w.IsCurrentWeek) ?? lista[lista.length - 1] ?? null

    setSemana(elegida ? claveSemana(elegida) : '')

    return { lista, elegida }
  }, [companyCode])

  const semanaSel = useMemo(
    () => semanas.find(w => claveSemana(w) === semana) ?? null,
    [semanas, semana],
  )

  // ── Datos ─────────────────────────────────────────────────────────────────
  /**
   * La semana viaja como argumento y no se lee del estado: así esta función no
   * depende de `semanaSel` y su identidad no cambia con cada selección, que es
   * lo que hacía que el efecto de foco se disparara de más.
   */
  const loadData = useCallback(
    async (sem: IPayWebWeek | null) => {
      if (!companyCode) return

      const res = await overtimeService.getBudgetDashboard(
        companyCode,
        sem?.InitialDate?.substring(0, 10),
        sem?.FinalDate?.substring(0, 10),
      )

      if (!res?.Success || !res.Data) {
        throw new Error(res?.ErrorMessage || 'No se pudo cargar el presupuesto.')
      }

      setData(res.Data)
      semanaCargadaRef.current = sem ? claveSemana(sem) : ''
    },
    [companyCode],
  )

  /**
   * Recarga COMPLETA: calendario y tablero, encadenados y con un solo manejador
   * de error.
   *
   * Encadenados y no en paralelo porque el segundo necesita el rango que
   * devuelve el primero. Y con un solo catch para que cualquiera de los dos que
   * falle deje la pantalla en estado de error —con su botón de reintentar— en
   * lugar de a medio cargar.
   */
  const recargarTodo = useCallback(async () => {
    if (!companyCode) return
    setError(null)

    try {
      const { elegida } = await loadSemanas()
      await loadData(elegida)
    } catch (err) {
      setError(handleError(err))
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
  }, [companyCode, loadSemanas, loadData])

  /**
   * Se recarga TODO cada vez que se entra a la pantalla, no solo al montarla.
   *
   * La navegación deja la pantalla montada, así que sin esto el tablero se
   * quedaba con los números de la primera visita. Entre una entrada y otra
   * alguien pudo haber aprobado horas, y un presupuesto que muestra el estado de
   * hace media hora induce justo al error que este tablero existe para evitar.
   *
   * Como `recargarTodo` solo depende de companyCode, esto corre al enfocar y no
   * en cada cambio de estado interno.
   */
  useFocusEffect(
    useCallback(() => {
      setCargando(true)
      recargarTodo()
    }, [recargarTodo]),
  )

  // Cambiar de semana pide solo el tablero: el calendario no cambió. El ref
  // evita repetir la consulta que recargarTodo acaba de hacer.
  useEffect(() => {
    if (!semana || semana === semanaCargadaRef.current) return

    let vigente = true
    setCargando(true)
    setError(null)

    loadData(semanaSel)
      .catch(err => { if (vigente) setError(handleError(err)) })
      .finally(() => { if (vigente) setCargando(false) })

    return () => { vigente = false }
  }, [semana, semanaSel, loadData])

  /** Deslizar hacia abajo rehace exactamente lo mismo que entrar a la pantalla. */
  const onRefresh = useCallback(() => {
    setRefrescando(true)
    recargarTodo()
  }, [recargarTodo])

  // ── Filas del nivel activo ────────────────────────────────────────────────
  const filas: IOvertimeBudgetRow[] = useMemo(() => {
    if (!data) return []
    if (tabKey === 'departamento') return data.Departamentos
    if (tabKey === 'centro') return data.CentrosCosto
    return data.UnidadesNegocio
  }, [data, tabKey])

  // Ordenadas por consumo, que es el orden en que hay que mirarlas. La MISMA
  // lista alimenta el gráfico y el detalle, así que el índice de una barra
  // apunta siempre a la fila correcta al tocarla.
  const filasOrdenadas = useMemo(
    () => [...filas].sort((a, b) => b.Porcentaje_Consumido - a.Porcentaje_Consumido),
    [filas],
  )

  // Hasta 12 barras: más de eso no se lee en un teléfono.
  const filasGraficadas = useMemo(() => filasOrdenadas.slice(0, 12), [filasOrdenadas])

  /**
   * Techo del eje. Se calcula ANTES que las barras porque cada barra necesita
   * saberlo para medirse en píxeles y decidir dónde va su número.
   *
   * Llega al menos a 100 para que el presupuesto sea la referencia visual, y
   * sube cuando alguien se pasó.
   *
   * El aire de arriba es para las etiquetas que NO caben adentro: sin él, una
   * barra chica que pone su número encima lo empujaría fuera del lienzo.
   */
  const maxEje = useMemo(() => {
    const mayor = Math.max(100, ...filasGraficadas.map(f =>
      Math.min(Math.round(f.Porcentaje_Consumido), ESCALA_TOPE)))
    return Math.ceil((mayor * 1.08) / 10) * 10
  }, [filasGraficadas])

  const barras = useMemo(
    () =>
      filasGraficadas.map(f => {
        const pct = Math.round(f.Porcentaje_Consumido)

        return {
          value: Math.min(pct, ESCALA_TOPE),
          label: etiquetaArea(f),
          frontColor: colorConsumo(f.Porcentaje_Consumido),

          // El valor de la barra va recortado en ESCALA_TOPE, pero el número
          // es SIEMPRE el real: recortar la barra es una decisión de escala,
          // mentir sobre el porcentaje sería otra cosa.
          topLabelComponent: () => (
            <Text fontSize={9} color="$textMuted" marginBottom={2}>
              {`${pct}%`}
            </Text>
          ),
        }
      }),
    [filasGraficadas],
  )

  const graphWidth = barras.length * (BAR_W + BAR_SPACING) + BAR_INITIAL

  // Con presupuesto y sin gasto todas las barras miden cero, que en pantalla es
  // indistinguible de un gráfico roto. Se dice con palabras.
  const sinGasto = barras.length > 0 && barras.every(b => b.value === 0)

  /**
   * Abre el desglose de un área.
   *
   * Se pide al abrir y no junto con el tablero: serían tantas consultas como
   * áreas y en la mayoría de las aperturas solo interesa una.
   */
  const abrirArea = useCallback(
    async (fila: IOvertimeBudgetRow) => {
      if (!companyCode || !fila.Codigo) return

      setAreaAbierta(fila)
      setEmpleados([])
      setErrorEmpleados('')
      setCargandoEmpleados(true)

      try {
        const res = await overtimeService.getBudgetEmployees(
          companyCode,
          fila.Codigo,
          NIVEL_API[tabKey],
          semanaSel?.InitialDate?.substring(0, 10),
          semanaSel?.FinalDate?.substring(0, 10),
        )

        // Una respuesta 200 con cuerpo vacío llega como null desde el cliente
        // HTTP. Sin esta guarda, leerle .Success revienta y el error que se ve
        // es el genérico de "algo pasó en la app", que no dice nada.
        if (!res) {
          setErrorEmpleados('El servidor respondió vacío al pedir el desglose del área.')
          return
        }

        if (!res.Success) {
          setErrorEmpleados(res.ErrorMessage || 'No se pudo cargar el desglose.')
          return
        }
        setEmpleados(res.Data ?? [])
      } catch (err: any) {
        // Al mensaje clasificado se le pega el crudo: sin él, un fallo que no
        // sea HTTP ni de red queda como 'ocurrió un error inesperado' y no hay
        // por dónde empezar a buscar.
        const clasificado = handleError(err)
        const crudo = String(err?.message ?? '').trim()

        setErrorEmpleados(
          crudo && !clasificado.message.includes(crudo)
            ? `${clasificado.message}(${crudo})`
            : clasificado.message,
        )
      } finally {
        setCargandoEmpleados(false)
      }
    },
    [companyCode, tabKey, semanaSel],
  )

  const cerrarArea = useCallback(() => {
    setAreaAbierta(null)
    setEmpleados([])
    setErrorEmpleados('')
  }, [])

  const sinAreas = !!data?.Sin_Areas_Configuradas

  // ── Render ────────────────────────────────────────────────────────────────
  /**
   * Esqueleto mientras se carga, tenga o no datos viejos en pantalla.
   *
   * Antes solo salía la primera vez y un cambio de semana no movía nada, así
   * que parecía que el toque no había hecho efecto. Una línea de texto que
   * dijera "Actualizando…" avisaba, pero dejaba a la vista los números de la
   * semana ANTERIOR como si fueran los nuevos.
   *
   * `refrescando` queda fuera a propósito: ahí el gesto de deslizar ya tiene su
   * propio indicador y tapar la pantalla con un esqueleto sería de más.
   */
  if (error) {
    return <ErrorState title={error.title} message={error.message} onRetry={onRefresh} />
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 12, paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
    >
      {/* Filtro de semana */}
      {semanas.length > 0 && (
        <SelectorSemana
          semanas={semanas}
          actual={semanaSel}
          onCambiar={w => setSemana(claveSemana(w))}
        />
      )}

      {/* El selector de semana NO se reemplaza por el esqueleto: es el control
          con el que se está pidiendo la carga, y esconderlo mientras responde
          deja al usuario sin saber qué semana quedó elegida. El esqueleto va
          debajo, que es lo que efectivamente cambia. */}
      {cargando && !refrescando ? (
        <EsqueletoTablero />
      ) : semanas.length === 0 ? (
        // Sin calendario no hay período que consultar. Antes esto quedaba como
        // un esqueleto eterno; ahora se dice y se puede reintentar deslizando.
        <EmptyState
          title="Sin calendario de semanas"
          message="No se pudo cargar el calendario de planilla, así que no hay semana que consultar. Deslizá hacia abajo para reintentar."
        />
      ) : sinAreas ? (
        <EmptyState
          title="Sin áreas asignadas"
          message="Todavía no tienes centros de costo configurados en tus parámetros de usuario, así que no hay presupuesto que mostrar. Pídeselo a quien administra los parámetros."
        />
      ) : (
        <>
          {/* ── Resumen del período ───────────────────────────────────────
              Cuatro tarjetas ocupaban media pantalla antes de llegar a lo que
              se viene a ver, que son las áreas. Los mismos números caben en dos
              tarjetas y una barra: cada tarjeta lleva su cifra grande y su
              contexto en chico. */}
          <XStack gap="$2">
            <ResumenCard
              titulo="GASTADO"
              valor={fmtDinero(data?.Total_Costo)}
              color={colorConsumo(data?.Total_Porcentaje_Consumido ?? 0)}
              badge={fmtPct(data?.Total_Porcentaje_Consumido)}
              pie={`de ${fmtDinero(data?.Total_Presupuesto)} · ${fmtHoras(data?.Total_Horas)}`}
            />
            <ResumenCard
              titulo={(data?.Total_Disponible ?? 0) < 0 ? 'EXCEDIDO' : 'DISPONIBLE'}
              valor={fmtDinero(Math.abs(data?.Total_Disponible ?? 0))}
              color={(data?.Total_Disponible ?? 0) < 0 ? '#DC2626' : undefined}
              pie={`${data?.Total_Empleados ?? 0} empleado(s) · ${data?.Total_Solicitudes ?? 0} solicitud(es)`}
            />
          </XStack>

          {/* La barra ya no necesita tarjeta propia con título y subtítulo: va
              suelta debajo de las cifras que explica. */}
          <BarraConsumo
            pct={data?.Total_Porcentaje_Consumido ?? 0}
            disponible={data?.Total_Disponible ?? 0}
          />

          {/* ── Reparto por concepto ──────────────────────────────────────
              La barra apilada se ve siempre —es una línea y dice lo esencial—
              y el detalle por banda se despliega. */}
          <RepartoConceptos conceptos={data?.Conceptos ?? []} totalHoras={data?.Total_Horas ?? 0} />

          {/* ── Cortes por nivel ──────────────────────────────────────────
              Pestañas, gráfico y detalle van dentro de UNA sola tarjeta con
              divisiones internas. Los tres responden a la misma pestaña, así
              que separarlos en tres tarjetas flotando sugería que eran bloques
              independientes; agrupados se lee que cambiar de pestaña cambia
              todo lo que está debajo. */}
          <YStack
            backgroundColor="$backgroundElevated"
            borderRadius="$4"
            overflow="hidden"
            {...shadows.sm}
          >
            <SelectorNivel activo={tab} onCambiar={setTab} />

            <Divisor />

            {filas.length === 0 ? (
              <YStack padding="$3">
                <Text fontSize={12} color="$textMuted" lineHeight={17}>
                  No hay horas extra aprobadas en tus áreas para esta semana.
                </Text>
              </YStack>
            ) : (
              <>
                <YStack padding="$3" gap="$2.5">
                  <Text fontSize={11} color="$textMuted" lineHeight={15}>
                  {sinGasto
                    ? 'Todavía no hay gasto aprobado en el período.'
                    : 'Porcentaje del presupuesto ya comprometido. Tocá una barra para ver los empleados.'}
                  </Text>

                  {sinGasto ? (
                    <Text fontSize={12} color="$textMuted" lineHeight={17}>
                      Tus áreas tienen presupuesto asignado pero todavía no hay horas extra
                      aprobadas esta semana, así que todas las barras irían en cero. Puede haber
                      solicitudes pendientes de firma: acá solo cuentan las que ya pasaron por
                      todas las entidades.
                    </Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <BarChart
                      data={barras}
                      width={Math.max(chartWidth, graphWidth)}
                      height={CHART_H}
                      barWidth={BAR_W}
                      spacing={BAR_SPACING}
                      initialSpacing={BAR_INITIAL}
                      noOfSections={4}
                      maxValue={maxEje}
                      yAxisTextStyle={{ fontSize: 10, color: muted }}
                      xAxisLabelTextStyle={{ fontSize: 9, color: muted }}
                      yAxisThickness={0}
                      xAxisThickness={1}
                      xAxisColor={grid}
                      rulesColor={grid}
                      rulesType="dashed"
                      // Alto propio para el número de encima: sin esto lo
                      // encajona la barra y se ve cortado.
                      // El índice apunta a filasGraficadas: las barras se
                      // construyen desde ahí y en el mismo orden.
                      onPress={(_item: any, index: number) => {
                        const fila = filasGraficadas[index]
                        if (fila) abrirArea(fila)
                      }}
                    />
                    </ScrollView>
                  )}

                  {!sinGasto && (
                    <Text fontSize={10} color="$textMuted" alignSelf="center">
                      {NIVEL_LABEL[tabKey]}
                    </Text>
                  )}
                </YStack>

                <Divisor />

                <YStack padding="$3" gap="$3">
                  <Text fontSize={11} color="$textMuted" lineHeight={15}>
                    Presupuesto y gasto de cada área. Tocá una para ver qué empleados lo están
                    consumiendo.
                  </Text>

                  {filasOrdenadas.map(f => (
                    <FilaArea key={`${f.Codigo}-${f.Nombre}`} fila={f} onPress={() => abrirArea(f)} />
                  ))}
                </YStack>
              </>
            )}
          </YStack>

          {/* ── Gasto día por día ─────────────────────────────────────────
              El total de la semana dice cuánto se gastó; esto dice cuándo. */}
          <GastoPorDia dias={data?.Dias ?? []} total={data?.Total_Costo ?? 0} ancho={chartWidth} />


        </>
      )}

      <DesgloseArea
        area={areaAbierta}
        nivel={NIVEL_LABEL[tabKey]}
        empleados={empleados}
        cargando={cargandoEmpleados}
        error={errorEmpleados}
        onCerrar={cerrarArea}
      />
    </ScrollView>
  )
}

// ── Gasto día por día ───────────────────────────────────────────────────────
//
// Las barras se miden contra el día MÁS CARO y no contra el presupuesto: acá
// se viene a ver el reparto de la semana, y contra el presupuesto semanal
// todas quedarían igual de chatas y no se distinguiría el día desbocado, que
// es justo lo que se busca.
function GastoPorDia({
  dias,
  total,
  ancho,
}: {
  dias: IOvertimeDayTotal[]
  total: number
  /** Ancho del lienzo, que ya calcula la pantalla para los otros gráficos. */
  ancho: number
}) {
  const maxCosto = dias.reduce((m, d) => Math.max(m, Number(d.Costo ?? 0)), 0)

  /**
   * El día cuyo desglose se está mirando.
   *
   * Arranca en null y cae al día MÁS CARO, que es el que motiva la pregunta
   * "¿quién gastó esto?". Se guarda el índice y no el día para no quedar
   * apuntando a un objeto viejo cuando cambia la semana.
   */
  const [diaSel, setDiaSel] = useState<number | null>(null)

  const indiceMayor = dias.findIndex(d => Number(d.Costo ?? 0) === maxCosto && maxCosto > 0)
  const dia = dias[diaSel ?? indiceMayor] ?? null

  /**
   * Tope del eje, un 20% por encima del día más caro.
   *
   * Sin esto la librería hace que la barra más alta llegue justo al techo del
   * lienzo, y el monto que va ENCIMA de esa barra queda fuera y se corta. El
   * aire de arriba es para la etiqueta, no para el dato.
   *
   * Se redondea hacia arriba a una cifra "limpia" para que el eje no quede con
   * números como 1,437: se busca la potencia de diez del valor y se sube al
   * siguiente múltiplo de la mitad de esa potencia.
   */
  const topeEje = (() => {
    if (maxCosto <= 0) return undefined

    const conAire = maxCosto * 1.2
    const escala = Math.pow(10, Math.floor(Math.log10(conAire)))
    const paso = escala / 2

    return Math.ceil(conAire / paso) * paso
  })()

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      gap="$2"
      {...shadows.sm}
    >
      <XStack alignItems="center" gap="$2">
        <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4} flex={1}>
          GASTO POR DÍA
        </Text>
        <Text fontSize={11} fontWeight="700" color="$text">
          {fmtDinero(total)}
        </Text>
      </XStack>

      {dias.length === 0 ? (
        <Text fontSize={11} color="$textMuted">
          Sin días en el período seleccionado.
        </Text>
      ) : maxCosto === 0 ? (
        // Siete barras en cero no dibujan nada y se ven igual que un gráfico
        // roto. Se dice con palabras, como en el gráfico de los cortes.
        <Text fontSize={12} color="$textMuted" lineHeight={17}>
          No hubo horas extra aprobadas ningún día de esta semana. Puede haber
          solicitudes pendientes de firma: acá solo cuentan las que ya pasaron por
          todas las entidades.
        </Text>
      ) : (
        // Mismo gráfico que los cortes por nivel, para que las dos lecturas de
        // la pantalla se vean iguales. Siete barras entran sin scroll, así que
        // el ancho se ajusta al lienzo en vez de calcularse por barra.
        <BarChart
          data={dias.map(d => ({
            value: Number(d.Costo ?? 0),
            label: diaCorto(d.Fecha),
            // Un solo color, el mismo de la banda del 25%: el tablero ya tiene
            // bastante color y acá no hay categorías que distinguir — son
            // siete días de lo mismo y lo que compara es el alto.
            frontColor: colorConcepto(0.25),
            topLabelComponent: () =>
              Number(d.Costo ?? 0) > 0 ? (
                <Text fontSize={8} color="$textMuted" marginBottom={2}>
                  {fmtDinero(d.Costo)}
                </Text>
              ) : null,
          }))}
          width={ancho}
          height={130}
          barWidth={Math.max(14, Math.floor((ancho - 40) / Math.max(dias.length, 1)) - 10)}
          spacing={10}
          initialSpacing={10}
          maxValue={topeEje}
          noOfSections={3}
          yAxisTextStyle={{ fontSize: 9, color: '#94A3B8' }}
          xAxisLabelTextStyle={{ fontSize: 9, color: '#94A3B8' }}
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor="#E2E8F0"
          rulesColor="#E2E8F0"
          rulesType="dashed"
          // Tocar una barra cambia el desglose de abajo. El índice apunta a
          // `dias` porque las barras se construyen desde ahí y en ese orden.
          onPress={(_item: any, index: number) => {
            if (Number(dias[index]?.Costo ?? 0) > 0) setDiaSel(index)
          }}
        />
      )}

      {/* Quién puso el gasto de ese día.
          El gráfico dice CUÁNTO y cuándo; esto dice dónde mirar. Los tres
          niveles van juntos y no anidados: el departamento que más gasta no
          siempre está dentro de la unidad que más gasta, y presentarlos como
          jerarquía sería afirmar algo que no siempre se cumple. */}
      {maxCosto > 0 && dia && (
        <YStack gap="$1.5" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
          <XStack alignItems="baseline" gap="$2">
            <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4} flex={1}>
              MAYOR GASTO DEL DÍA
            </Text>
            <Text fontSize={11} fontWeight="700" color="$text">
              {diaCorto(dia.Fecha)} {fechaCorta(dia.Fecha)}
            </Text>
          </XStack>

          {Number(dia.Costo ?? 0) === 0 ? (
            <Text fontSize={11} color="$textMuted">
              Ese día no tuvo horas extra aprobadas.
            </Text>
          ) : (
            [
              { nivel: 'Unidad', nombre: dia.Top_Unidad, costo: dia.Top_Unidad_Costo },
              { nivel: 'Departamento', nombre: dia.Top_Departamento, costo: dia.Top_Departamento_Costo },
              { nivel: 'Centro de costos', nombre: dia.Top_Centro, costo: dia.Top_Centro_Costo },
            ]
              .filter(f => !!f.nombre)
              .map(f => (
                <XStack key={f.nivel} alignItems="center" gap="$2">
                  <Text fontSize={10} color="$textMuted" width={92}>
                    {f.nivel}
                  </Text>
                  <Text fontSize={11} color="$text" numberOfLines={1} flex={1}>
                    {f.nombre}
                  </Text>
                  <Text fontSize={11} fontWeight="700" color="$text">
                    {fmtDinero(f.costo)}
                  </Text>
                  {/* Cuánto del día explica ese aportante: sin el porcentaje,
                      un monto grande no se distingue de 'fue el único'. */}
                  <Text fontSize={9} color="$textMuted" width={30} textAlign="right">
                    {Math.round((Number(f.costo ?? 0) / Number(dia.Costo || 1)) * 100)}%
                  </Text>
                </XStack>
              ))
          )}

          <Text fontSize={9} color="$textMuted">
            Tocá una barra para ver otro día.
          </Text>
        </YStack>
      )}
    </YStack>
  )
}

/**
 * La fecha, sin que el dispositivo la corra un día.
 *
 * `new Date('2026-08-25')` se interpreta como UTC y en Honduras se lee como el
 * 24 por la tarde: el gasto del martes aparecería el lunes. Partiendo el texto
 * y armando la fecha local eso no pasa.
 */
const fechaLocal = (valor: string): Date | null => {
  const [y, m, d] = String(valor ?? '').substring(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const diaCorto = (valor: string): string => {
  const d = fechaLocal(valor)
  return d ? DIAS_CORTOS[d.getDay()] : ''
}

const fechaCorta = (valor: string): string => {
  const d = fechaLocal(valor)
  if (!d) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Reparto de las horas por banda de recargo ───────────────────────────────
//
// La barra apilada es proporcional a las horas de cada banda: de un vistazo se
// ve si el período es casi todo al 25% o si carga sobre las bandas caras, que
// es lo que mueve el costo. Las filas dan el número exacto, porque una banda de
// 15 minutos queda como un hilo ilegible en la barra.
/**
 * Participación de un concepto sobre el total, en texto.
 *
 * No se redondea a entero como antes: con varias bandas, las chicas caían a
 * "0%" y parecían no existir. Debajo de 10 se muestra un decimal, y lo que no
 * llega ni a la décima sale como "<0.1%" en vez de cero.
 */
const fmtParte = (parte: number): string => {
  if (!Number.isFinite(parte) || parte <= 0) return '—'
  if (parte < 0.1) return '<0.1%'
  if (parte < 10) return `${parte.toFixed(1)}%`
  return `${Math.round(parte)}%`
}

function RepartoConceptos({
  conceptos,
  totalHoras,
}: {
  conceptos: IOvertimeConceptTotal[]
  totalHoras: number
}) {
  // El detalle arranca cerrado: la barra apilada ya dice si el período carga
  // sobre las bandas caras, que es la lectura de un vistazo. Los números
  // exactos son para cuando alguien va a hacer algo con ellos.
  const [abierto, setAbierto] = useState(false)

  if (conceptos.length === 0) {
    return (
      <Text fontSize={11} color="$textMuted">
        Sin horas aprobadas en el período.
      </Text>
    )
  }

  // Se reparte sobre la suma de las bandas y no sobre totalHoras: si por algún
  // detalle sin desglose no cuadraran, los porcentajes tienen que sumar 100 de
  // todos modos.
  const suma = conceptos.reduce((acc, c) => acc + Number(c.Horas ?? 0), 0) || 1

  // La etiqueta del tramo es su PARTICIPACION, no la banda de recargo.
  // Antes decia la banda, y eso se contradecia con el dibujo: el tramo rotulado
  // "25%" ocupaba el 58% del ancho, asi que el numero parecia estar mintiendo
  // sobre la proporcion. La banda se sigue leyendo en el color y en la lista.
  const tramos = conceptos.map(c => {
    const parte = (Number(c.Horas ?? 0) / suma) * 100

    return {
      label: fmtParte(parte),
      pct: parte,
      color: colorConcepto(c.Porcentaje),
    }
  })

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      gap="$2"
      {...shadows.sm}
    >
      <XStack
        alignItems="center"
        gap="$2"
        pressStyle={{ opacity: 0.6 }}
        onPress={() => setAbierto(v => !v)}
      >
        <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4} flex={1}>
          HORAS POR CONCEPTO
        </Text>
        <Text fontSize={11} fontWeight="700" color="$text">
          {fmtHoras(totalHoras)}
        </Text>
        {/* Una flecha que gira, no dos caracteres distintos: el giro se lee
            como "esto se abre" y los glifos ⌃/⌄ quedaban desalineados con el
            texto y de distinto peso. */}
        <View rotate={abierto ? '180deg' : '0deg'}>
          <ChevronDown size={16} color="#94A3B8" />
        </View>
      </XStack>

      <BarraApilada tramos={tramos} altura={20} />

      {abierto && (
        <YStack gap="$1.5" paddingTop={2}>
          {conceptos.map((c, i) => {
            const parte = (Number(c.Horas ?? 0) / suma) * 100

            return (
              <XStack key={`${c.Concepto}-${i}`} alignItems="center" gap="$2">
                <View width={8} height={8} borderRadius={999} backgroundColor={colorConcepto(c.Porcentaje)} />

                {/* La participación sobre el total, adelante y en negrita: es el
                    número que se viene a buscar acá.
                    La banda de recargo NO se repite como prefijo: ya venía dos
                    veces en la misma línea ("25% · Horas Extras 25%"), y además
                    la dice el color del punto y el tramo de la barra. */}
                <Text fontSize={11} fontWeight="700" color="$text" width={44}>
                  {fmtParte(parte)}
                </Text>

                <Text fontSize={11} color="$text" numberOfLines={1} flex={1}>
                  {c.Descripcion || c.Concepto || 'Sin concepto'}
                </Text>

                <Text fontSize={11} fontWeight="700" color="$text" width={52} textAlign="right">
                  {fmtHoras(c.Horas)}
                </Text>
                <Text fontSize={10} color="$textMuted" width={54} textAlign="right">
                  {fmtDinero(c.Costo)}
                </Text>
              </XStack>
            )
          })}
        </YStack>
      )}
    </YStack>
  )
}

// ── Diálogo: los empleados que consumen el presupuesto de un área ───────────
//
// La barra dice CUÁNTO se gastó; esto dice QUIÉN, que es lo que hace falta para
// hacer algo al respecto. Los empleados vienen ordenados por costo desde la
// base: el primero de la lista es el que más pesa.
function DesgloseArea({
  area,
  nivel,
  empleados,
  cargando,
  error,
  onCerrar,
}: {
  area: IOvertimeBudgetRow | null
  /** De qué nivel es el área: el diálogo se abre fuera del contexto de la pestaña. */
  nivel: string
  empleados: IOvertimeBudgetEmployee[]
  cargando: boolean
  error: string
  onCerrar: () => void
}) {
  const totalHoras = empleados.reduce((acc, e) => acc + Number(e.Horas ?? 0), 0)
  const totalCosto = empleados.reduce((acc, e) => acc + Number(e.Costo ?? 0), 0)

  return (
    <Modal visible={!!area} transparent animationType="slide" onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="flex-end">
        <YStack
          backgroundColor="$backgroundElevated"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          paddingHorizontal="$4"
          paddingTop="$4"
          paddingBottom="$5"
          maxHeight="85%"
          gap="$3"
        >
          {/* Encabezado */}
          <YStack gap={2}>
            <Text fontSize={16} fontWeight="800" color="$text" numberOfLines={2}>
              {area?.Nombre || area?.Codigo}
            </Text>
            <Text fontSize={11} color="$textMuted">
              {nivel} {area?.Codigo} · {empleados.length} empleado(s) con horas aprobadas
            </Text>
          </YStack>

          {/* Totales del área, para poder contrastar contra el presupuesto */}
          <XStack
            justifyContent="space-between"
            backgroundColor="$backgroundSurface"
            borderRadius="$4"
            paddingVertical="$2"
            paddingHorizontal="$3"
          >
            <YStack>
              <Text fontSize={10} color="$textMuted">
                Horas
              </Text>
              <Text fontSize={15} fontWeight="800" color="$text">
                {fmtHoras(totalHoras)}
              </Text>
            </YStack>
            <YStack alignItems="flex-end">
              <Text fontSize={10} color="$textMuted">
                Costo
              </Text>
              <Text fontSize={15} fontWeight="800" color={colorConsumo(area?.Porcentaje_Consumido ?? 0)}>
                {fmtDinero(totalCosto)}
              </Text>
            </YStack>
          </XStack>

          {/* Cuerpo */}
          {cargando ? (
            // Filas con la forma de las de abajo, no el esqueleto genérico:
            // dentro de un diálogo chico, unas barras que no se parecen a la
            // lista se ven como un error de carga.
            <YStack gap="$3" paddingVertical="$2">
              {[0, 1, 2].map(i => (
                <XStack key={i} alignItems="center" gap="$2">
                  <YStack flex={1} gap={4}>
                    <SkeletonBox width="70%" height={12} />
                    <SkeletonBox width="45%" height={9} />
                  </YStack>
                  <YStack alignItems="flex-end" gap={4}>
                    <SkeletonBox width={60} height={12} />
                    <SkeletonBox width={40} height={9} />
                  </YStack>
                </XStack>
              ))}
            </YStack>
          ) : error ? (
            <Text fontSize={12} color="#DC2626" lineHeight={17}>
              {error}
            </Text>
          ) : empleados.length === 0 ? (
            <Text fontSize={12} color="$textMuted" lineHeight={17}>
              Ningún empleado de esta área tiene horas extra aprobadas en el período. Puede
              haber solicitudes pendientes de firma: acá solo cuentan las que ya pasaron por
              todas las entidades.
            </Text>
          ) : (
            <FlatList
              data={empleados}
              keyExtractor={e => e.Employee_Code}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View height={1} backgroundColor="$border" opacity={0.5} />}
              renderItem={({ item }) => (
                <YStack paddingVertical="$2.5" gap="$1.5">
                  <XStack gap="$2" alignItems="center">
                    <YStack flex={1} minWidth={0}>
                      <Text fontSize={13} fontWeight="700" color="$text" numberOfLines={1}>
                        {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
                      </Text>
                      <Text fontSize={10} color="$textMuted" numberOfLines={1}>
                        {[item.Posicion, item.Centro_Costos].filter(Boolean).join(' · ')}
                      </Text>
                    </YStack>

                    <YStack alignItems="flex-end">
                      <Text fontSize={13} fontWeight="800" color="$text">
                        {fmtDinero(item.Costo)}
                      </Text>
                      <Text fontSize={10} color="$textMuted">
                        {fmtHoras(item.Horas)} · {item.Solicitudes} sol.
                      </Text>
                    </YStack>
                  </XStack>

                  {/* En qué banda cayeron SUS horas. Es el mismo componente de
                      las bandejas de aprobación, así que el empleado ve el
                      reparto igual en todas las pantallas. */}
                  <DistribucionHoras conceptos={parseConceptos(item.ConceptsJson)} compacta />
                </YStack>
              )}
            />
          )}

          <Button backgroundColor="$backgroundSurface" onPress={onCerrar}>
            <Text fontWeight="700" color="$text">
              Cerrar
            </Text>
          </Button>
        </YStack>
      </View>
    </Modal>
  )
}

// ── Esqueleto con la forma de esta pantalla ─────────────────────────────────
//
// No es el esqueleto genérico de listas: al cambiar de semana la pantalla
// entera se reemplazaba por unas barras que no se parecían a nada de lo que
// venía después, y el salto se sentía como si hubiera navegado a otro lado.
//
// Repitiendo la silueta —selector, dos tarjetas, barra, conceptos y el bloque
// de pestañas— lo que cambia es solo el contenido, y la espera se lee como
// "esto se está llenando" en vez de "esto se fue".
function EsqueletoTablero() {
  const Tarjeta = ({ children }: { children: React.ReactNode }) => (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2"
      {...shadows.sm}
    >
      {children}
    </YStack>
  )

  // Sin padding ni fondo propios: se dibuja DENTRO del ScrollView de la
  // pantalla, debajo del selector de semana que sigue en su lugar.
  return (
    <YStack gap="$3">
      {/* Las dos tarjetas del resumen */}
      <XStack gap="$2">
        {[0, 1].map(i => (
          <YStack
            key={i}
            flex={1}
            backgroundColor="$backgroundElevated"
            borderRadius="$4"
            padding="$3"
            gap="$2"
            {...shadows.sm}
          >
            <SkeletonBox width={70} height={9} />
            <SkeletonBox width={100} height={20} />
            <SkeletonBox width="90%" height={9} />
          </YStack>
        ))}
      </XStack>

      {/* Barra de consumo */}
      <Tarjeta>
        <XStack justifyContent="space-between" alignItems="center">
          <SkeletonBox width={150} height={9} />
          <SkeletonBox width={40} height={13} />
        </XStack>
        <SkeletonBox width="100%" height={12} radius={999} />
      </Tarjeta>

      {/* Horas por concepto */}
      <Tarjeta>
        <XStack justifyContent="space-between" alignItems="center">
          <SkeletonBox width={130} height={9} />
          <SkeletonBox width={50} height={11} />
        </XStack>
        <SkeletonBox width="100%" height={20} radius={6} />
      </Tarjeta>

      {/* El bloque de pestañas, gráfico y detalle */}
      <YStack
        backgroundColor="$backgroundElevated"
        borderRadius="$4"
        overflow="hidden"
        {...shadows.sm}
      >
        <XStack padding={4} gap={4}>
          {[0, 1, 2].map(i => (
            <YStack key={i} flex={1} paddingVertical="$2" alignItems="center">
              <SkeletonBox width="80%" height={14} radius={8} />
            </YStack>
          ))}
        </XStack>

        <View height={1} backgroundColor="$border" opacity={0.6} />

        {/* Las barras, con alturas distintas para que se lea como un gráfico */}
        <YStack padding="$3" gap="$2.5">
          <SkeletonBox width="85%" height={9} />
          <XStack height={140} alignItems="flex-end" gap={14} paddingTop="$2">
            {[0.5, 0.8, 0.35, 1, 0.6, 0.45].map((alto, i) => (
              <SkeletonBox key={i} width={30} height={Math.round(140 * alto)} radius={4} />
            ))}
          </XStack>
        </YStack>

        <View height={1} backgroundColor="$border" opacity={0.6} />

        <YStack padding="$3" gap="$3">
          <SkeletonBox width="90%" height={9} />
          {[0, 1, 2].map(i => (
            <YStack key={i} gap="$1.5">
              <XStack justifyContent="space-between" alignItems="center">
                <SkeletonBox width="55%" height={12} />
                <SkeletonBox width={40} height={14} />
              </XStack>
              <SkeletonBox width="100%" height={9} radius={999} />
              <SkeletonBox width="45%" height={10} />
            </YStack>
          ))}
        </YStack>
      </YStack>
    </YStack>
  )
}

// ── División interna de la tarjeta ──────────────────────────────────────────
//
// Una línea a todo lo ancho, sin márgenes: separa las secciones sin romper la
// tarjeta en pedazos, que es la diferencia entre "un bloque con partes" y
// "varios bloques sueltos".
function Divisor() {
  return <View height={1} backgroundColor="$border" opacity={0.6} />
}

// ── Selector de nivel ───────────────────────────────────────────────────────
//
// Tres botones segmentados con ícono en lugar de la barra de pestañas con
// emojis: los emojis se ven distintos en cada teléfono y no siempre se
// entienden, y subrayado fino era un blanco chico para el dedo.
function SelectorNivel({
  activo,
  onCambiar,
}: {
  activo: number
  onCambiar: (i: number) => void
}) {
  // Sin fondo ni sombra propios: vive DENTRO de la tarjeta del bloque.
  return (
    <XStack padding={4} gap={4}>
      {TABS.map((t, i) => {
        const sel = i === activo
        const Icono = t.Icono

        return (
          <XStack
            key={t.key}
            flex={1}
            alignItems="center"
            justifyContent="center"
            gap="$1.5"
            paddingVertical="$2"
            borderRadius="$3"
            backgroundColor={sel ? ACCENT : 'transparent'}
            pressStyle={{ opacity: 0.7 }}
            onPress={() => onCambiar(i)}
          >
            <Icono size={14} color={sel ? '#FFFFFF' : '#94A3B8'} />
            <Text
              fontSize={11}
              fontWeight={sel ? '800' : '600'}
              color={sel ? '#FFFFFF' : '$textMuted'}
              numberOfLines={1}
            >
              {t.label}
            </Text>
          </XStack>
        )
      })}
    </XStack>
  )
}

// ── Selector de semana ──────────────────────────────────────────────────────
//
// Flechas en vez de desplegable: moverse de semana es lo que más se hace en
// esta pantalla, y con una lista había que abrirla, buscar y elegir para llegar
// a la de al lado. Acá es un toque.
//
// La lista viene SIN semanas futuras, así que la flecha derecha se apaga en la
// semana en curso — no hay para dónde avanzar y un botón que no hace nada
// confunde más que uno apagado.
function SelectorSemana({
  semanas,
  actual,
  onCambiar,
}: {
  semanas: IPayWebWeek[]
  actual: IPayWebWeek | null
  onCambiar: (w: IPayWebWeek) => void
}) {
  const i = actual ? semanas.findIndex(w => claveSemana(w) === claveSemana(actual)) : -1

  const anterior = i > 0 ? semanas[i - 1] : null
  const siguiente = i >= 0 && i < semanas.length - 1 ? semanas[i + 1] : null

  const corta = (iso: string | null) =>
    iso ? iso.substring(0, 10).split('-').reverse().slice(0, 2).join('/') : ''

  return (
    <XStack
      alignItems="center"
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      paddingVertical="$1.5"
      paddingHorizontal="$1.5"
      {...shadows.sm}
    >
      <View
        padding="$2"
        borderRadius={999}
        opacity={anterior ? 1 : 0.25}
        pressStyle={anterior ? { opacity: 0.5 } : undefined}
        onPress={() => anterior && onCambiar(anterior)}
      >
        <ChevronLeft size={20} color="#94A3B8" />
      </View>

      <YStack flex={1} alignItems="center" gap={1}>
        <XStack alignItems="center" gap="$1.5">
          <Text fontSize={14} fontWeight="800" color="$text">
            Semana {actual?.WeekNumber ?? '—'}
          </Text>
          {!!actual?.IsCurrentWeek && (
            <XStack backgroundColor={`${ACCENT}22`} paddingHorizontal={6} paddingVertical={1} borderRadius={6}>
              <Text fontSize={9} fontWeight="800" color={ACCENT}>
                ACTUAL
              </Text>
            </XStack>
          )}
        </XStack>
        <Text fontSize={10} color="$textMuted">
          {corta(actual?.InitialDate ?? null)} — {corta(actual?.FinalDate ?? null)}
        </Text>
      </YStack>

      <View
        padding="$2"
        borderRadius={999}
        opacity={siguiente ? 1 : 0.25}
        pressStyle={siguiente ? { opacity: 0.5 } : undefined}
        onPress={() => siguiente && onCambiar(siguiente)}
      >
        <ChevronRight size={20} color="#94A3B8" />
      </View>
    </XStack>
  )
}

// ── Tarjeta compacta del resumen ────────────────────────────────────────────
//
// Reemplaza a KpiCard en este encabezado: aquella trae ícono de ayuda, línea de
// delta y su propio espaciado, y con cuatro de ellas el tablero empezaba abajo
// del pliegue. Acá cada tarjeta es rótulo, cifra y una línea de contexto.
function ResumenCard({
  titulo,
  valor,
  pie,
  color,
  badge,
}: {
  titulo: string
  valor: string
  pie?: string
  color?: string
  badge?: string
}) {
  return (
    <YStack
      flex={1}
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      gap={2}
      {...shadows.sm}
    >
      <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
        {titulo}
      </Text>

      <XStack alignItems="center" gap="$1.5" flexWrap="wrap">
        <Text fontSize={19} fontWeight="800" color={color ?? '$text'}>
          {valor}
        </Text>
        {!!badge && (
          <XStack
            backgroundColor={`${color ?? '#64748B'}22`}
            paddingHorizontal={6}
            paddingVertical={1}
            borderRadius={6}
          >
            <Text fontSize={10} fontWeight="800" color={color ?? '$textMuted'}>
              {badge}
            </Text>
          </XStack>
        )}
      </XStack>

      {!!pie && (
        <Text fontSize={10} color="$textMuted" numberOfLines={1}>
          {pie}
        </Text>
      )}
    </YStack>
  )
}

// ── Barra de consumo con marca del 100% ──────────────────────────────────────
//
// La marca importa: sin ella una barra llena al 100% y una al 140% se ven
// igual de llenas y la segunda es un problema.
function BarraConsumo({ pct, disponible }: { pct: number; disponible: number }) {
  const color = colorConsumo(pct)
  const excedido = disponible < 0

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      gap="$1.5"
      {...shadows.sm}
    >
      {/* Sin este rótulo la barra quedaba suelta: una franja de color que no
          decía de qué era ni qué significaba llegar al final. */}
      <XStack alignItems="center" gap="$2">
        <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4} flex={1}>
          CONSUMO DEL PRESUPUESTO
        </Text>
        <Text fontSize={13} fontWeight="800" color={color}>
          {fmtPct(pct)}
        </Text>
      </XStack>

      {/* Riel gris (lo que falta) + relleno de color (lo gastado). La marca del
          100% va DENTRO del riel: colgada debajo en su propio XStack quedaba
          fuera de la caja y no se dibujaba. */}
      <View height={12} borderRadius={999} backgroundColor={PISTA} overflow="hidden">
        <View height={12} borderRadius={999} backgroundColor={color} width={anchoBarra(pct)} />
        <View
          position="absolute"
          left={MARCA_100}
          top={0}
          bottom={0}
          width={2}
          backgroundColor="$background"
          opacity={0.9}
        />
      </View>

      {/* Debajo: la referencia del 100% alineada con su marca, y a la derecha
          qué significa el número en dinero, que es la pregunta que sigue. */}
      <XStack height={13}>
        <Text position="absolute" left={MARCA_100} marginLeft={-14} fontSize={9} color="$textMuted">
          100%
        </Text>
        <Text
          position="absolute"
          right={0}
          fontSize={10}
          fontWeight={excedido ? '700' : '400'}
          color={excedido ? '#DC2626' : '$textMuted'}
        >
          {excedido
            ? `Excedido en ${fmtDinero(Math.abs(disponible))}`
            : `Quedan ${fmtDinero(disponible)}`}
        </Text>
      </XStack>
    </YStack>
  )
}

// ── Una fila del detalle ─────────────────────────────────────────────────────
function FilaArea({ fila, onPress }: { fila: IOvertimeBudgetRow; onPress?: () => void }) {
  const color = colorConsumo(fila.Porcentaje_Consumido)
  const excedido = fila.Disponible < 0
  const sinPresupuesto = fila.Presupuesto === 0

  return (
    <YStack
      gap="$1.5"
      onPress={onPress}
      pressStyle={onPress ? { opacity: 0.6 } : undefined}
      paddingVertical={2}
    >
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={13} fontWeight="700" color="$text" numberOfLines={1}>
            {fila.Nombre || fila.Codigo}
          </Text>
          <Text fontSize={10} color="$textMuted" numberOfLines={1}>
            {fila.Codigo} · {fmtHoras(fila.Horas)} · {fila.Empleados} empleado(s)
          </Text>
        </YStack>

        <Text fontSize={15} fontWeight="800" color={sinPresupuesto ? '$textMuted' : color}>
          {sinPresupuesto ? fmtDinero(fila.Costo) : fmtPct(fila.Porcentaje_Consumido)}
        </Text>
      </XStack>

      <View height={9} borderRadius={999} backgroundColor={PISTA} overflow="hidden">
        <View
          height={9}
          borderRadius={999}
          backgroundColor={sinPresupuesto ? ACCENT : color}
          width={sinPresupuesto ? '100%' : anchoBarra(fila.Porcentaje_Consumido)}
        />
        {/* Sin presupuesto no hay 100% contra el cual marcar nada */}
        {!sinPresupuesto && (
          <View
            position="absolute"
            left={MARCA_100}
            top={0}
            bottom={0}
            width={2}
            backgroundColor="$background"
            opacity={0.9}
          />
        )}
      </View>

      {/* El dinero, completo y en su propia línea.
          Antes iba abreviado —'1k / 8k'— y en 10px debajo del porcentaje: era
          el dato que se venía a buscar y estaba escrito como una nota al pie.
          Sin abreviar, además, se distingue L 1,200 de L 12,000. */}
      <XStack justifyContent="space-between" alignItems="baseline" gap="$2">
        {sinPresupuesto ? (
          <Text fontSize={11} color="$textMuted" fontStyle="italic">
            Sin presupuesto asignado
          </Text>
        ) : (
          <Text fontSize={12} color="$textSecondary" numberOfLines={1} flex={1}>
            <Text fontSize={12} fontWeight="800" color="$text">
              {fmtDinero(fila.Costo)}
            </Text>
            {' de '}
            {fmtDinero(fila.Presupuesto)}
          </Text>
        )}

        {!sinPresupuesto && !excedido && (
          <Text fontSize={11} color="$textMuted" numberOfLines={1}>
            quedan {fmtDinero(fila.Disponible)}
          </Text>
        )}
      </XStack>

      {excedido && (
        <Text fontSize={11} fontWeight="700" color="#DC2626">
          Excedido en {fmtDinero(Math.abs(fila.Disponible))}
        </Text>
      )}
    </YStack>
  )
}
