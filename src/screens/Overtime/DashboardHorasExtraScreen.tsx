import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, useWindowDimensions } from 'react-native'
import { YStack, XStack, Text, View, Button, useTheme } from 'tamagui'
import { BarChart } from 'react-native-gifted-charts'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeBudgetDashboard,
  IOvertimeBudgetEmployee,
  IOvertimeBudgetRow,
  IOvertimeConceptTotal,
  IPayWebWeek,
} from '../../api/modules/overtime/overtime.types'
import { BarraApilada, SectionCard, TabBar } from '../Mantenimiento/components'
import { shadows } from '../../theme/shadows'
import { ACCENT } from '../Mantenimiento/mantenimiento.helpers'
import {
  DistribucionHoras,
  colorConcepto,
  fmtHoras,
  fmtPorcentaje,
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
// OJO CON LOS NÚMEROS: hoy el precio de la hora por empleado y el presupuesto
// por área son INVENTADOS. Salen de dos vistas de la base hechas para ser
// reemplazadas (Overtime.VW_EmployeeHourRate y Overtime.VW_AreaBudget); cuando
// existan los datos reales se cambian esas vistas y esta pantalla no se toca.

const TABS = [
  { key: 'unidad', label: '🏢 Unidades' },
  { key: 'departamento', label: '🏬 Departamentos' },
  { key: 'centro', label: '🏭 Centros de costo' },
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
 * Etiqueta de una barra.
 *
 * Se prefiere el NOMBRE al código: 'COSTURA DENIM' dice algo y 'PR02' hay que
 * ir a buscarlo. Pero debajo de una barra caben pocos caracteres, así que se
 * recorta y se marca el corte; el nombre completo está en el detalle de abajo
 * y en el desglose.
 */
const etiquetaArea = (fila: IOvertimeBudgetRow): string => {
  const nombre = String(fila.Nombre ?? '').trim()
  if (!nombre) return fila.Codigo || '—'

  return nombre.length > 11 ? `${nombre.slice(0, 10)}…` : nombre
}

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

/** Miles abreviados, para que quepa dentro de una barra. */
const fmtCorto = (valor: number | null | undefined): string => {
  const n = Math.round(Number(valor ?? 0))
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
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

  const barras = useMemo(
    () =>
      filasGraficadas
        .map(f => {
          const pct = Math.round(f.Porcentaje_Consumido)
          return {
            value: Math.min(pct, ESCALA_TOPE),
            label: etiquetaArea(f),
            frontColor: colorConsumo(f.Porcentaje_Consumido),
            // El valor de la barra va recortado en ESCALA_TOPE, pero el
            // número es SIEMPRE el real: recortar la barra es una decisión de
            // escala, mentir sobre el porcentaje sería otra cosa.
            topLabelComponent: () => (
              <Text fontSize={9} fontWeight="700" color="$textMuted" numberOfLines={1}>
                {`${pct}%`}
              </Text>
            ),
          }
        }),
    [filasGraficadas],
  )

  const graphWidth = barras.length * (BAR_W + BAR_SPACING) + BAR_INITIAL

  /**
   * Techo del eje. Llega al menos a 100 para que el presupuesto sea la
   * referencia visual, y sube cuando alguien se pasó.
   *
   * Antes estaba fijo en 150 y consumos reales del 3% quedaban en barras de
   * dos píxeles: se veía igual que un gráfico vacío.
   *
   * El 15% de aire por encima de la barra más alta NO es estética: el número
   * va sobre la barra, así que una barra que toca el techo del lienzo se come
   * su propia etiqueta. Pasaba justo con las desbordadas —las recortadas en
   * 200%— que son las que más importa poder leer.
   */
  const maxEje = useMemo(() => {
    const mayor = Math.max(100, ...barras.map(b => b.value))
    return Math.ceil((mayor * 1.15) / 10) * 10
  }, [barras])

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
  if (cargando && !data) {
    return (
      <YStack flex={1} padding="$3" gap="$3" backgroundColor="$background">
        <SkeletonList />
      </YStack>
    )
  }

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

      {/* El esqueleto solo sale cuando todavía no hay nada. Al recargar con
          datos en pantalla no se ve nada moverse, y un cambio de semana parece
          que no hizo efecto: esta línea es el acuse de recibo. */}
      {cargando && !!data && (
        <Text fontSize={11} color="$textMuted" alignSelf="center">
          Actualizando…
        </Text>
      )}

      {semanas.length === 0 ? (
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

          {/* ── Cortes por nivel ──────────────────────────────────────────── */}
          <TabBar tabs={TABS.map(t => t.label)} activo={tab} onChange={setTab} />

          {filas.length === 0 ? (
            <EmptyState
              title="Sin movimiento"
              message="No hay horas extra aprobadas en tus áreas para esta semana."
            />
          ) : (
            <>
              <SectionCard
                titulo="Consumo por área"
                subtitulo={
                  sinGasto
                    ? 'Todavía no hay gasto aprobado en el período.'
                    : 'Porcentaje del presupuesto ya comprometido. Tocá una barra para ver quiénes.'
                }
                ejeX={sinGasto ? undefined : NIVEL_LABEL[tabKey]}
              >
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
                      height={180}
                      barWidth={BAR_W}
                      spacing={BAR_SPACING}
                      initialSpacing={BAR_INITIAL}
                      noOfSections={4}
                      maxValue={maxEje}
                      yAxisTextStyle={{ fontSize: 10, color: muted }}
                      xAxisLabelTextStyle={{ fontSize: 9, color: muted }}
                      // Sin ancho propio la etiqueta se corta al ancho de la
                      // barra y un nombre no entra en 38px.
                      labelWidth={BAR_W + BAR_SPACING}
                      yAxisThickness={0}
                      xAxisThickness={1}
                      xAxisColor={grid}
                      rulesColor={grid}
                      rulesType="dashed"
                      // Alto propio para el número de encima: sin esto lo
                      // encajona la barra y se ve cortado.
                      topLabelContainerStyle={{ height: 14, justifyContent: 'flex-end' }}
                      // El índice apunta a filasGraficadas: las barras se
                      // construyen desde ahí y en el mismo orden.
                      onPress={(_item: any, index: number) => {
                        const fila = filasGraficadas[index]
                        if (fila) abrirArea(fila)
                      }}
                    />
                  </ScrollView>
                )}
              </SectionCard>

              <SectionCard
                titulo="Detalle"
                subtitulo="Tocá un área para ver qué empleados están consumiendo su presupuesto."
              >
                <YStack gap="$3">
                  {filasOrdenadas.map(f => (
                    <FilaArea key={`${f.Codigo}-${f.Nombre}`} fila={f} onPress={() => abrirArea(f)} />
                  ))}
                </YStack>
              </SectionCard>
            </>
          )}
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

// ── Reparto de las horas por banda de recargo ───────────────────────────────
//
// La barra apilada es proporcional a las horas de cada banda: de un vistazo se
// ve si el período es casi todo al 25% o si carga sobre las bandas caras, que
// es lo que mueve el costo. Las filas dan el número exacto, porque una banda de
// 15 minutos queda como un hilo ilegible en la barra.
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

  const tramos = conceptos.map(c => ({
    label: fmtPorcentaje(c.Porcentaje),
    pct: (Number(c.Horas ?? 0) / suma) * 100,
    color: colorConcepto(c.Porcentaje),
  }))

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

                <Text fontSize={11} color="$text" numberOfLines={1} flex={1}>
                  {fmtPorcentaje(c.Porcentaje)} · {c.Descripcion || c.Concepto || 'Sin concepto'}
                </Text>

                <Text fontSize={11} fontWeight="700" color="$text">
                  {fmtHoras(c.Horas)}
                </Text>
                <Text fontSize={10} color="$textMuted" width={54} textAlign="right">
                  {fmtDinero(c.Costo)}
                </Text>
                <Text fontSize={9} color="$textMuted" width={26} textAlign="right">
                  {Math.round(parte)}%
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
            <SkeletonList />
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

        <YStack alignItems="flex-end">
          <Text fontSize={13} fontWeight="800" color={sinPresupuesto ? '$textMuted' : color}>
            {sinPresupuesto ? fmtDinero(fila.Costo) : fmtPct(fila.Porcentaje_Consumido)}
          </Text>
          <Text fontSize={10} color="$textMuted">
            {sinPresupuesto
              ? 'sin presupuesto'
              : `${fmtCorto(fila.Costo)} / ${fmtCorto(fila.Presupuesto)}`}
          </Text>
        </YStack>
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

      {excedido && (
        <Text fontSize={10} fontWeight="700" color="#DC2626">
          Excedido en {fmtDinero(Math.abs(fila.Disponible))}
        </Text>
      )}
    </YStack>
  )
}
