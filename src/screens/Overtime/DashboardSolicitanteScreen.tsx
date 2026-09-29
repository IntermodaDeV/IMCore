import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, useWindowDimensions } from 'react-native'
import { BarChart } from 'react-native-gifted-charts'
import { YStack, XStack, Text, View, Card, Button, styled, useTheme } from 'tamagui'
import { ArrowLeft, CalendarX, CheckCircle2, Clock, FileText, Pencil, Users, XCircle } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import AppSelect from '../../components/commons/AppSelect'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IPayWebWeek,
  IRequesterWeekDay,
  IRequesterWeekModule,
  IRequesterDayEmployee,
  IRequesterTopEmployee,
  IRequesterWeekSummary,
} from '../../api/modules/overtime/overtime.types'
import { DistribucionHoras, fmtHoras, nombreConCodigo, parseConceptos } from './Overtime.utils'
import { hora12 } from './Overtime.calc'
import { SkeletonBox } from '../../components/Skeletons/SkeletonList'
import { shadows } from '../../theme/shadows'

// El tablero del SOLICITANTE: lo que pidió, en números.
//
// No es el DashboardHE de presupuesto —ese es por área y para quien administra
// el gasto—: acá se ve lo propio. Se llega desde "Mis solicitudes" y "atrás"
// regresa a ellas, por eso va como pantalla hija de ese listado.
//
// 1. La semana en horas: cuánto pidió y en qué quedó.

const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

/** 'Sem 39 · 22/09 - 28/09', igual que en "Mis solicitudes". */
const etiquetaSemana = (w: IPayWebWeek): string => {
  const corta = (iso: string | null) =>
    iso ? iso.substring(0, 10).split('-').reverse().slice(0, 2).join('/') : ''
  return `Sem ${w.WeekNumber} · ${corta(w.InitialDate)} - ${corta(w.FinalDate)}`
}

const claveSemana = (w: IPayWebWeek) => `${w.Year}-${w.WeekNumber}`

export default function DashboardSolicitanteScreen() {
  const navigation = useNavigation()
  const { defaultCompany } = useAuth()
  const companyCode = defaultCompany?.Code ?? ''

  const [semanas, setSemanas] = useState<IPayWebWeek[]>([])
  const [semana, setSemana] = useState('')
  const [resumen, setResumen] = useState<IRequesterWeekSummary | null>(null)
  const [dias, setDias] = useState<IRequesterWeekDay[]>([])
  const [modulos, setModulos] = useState<IRequesterWeekModule[]>([])
  const [errorModulos, setErrorModulos] = useState('')
  const [top, setTop] = useState<IRequesterTopEmployee[]>([])
  const [errorTop, setErrorTop] = useState('')
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Mi resumen de horas extra
      </Text>
    ),
    left: (
      <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
        <ArrowLeftStyled />
      </View>
    ),
  })

  const semanaSel = useMemo(
    () => semanas.find(w => claveSemana(w) === semana) ?? null,
    [semanas, semana],
  )

  // Las semanas, de la más reciente a la más vieja, igual que el listado.
  const opcionesSemana = useMemo(
    () => [...semanas].reverse().map(w => ({ label: etiquetaSemana(w), value: claveSemana(w) })),
    [semanas],
  )

  const cargarResumen = useCallback(
    async (w: IPayWebWeek | null) => {
      if (!companyCode || !w?.InitialDate || !w?.FinalDate) {
        setResumen(null)
        setDias([])
        setModulos([])
        setTop([])
        return
      }
      const inicio = w.InitialDate.substring(0, 10)
      const fin = w.FinalDate.substring(0, 10)

      // En paralelo: los dos son de la misma semana y no dependen entre sí.
      const [res, resDias, resMod, resTop] = await Promise.all([
        overtimeService.getRequesterWeekSummary(companyCode, inicio, fin),
        overtimeService.getRequesterWeekDays(companyCode, inicio, fin),
        // Va al cubo por el servidor vinculado: puede tardar o fallar sin que
        // eso tenga que ver con lo demás, así que no tumba la pantalla.
        overtimeService.getRequesterWeekModules(companyCode, inicio, fin).catch(() => null),
        overtimeService.getRequesterTopEmployees(companyCode, inicio, fin).catch(() => null),
      ])
      if (!res?.Success) {
        throw new Error(res?.ErrorMessage || 'No se pudo cargar el resumen de la semana.')
      }
      setResumen(res.Data ?? null)

      // El gráfico no tumba la pantalla: sin él, la tarjeta sigue sirviendo.
      setDias(resDias?.Success ? (resDias.Data ?? []) : [])
      setModulos(resMod?.Success ? (resMod.Data ?? []) : [])
      setErrorModulos(resMod?.Success ? '' : (resMod?.ErrorMessage || 'No se pudieron cargar los módulos.'))
      setTop(resTop?.Success ? (resTop.Data ?? []) : [])
      setErrorTop(resTop?.Success ? '' : (resTop?.ErrorMessage || 'No se pudo cargar el top de empleados.'))
    },
    [companyCode],
  )

  // Al entrar: el calendario y la semana en curso, que es donde está lo que se
  // acaba de pedir.
  const cargarTodo = useCallback(async () => {
    if (!companyCode) return
    setError(null)
    try {
      const resSem = await overtimeService.getCalendarWeeks(companyCode)
      if (!resSem?.Success) {
        throw new Error(resSem?.ErrorMessage || 'No se pudo cargar el calendario de semanas.')
      }
      const lista = resSem.Data ?? []
      setSemanas(lista)

      const previa = lista.find(w => claveSemana(w) === semana)
      const elegida = previa ?? lista.find(w => w.IsCurrentWeek) ?? lista[lista.length - 1] ?? null
      setSemana(elegida ? claveSemana(elegida) : '')

      await cargarResumen(elegida)
    } catch (err) {
      setError(handleError(err))
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
    // `semana` fuera a propósito: con ella, cambiar de semana recargaría el
    // calendario completo. El cambio de semana lo atiende cambiarSemana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyCode, cargarResumen])

  useEffect(() => {
    cargarTodo()
  }, [cargarTodo])

  const cambiarSemana = useCallback(
    async (clave: string) => {
      setSemana(clave)
      const w = semanas.find(x => claveSemana(x) === clave) ?? null
      setCargando(true)
      try {
        await cargarResumen(w)
      } catch (err) {
        setError(handleError(err))
      } finally {
        setCargando(false)
      }
    },
    [semanas, cargarResumen],
  )

  const onRefresh = useCallback(() => {
    setRefrescando(true)
    cargarTodo()
  }, [cargarTodo])

  if (error) {
    return <ErrorState title={error.title} message={error.message} onRetry={onRefresh} />
  }

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
      >
        <AppSelect
          label="Semana"
          value={semana}
          options={opcionesSemana}
          onValueChange={v => cambiarSemana(String(v))}
          placeholder={semanas.length === 0 ? 'Sin semanas' : ''}
          disabled={semanas.length === 0}
        />

        <TarjetaSemana resumen={resumen} cargando={cargando} semana={semanaSel} />

        <GraficoDias dias={dias} cargando={cargando} companyCode={companyCode} />

        <GraficoModulos
          modulos={modulos}
          error={errorModulos}
          cargando={cargando}
          companyCode={companyCode}
          semana={semanaSel}
        />

        <GraficoTop empleados={top} error={errorTop} cargando={cargando} />
      </ScrollView>
    </View>
  )
}

/**
 * 1. La semana en horas.
 *
 * El total va en grande porque es la pregunta ("¿cuánto pedí?"), y la barra
 * dice en qué quedó sin tener que leer: verde aprobado, ámbar en proceso, rojo
 * rechazado. Las tres partes SUMAN el total —lo garantiza el procedimiento—,
 * así que la barra no puede mentir.
 */
function TarjetaSemana({
  resumen,
  cargando,
  semana,
}: {
  resumen: IRequesterWeekSummary | null
  cargando: boolean
  semana: IPayWebWeek | null
}) {
  const theme = useTheme()
  const verde = theme.success?.val as string
  const ambar = theme.warning?.val as string
  const rojo = theme.error?.val as string

  const total = resumen?.Horas_Solicitadas ?? 0
  const partes = [
    { clave: 'a', texto: 'Aprobadas', horas: resumen?.Horas_Aprobadas ?? 0, cantidad: resumen?.Detalles_Aprobados ?? 0, color: verde, Icono: CheckCircle2 },
    { clave: 'p', texto: 'En proceso', horas: resumen?.Horas_En_Proceso ?? 0, cantidad: resumen?.Detalles_En_Proceso ?? 0, color: ambar, Icono: Clock },
    { clave: 'r', texto: 'Rechazadas', horas: resumen?.Horas_Rechazadas ?? 0, cantidad: resumen?.Detalles_Rechazados ?? 0, color: rojo, Icono: XCircle },
  ]

  const aprobadas = resumen?.Horas_Aprobadas ?? 0
  const reconocidas = resumen?.Horas_Reconocidas ?? 0

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={12}
      padding="$2.5"
      borderWidth={1}
      borderColor="$border"
      opacity={cargando ? 0.6 : 1}
    >
      {/* Compacta a propósito: la misma información en menos renglones. El
          total y sus conteos van en una línea, la leyenda en tres columnas y
          lo reconocido en una fila, en lugar de un renglón por cada dato. */}
      <YStack gap="$2">
        <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.4} numberOfLines={1}>
          HORAS EXTRA DE LA SEMANA
        </Text>

        {total === 0 && !cargando ? (
          <XStack alignItems="center" gap="$2" paddingVertical="$1.5">
            <Clock size={18} color="#CBD5E1" />
            <YStack flex={1}>
              <Text fontSize={13} fontWeight="700" color="$text">
                Sin horas extra pedidas
              </Text>
              <Text fontSize={11} color="$textMuted">
                {semana ? `No pediste horas extra en la ${etiquetaSemana(semana).split(' · ')[0].replace('Sem', 'semana')}.` : 'Elegí una semana.'}
              </Text>
            </YStack>
          </XStack>
        ) : (
          <>
            {/* El total, con solicitudes y empleados a la derecha. */}
            <XStack alignItems="center" justifyContent="space-between" gap="$2">
              <XStack alignItems="baseline" gap="$1.5">
                <Text fontSize={24} fontWeight="800" color="$text">
                  {fmtHoras(total)}
                </Text>
                <Text fontSize={12} fontWeight="600" color="$textSecondary">
                  solicitadas
                </Text>
              </XStack>
              <YStack alignItems="flex-end" gap={1}>
                <XStack gap="$1" alignItems="center">
                  <FileText size={11} color={theme.textMuted?.val as string} />
                  <Text fontSize={11} color="$textMuted">
                    {resumen?.Solicitudes ?? 0} solicitud(es)
                  </Text>
                </XStack>
                <XStack gap="$1" alignItems="center">
                  <Users size={11} color={theme.textMuted?.val as string} />
                  <Text fontSize={11} color="$textMuted">
                    {resumen?.Empleados ?? 0} empleado(s)
                  </Text>
                </XStack>
              </YStack>
            </XStack>

            {/* La barra: en qué quedó cada hora. */}
            <XStack height={10} borderRadius={5} overflow="hidden" backgroundColor="$backgroundSurface">
              {partes
                .filter(p => p.horas > 0)
                .map(p => (
                  <View key={p.clave} flex={p.horas} style={{ backgroundColor: p.color }} />
                ))}
            </XStack>

            {/* La leyenda en tres columnas: estado, horas y empleados. */}
            <XStack gap="$2">
              {partes.map(p => (
                <YStack key={p.clave} flex={1} gap={1}>
                  <XStack gap="$1" alignItems="center">
                    <View width={8} height={8} borderRadius={4} style={{ backgroundColor: p.color }} />
                    <Text fontSize={11} fontWeight="600" color="$textSecondary" numberOfLines={1}>
                      {p.texto}
                    </Text>
                  </XStack>
                  <Text fontSize={14} fontWeight="800" color="$text">
                    {fmtHoras(p.horas)}
                  </Text>
                  <Text fontSize={10} color="$textMuted">
                    {p.cantidad} empleado(s)
                  </Text>
                </YStack>
              ))}
            </XStack>

            {/* De lo aprobado, cuánto ya cerró RRHH, en una sola fila. */}
            {aprobadas > 0 && (
              <XStack
                alignItems="center"
                justifyContent="space-between"
                gap="$2"
                paddingHorizontal="$2"
                paddingVertical="$1.5"
                borderRadius={8}
                backgroundColor="$backgroundSurface"
              >
                <Text fontSize={11} color="$textSecondary" flex={1} numberOfLines={2}>
                  <Text fontSize={11} fontWeight="700" color="$textSecondary">Reconocidas por RRHH</Text>
                  {` · ${resumen?.Detalles_Reconocidos ?? 0} de ${resumen?.Detalles_Aprobados ?? 0} aprobados`}
                </Text>
                <Text fontSize={13} fontWeight="800" color="$text">
                  {fmtHoras(reconocidas)}
                </Text>
              </XStack>
            )}
          </>
        )}
      </YStack>
    </Card>
  )
}

// ── Medidas y colores del gráfico ───────────────────────────────────────────
// Las MISMAS que "Gasto por día" de DashboardHorasExtraScreen, para que los dos
// tableros se lean igual. Si allá cambian, cambiarlas acá también.
export const COLOR_BARRA = '#F97316'
export const COLOR_BARRA_SUAVE = '#FDBA74'
const BAR_W_MAX = 34
export const BAR_W_MIN = 12
const BAR_SPACING_MAX = 20
const BAR_SPACING_MIN = 6
export const BAR_INITIAL = 12
// Más bajo que en DashboardHE (190): las mismas cuatro divisiones del eje Y,
// pero más juntas. Acá los valores son pocas horas y el alto sobraba.
export const CHART_H = 130
/** En esta librería `width` es el área de columnas y NO incluye esta franja. */
export const Y_LABEL_W = 40

/** Ancho de barra y espacio para que las columnas entren en la tarjeta. */
const medidasColumnas = (columnas: number, anchoVisible: number) => {
  const plot = Math.max(140, anchoVisible - Y_LABEL_W)
  const n = Math.max(1, columnas)
  const disponible = (plot - BAR_INITIAL) / n
  const factor = Math.min(1, disponible / (BAR_W_MAX + BAR_SPACING_MAX))
  const barW = Math.max(BAR_W_MIN, Math.round(BAR_W_MAX * factor))
  const spacing = Math.max(BAR_SPACING_MIN, Math.round(BAR_SPACING_MAX * factor))
  return { plot, barW, spacing, scroll: n * (barW + spacing) + BAR_INITIAL > plot }
}

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * La escala del eje Y: un paso limpio (0.5, 1, 2, 2.5, 5, 10…) y solo las
 * divisiones que hacen falta para cubrir el día más alto con un poco de aire,
 * para que su número de arriba no se corte.
 *
 * Se redondea el PASO y no el tope: así el eje se lee de 5 en 5 (o de 2 en 2),
 * nunca en 4.8, y con 20h llega a 25 y no a 40.
 */
export const escalaEje = (maximo: number): { paso: number; secciones: number } => {
  if (maximo <= 0) return { paso: 1, secciones: 4 }
  const bruto = maximo / 4
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)))
  const n = bruto / potencia
  const limpio = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * potencia
  const paso = Math.max(0.5, limpio)
  return { paso, secciones: Math.max(1, Math.ceil((maximo * 1.12) / paso)) }
}

/**
 * 2. Las horas pedidas por día.
 *
 * Mismo estilo que "Gasto por día" del tablero de presupuesto: el día más
 * cargado en naranja fuerte y el resto apagado, porque es el que motiva la
 * pregunta y con las siete iguales habría que ir a buscarlo comparando alturas.
 * Siempre los siete días: uno sin columna se lee como "ese día no pedí".
 */
/**
 * Un día del gráfico. Es la forma del tablero del solicitante; el del jefe
 * pone sus horas APROBADAS en Horas_Solicitadas al llamarlo.
 */
export type DiaGrafico = Pick<IRequesterWeekDay, 'Fecha' | 'Dia_Semana' | 'Horas_Solicitadas'>

export function GraficoDias({
  dias,
  cargando,
  companyCode,
  titulo = 'HORAS SOLICITADAS POR DÍA',
  verbo = 'solicitadas',
  vacio = 'No pediste horas extra ningún día de esta semana.',
  cargarEmpleados,
}: {
  dias: DiaGrafico[]
  cargando: boolean
  companyCode: string
  /** El título de la tarjeta. */
  titulo?: string
  /** Cómo se llaman estas horas en el panel: 'solicitadas', 'aprobadas'. */
  verbo?: string
  /** Qué decir cuando la semana no tiene horas. */
  vacio?: string
  /**
   * De dónde salen los empleados de un día. Sin esto, los del solicitante.
   * El jefe pasa los suyos (lo que él aprobó, con quién lo pidió).
   */
  cargarEmpleados?: (fecha: string) => Promise<{ Success?: boolean; ErrorMessage?: string; Data?: IRequesterDayEmployee[] | null } | null | undefined>
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  // Día abierto en el desglose. null = cerrado.
  const [diaAbierto, setDiaAbierto] = useState<DiaGrafico | null>(null)
  const [empleados, setEmpleados] = useState<IRequesterDayEmployee[]>([])
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false)
  const [errorEmpleados, setErrorEmpleados] = useState('')

  /** Abre el desglose de un día, igual que "Gasto por día" de DashboardHE. */
  const abrirDia = useCallback(
    async (dia: DiaGrafico) => {
      const fecha = String(dia?.Fecha ?? '').substring(0, 10)
      // Un día sin horas no tiene a quién mostrar.
      if (!companyCode || !fecha || !(Number(dia.Horas_Solicitadas) > 0)) return

      setDiaAbierto(dia)
      setEmpleados([])
      setErrorEmpleados('')
      setCargandoEmpleados(true)

      try {
        const res = cargarEmpleados
          ? await cargarEmpleados(fecha)
          : await overtimeService.getRequesterDayEmployees(companyCode, fecha)
        if (!res?.Success) {
          setErrorEmpleados(res?.ErrorMessage || 'No se pudo cargar el detalle del día.')
          return
        }
        setEmpleados(res.Data ?? [])
      } catch (err) {
        setErrorEmpleados(handleError(err).message)
      } finally {
        setCargandoEmpleados(false)
      }
    },
    [companyCode, cargarEmpleados],
  )

  const cerrarDia = useCallback(() => {
    setDiaAbierto(null)
    setEmpleados([])
    setErrorEmpleados('')
  }, [])

  const maximo = useMemo(
    () => dias.reduce((m, d) => Math.max(m, Number(d.Horas_Solicitadas ?? 0)), 0),
    [dias],
  )
  const total = useMemo(
    () => dias.reduce((acc, d) => acc + Number(d.Horas_Solicitadas ?? 0), 0),
    [dias],
  )

  // La tarjeta va dentro del ScrollView con 16 de margen y 12 de relleno.
  const anchoTarjeta = width - 56
  const medidas = useMemo(() => medidasColumnas(dias.length, anchoTarjeta), [dias.length, anchoTarjeta])

  const barras = useMemo(
    () =>
      dias.map(d => {
        const clave = String(d.Fecha ?? '').substring(0, 10)
        const horas = Number(d.Horas_Solicitadas ?? 0)
        return {
          value: horas,
          label: `${DIAS_CORTOS[d.Dia_Semana] ?? ''}
${clave.substring(8, 10)}/${clave.substring(5, 7)}`,
          frontColor: maximo > 0 && horas === maximo ? COLOR_BARRA : COLOR_BARRA_SUAVE,
          onPress: () => abrirDia(d),
          // El número arriba de la columna: no hay que adivinarlo por la
          // altura contra el eje. Los días en cero no llevan nada.
          topLabelComponent: () =>
            horas > 0 ? (
              <Text fontSize={9} fontWeight="800" color="$text" marginBottom={2} numberOfLines={1}>
                {fmtHoras(horas)}
              </Text>
            ) : null,
        }
      }),
    [dias, maximo, abrirDia],
  )

  const escala = useMemo(() => escalaEje(maximo), [maximo])

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="center" justifyContent="space-between" gap="$2">
        {/* Mismo estilo que el título de la tarjeta de arriba. */}
        <YStack flex={1} minWidth={0}>
          <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.4} numberOfLines={1}>
            {titulo}
          </Text>
          {!cargando && maximo > 0 && (
            <Text fontSize={9} color="$textMuted">
              Toque un día para ver sus empleados
            </Text>
          )}
        </YStack>
        {/* El total sale de ESTAS columnas: el número y el dibujo no pueden
            discrepar. Coincide con el de la tarjeta de arriba. */}
        {!cargando && dias.length > 0 && (
          <Text fontSize={13} fontWeight="800" color="$text" fontVariant={['tabular-nums']}>
            {fmtHoras(total)}
          </Text>
        )}
      </XStack>

      {cargando ? (
        <XStack height={CHART_H} alignItems="flex-end" justifyContent="space-around" gap="$2">
          {[55, 80, 40, 95, 65, 30, 45].map((h, i) => (
            <View
              key={i}
              width={BAR_W_MAX}
              height={`${h}%`}
              borderTopLeftRadius={3}
              borderTopRightRadius={3}
              backgroundColor="$textDisabled"
              opacity={0.3}
            />
          ))}
        </XStack>
      ) : dias.length === 0 || maximo === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <CalendarX size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {dias.length === 0 ? 'No se pudieron cargar los días de la semana.' : vacio}
          </Text>
        </YStack>
      ) : (
        <View width={anchoTarjeta} overflow="hidden">
          <BarChart
            data={barras}
            width={medidas.plot}
            disableScroll={!medidas.scroll}
            height={CHART_H}
            barWidth={medidas.barW}
            spacing={medidas.spacing}
            initialSpacing={BAR_INITIAL}
            /* Paso limpio y solo las divisiones necesarias (ver escalaEje). */
            noOfSections={escala.secciones}
            stepValue={escala.paso}
            maxValue={escala.paso * escala.secciones}
            barBorderTopLeftRadius={3}
            barBorderTopRightRadius={3}
            /* Un día con poco no puede quedar invisible junto a uno con mucho. */
            minHeight={2}
            yAxisLabelWidth={Y_LABEL_W}
            yAxisTextStyle={{ fontSize: 9, color: muted }}
            labelWidth={medidas.barW + medidas.spacing}
            xAxisLabelTextStyle={{ fontSize: 8, color: muted, textAlign: 'center' }}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={grid}
            rulesColor={grid}
            rulesType="dashed"
            formatYLabel={(valor: string) => {
              const n = Number(valor)
              return n ? `${Math.round(n * 10) / 10}h` : '0'
            }}
            onPress={(_item: any, index: number) => {
              const dia = dias[index]
              if (dia) abrirDia(dia)
            }}
          />
        </View>
      )}

      <DesgloseEmpleados
        abierto={!!diaAbierto}
        titulo={diaAbierto ? diaYFecha(String(diaAbierto.Fecha ?? '')) : ''}
        subtitulo={`${fmtHoras(diaAbierto?.Horas_Solicitadas ?? 0)} ${verbo} · ${empleados.length} empleado(s)`}
        vacio={`Ese día no tiene empleados con horas extra ${verbo}.`}
        empleados={empleados}
        cargando={cargandoEmpleados}
        error={errorEmpleados}
        onCerrar={cerrarDia}
      />
    </YStack>
  )
}

/**
 * 3. Las horas pedidas por módulo.
 *
 * Barras HORIZONTALES y no columnas: el nombre del módulo ('PETOS Y PINZAS M1')
 * no entra debajo de una columna, y recortado no se reconoce. Así cada nombre
 * va entero a la izquierda de su barra.
 *
 * Mismos colores que el gráfico de días: el módulo con más horas en naranja
 * fuerte y el resto apagado. 'Sin módulo' viene al final desde el servidor.
 */
export function GraficoModulos({
  modulos,
  error,
  cargando,
  companyCode,
  semana,
  titulo = 'HORAS SOLICITADAS POR MÓDULO',
  verbo = 'solicitadas',
  vacio = 'No pediste horas extra en esta semana.',
  cargarEmpleados,
}: {
  modulos: IRequesterWeekModule[]
  error: string
  cargando: boolean
  companyCode: string
  semana: IPayWebWeek | null
  /** El título de la tarjeta. */
  titulo?: string
  /** Cómo se llaman estas horas en el panel: 'solicitadas', 'aprobadas'. */
  verbo?: string
  /** Qué decir cuando la semana no tiene horas. */
  vacio?: string
  /**
   * De dónde salen los empleados de un módulo. Sin esto, los del solicitante.
   * El jefe pasa los suyos (lo que él aprobó, con quién lo pidió).
   */
  cargarEmpleados?: (
    modulo: string,
    inicio: string,
    fin: string,
  ) => Promise<{ Success?: boolean; ErrorMessage?: string; Data?: IRequesterDayEmployee[] | null } | null | undefined>
}) {
  const maximo = modulos.reduce((m, x) => Math.max(m, Number(x.Horas_Solicitadas ?? 0)), 0)

  // Módulo abierto en el desglose. null = cerrado.
  const [abierto, setAbierto] = useState<IRequesterWeekModule | null>(null)
  const [empleados, setEmpleados] = useState<IRequesterDayEmployee[]>([])
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false)
  const [errorEmpleados, setErrorEmpleados] = useState('')

  const abrirModulo = useCallback(
    async (m: IRequesterWeekModule) => {
      const inicio = semana?.InitialDate?.substring(0, 10)
      const fin = semana?.FinalDate?.substring(0, 10)
      if (!companyCode || !inicio || !fin || !m?.Modulo) return

      setAbierto(m)
      setEmpleados([])
      setErrorEmpleados('')
      setCargandoEmpleados(true)

      try {
        const res = cargarEmpleados
          ? await cargarEmpleados(m.Modulo, inicio, fin)
          : await overtimeService.getRequesterModuleEmployees(companyCode, inicio, fin, m.Modulo)
        if (!res?.Success) {
          setErrorEmpleados(res?.ErrorMessage || 'No se pudo cargar el detalle del módulo.')
          return
        }
        setEmpleados(res.Data ?? [])
      } catch (err) {
        setErrorEmpleados(handleError(err).message)
      } finally {
        setCargandoEmpleados(false)
      }
    },
    [companyCode, semana, cargarEmpleados],
  )

  const cerrar = useCallback(() => {
    setAbierto(null)
    setEmpleados([])
    setErrorEmpleados('')
  }, [])

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="center" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.4} numberOfLines={1}>
            {titulo}
          </Text>
          {!cargando && modulos.length > 0 && (
            <Text fontSize={9} color="$textMuted">
              Toque un módulo para ver sus empleados
            </Text>
          )}
        </YStack>
        {!cargando && modulos.length > 0 && (
          <Text fontSize={11} color="$textMuted">
            {modulos.length} módulo(s)
          </Text>
        )}
      </XStack>

      {cargando ? (
        <YStack gap="$2">
          {[90, 65, 45].map((w, i) => (
            <View key={i} height={14} width={`${w}%`} borderRadius={4} backgroundColor="$textDisabled" opacity={0.3} />
          ))}
        </YStack>
      ) : error ? (
        <Text fontSize={11} color="$textMuted" paddingVertical="$2">
          {error}
        </Text>
      ) : modulos.length === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$4">
          <CalendarX size={24} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center">
            {vacio}
          </Text>
        </YStack>
      ) : (
        <YStack gap="$2.5">
          {modulos.map(m => {
            const horas = Number(m.Horas_Solicitadas ?? 0)
            const esMayor = maximo > 0 && horas === maximo
            const sinModulo = m.Modulo === 'Sin módulo'
            // Nunca menos del 3%: un módulo con poco tiene que verse.
            const ancho = maximo > 0 ? Math.max(3, (horas / maximo) * 100) : 0

            return (
              <YStack
                key={m.Modulo}
                gap={3}
                paddingVertical={2}
                pressStyle={{ opacity: 0.6 }}
                onPress={() => abrirModulo(m)}
              >
                <XStack justifyContent="space-between" alignItems="center" gap="$2">
                  <Text
                    fontSize={12}
                    fontWeight="700"
                    color={sinModulo ? '$textMuted' : '$text'}
                    fontStyle={sinModulo ? 'italic' : 'normal'}
                    flex={1}
                    numberOfLines={1}
                  >
                    {m.Modulo}
                  </Text>
                  <Text fontSize={12} fontWeight="800" color="$text" fontVariant={['tabular-nums']}>
                    {fmtHoras(horas)}
                  </Text>
                </XStack>

                <View height={8} borderRadius={4} backgroundColor="$backgroundSurface" overflow="hidden">
                  <View
                    height={8}
                    borderRadius={4}
                    width={`${ancho}%`}
                    style={{
                      backgroundColor: sinModulo ? '#CBD5E1' : esMayor ? COLOR_BARRA : COLOR_BARRA_SUAVE,
                    }}
                  />
                </View>

                <Text fontSize={10} color="$textMuted">
                  {m.Empleados} empleado(s) · {m.Solicitudes} solicitud(es)
                </Text>
              </YStack>
            )
          })}
        </YStack>
      )}

      <DesgloseEmpleados
        abierto={!!abierto}
        titulo={abierto?.Modulo ?? ''}
        subtitulo={`${fmtHoras(abierto?.Horas_Solicitadas ?? 0)} ${verbo} · ${abierto?.Empleados ?? 0} empleado(s) en la semana`}
        vacio={`Ese módulo no tiene empleados con horas extra ${verbo} en la semana.`}
        empleados={empleados}
        cargando={cargandoEmpleados}
        error={errorEmpleados}
        onCerrar={cerrar}
      />
    </YStack>
  )
}

const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** El horario en 24 h, igual que el resto del módulo: '13:00 – 17:00'. */
const horarioCorto = (inicio: string | null | undefined, fin: string | null | undefined): string => {
  const hhmm = (iso: string | null | undefined) => {
    const t = String(iso ?? '').substring(11, 16)
    return /^\d{2}:\d{2}$/.test(t) ? t : null
  }
  const a = hhmm(inicio)
  const b = hhmm(fin)
  if (!a || !b) return ''
  return `${a} – ${b}`
}

/** 'yyyy-mm-dd' a 'Miércoles 23/09', con partes locales. */
const diaYFecha = (iso: string): string => {
  const [y, m, d] = iso.substring(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  const fecha = new Date(y, m - 1, d)
  return `${DIAS_LARGOS[(fecha.getDay() + 6) % 7]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** Color de cada estado, los mismos de la tarjeta de la semana. */
const colorEstado = (estado: string, theme: any): string =>
  estado === 'Aprobada'
    ? (theme.success?.val as string)
    : estado === 'Rechazada'
      ? (theme.error?.val as string)
      : (theme.warning?.val as string)

/**
 * Los empleados detrás de una columna del gráfico por día.
 *
 * Mismo diálogo que el de DashboardHE —sube desde abajo, totales arriba, un
 * renglón por empleado con su reparto por banda— para que los dos tableros se
 * usen igual. La diferencia es lo que va a la derecha: en lugar del COSTO, el
 * ESTADO y el horario, que es lo que le importa a quien pidió las horas.
 */
function DesgloseEmpleados({
  abierto,
  titulo,
  subtitulo,
  vacio,
  empleados,
  cargando,
  error,
  onCerrar,
}: {
  abierto: boolean
  titulo: string
  subtitulo: string
  /** Qué decir cuando la consulta salió bien y no hay nadie. */
  vacio: string
  empleados: IRequesterDayEmployee[]
  cargando: boolean
  error: string
  onCerrar: () => void
}) {
  const theme = useTheme()
  const totalHoras = empleados.reduce((acc, e) => acc + Number(e.Horas ?? 0), 0)
  const cuenta = (estado: string) => empleados.filter(e => e.Estado === estado).length

  return (
    <Modal visible={abierto} transparent animationType="slide" onRequestClose={onCerrar}>
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
          <YStack gap={2}>
            <Text fontSize={15} fontWeight="800" color="$text" numberOfLines={1}>
              {titulo}
            </Text>
            <Text fontSize={10} color="$textMuted">
              {subtitulo}
            </Text>
          </YStack>

          {/* Totales: las horas del día y cómo van, con los colores de la
              tarjeta de la semana. */}
          <XStack
            justifyContent="space-between"
            backgroundColor="$backgroundSurface"
            borderRadius="$4"
            paddingVertical="$2"
            paddingHorizontal="$3"
          >
            <YStack>
              <Text fontSize={9} color="$textMuted">
                Horas
              </Text>
              <Text fontSize={14} fontWeight="800" color="$text">
                {fmtHoras(totalHoras)}
              </Text>
            </YStack>
            {(['Aprobada', 'En proceso', 'Rechazada'] as const).map(e => (
              <YStack key={e} alignItems="flex-end">
                <Text fontSize={9} color="$textMuted">
                  {e === 'Aprobada' ? 'Aprobadas' : e === 'Rechazada' ? 'Rechazadas' : 'En proceso'}
                </Text>
                <Text fontSize={14} fontWeight="800" style={{ color: colorEstado(e, theme) }}>
                  {cuenta(e)}
                </Text>
              </YStack>
            ))}
          </XStack>

          {cargando ? (
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
            <Text fontSize={12} color="$error" lineHeight={17}>
              {error}
            </Text>
          ) : empleados.length === 0 ? (
            <Text fontSize={12} color="$textMuted" lineHeight={17}>
              {vacio}
            </Text>
          ) : (
            <FlatList
              data={empleados}
              keyExtractor={e => String(e.Id)}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View height={1} backgroundColor="$border" opacity={0.5} />}
              renderItem={({ item }) => {
                const color = colorEstado(item.Estado, theme)
                const horario = horarioCorto(item.Start_Time, item.End_Time)
                // Solo en el desglose por módulo, que junta varios días.
                const dia = item.Fecha ? diaYFecha(String(item.Fecha)) : ''

                return (
                  <YStack paddingVertical="$2.5" gap="$1.5">
                    <XStack gap="$2" alignItems="center">
                      <YStack flex={1} minWidth={0}>
                        <Text fontSize={12} fontWeight="700" color="$text" numberOfLines={2}>
                          {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
                        </Text>
                        <Text fontSize={9} color="$textMuted" numberOfLines={1}>
                          {[item.Correlative, item.Category_Name].filter(Boolean).join(' · ')}
                        </Text>
                        {/* Solo en el tablero del jefe: quién lo pidió. */}
                        {!!item.Solicitante && (
                          <Text fontSize={9} color="$textSecondary" numberOfLines={1}>
                            Solicitó: {item.Solicitante}
                          </Text>
                        )}
                      </YStack>

                      <YStack alignItems="flex-end" gap={2}>
                        <Text fontSize={12} fontWeight="800" color="$text">
                          {fmtHoras(item.Horas)}
                        </Text>
                        <Text fontSize={9} fontWeight="800" style={{ color }}>
                          {item.Estado}
                        </Text>
                      </YStack>
                    </XStack>

                    <XStack alignItems="center" gap="$2" flexWrap="wrap">
                      {!!(dia || horario) && (
                        <Text fontSize={9} color="$textMuted">
                          {[dia, horario].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      {item.Is_Manual && (
                        <XStack
                          alignItems="center"
                          gap="$1"
                          paddingHorizontal={6}
                          paddingVertical={1}
                          borderRadius={20}
                          backgroundColor="#FFF7ED"
                          borderWidth={1}
                          borderColor="#FDBA74"
                        >
                          <Pencil size={9} color="#C2410C" />
                          <Text fontSize={9} fontWeight="800" color="#C2410C">
                            HE Manual
                          </Text>
                        </XStack>
                      )}
                    </XStack>

                    {/* En qué banda cayeron sus horas: el mismo componente de
                        DashboardHE y de las bandejas. */}
                    <DistribucionHoras conceptos={parseConceptos(item.ConceptsJson)} compacta />
                  </YStack>
                )
              }}
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

/** Tope de barras del top y el más gruesa que puede llegar a ser una. */
export const TOP_MAX = 8
const TOP_BAR_W_MAX = 56

/**
 * Ancho de las columnas del top según CUÁNTOS empleados haya.
 *
 * Con los 8 se reparten el ancho como las del gráfico de días. Con menos, cada
 * columna se ENGROSA hasta llenar la tarjeta —tres columnas finitas en medio de
 * un espacio vacío se leen como un gráfico roto—, pero con un tope: una sola
 * barra a todo lo ancho parecería un bloque y no una columna.
 */
export const medidasTop = (columnas: number, anchoVisible: number) => {
  const plot = Math.max(140, anchoVisible - Y_LABEL_W)
  const n = Math.max(1, columnas)
  const porColumna = (plot - BAR_INITIAL) / n

  // La barra se queda con ~62% de su lugar y el resto es aire entre columnas.
  const barW = Math.max(BAR_W_MIN, Math.min(TOP_BAR_W_MAX, Math.round(porColumna * 0.62)))
  const spacing = Math.max(BAR_SPACING_MIN, Math.round(porColumna - barW))

  // Cada columna centrada en su lugar: sin esto el aire sobrante quedaba todo a
  // la derecha, y con un solo empleado la barra aparecía pegada al eje.
  const inicial = BAR_INITIAL + Math.round(spacing / 2)

  return { plot, barW, spacing, inicial }
}

/**
 * El rótulo del eje: primer nombre y primer apellido ('Rosa Vasquez').
 *
 * Va en UNA línea y rotado (ver rotateLabel más abajo): así entra entero
 * debajo de su columna sin montarse sobre la de al lado. El nombre completo
 * sale al tocar la barra.
 *
 * Con cuatro palabras el primer apellido es la tercera (nombre, segundo
 * nombre, apellido, apellido); con menos, la segunda.
 */
export const rotuloEmpleado = (nombre: string): string => {
  const partes = String(nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return ''
  const apellido = partes.length >= 4 ? partes[2] : (partes[1] ?? '')
  return apellido ? `${partes[0]} ${apellido}` : partes[0]
}

/**
 * 4. Los empleados con más horas extra en la semana.
 *
 * Columnas verticales, mismo estilo que el de días: el primero en naranja
 * fuerte y el resto apagado, el total encima de cada columna, y la escala del
 * eje Y con pasos limpios (escalaEje). Vienen ordenados de mayor a menor desde
 * el servidor, así que se leen como un podio de izquierda a derecha.
 */
export function GraficoTop({
  empleados,
  error,
  cargando,
  titulo = `TOP ${TOP_MAX} EMPLEADOS CON MÁS HORAS`,
  verbo = 'solicitadas',
  vacio = 'No pediste horas extra en esta semana.',
  etiquetaAprobadas = 'Aprobadas',
  etiquetaEnProceso = 'En proceso' as string | null,
}: {
  empleados: IRequesterTopEmployee[]
  error: string
  cargando: boolean
  /** El título de la tarjeta. */
  titulo?: string
  /** Cómo se llaman estas horas en el detalle: 'solicitadas', 'aprobadas'. */
  verbo?: string
  /** Qué decir cuando la semana no tiene horas. */
  vacio?: string
  /** Los nombres de las dos partes en el detalle. El jefe dice qué pasó
   *  null en etiquetaEnProceso = una sola parte (el jefe: 'Aprobadas por mí'). */
  etiquetaAprobadas?: string
  etiquetaEnProceso?: string | null
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const lista = empleados.slice(0, TOP_MAX)
  const maximo = lista.reduce((m, e) => Math.max(m, Number(e.Horas_Solicitadas ?? 0)), 0)

  // El empleado abierto en el detalle. null = cerrado.
  const [abierto, setAbierto] = useState<IRequesterTopEmployee | null>(null)
  const escala = useMemo(() => escalaEje(maximo), [maximo])

  // La tarjeta va dentro del ScrollView con 16 de margen y 12 de relleno.
  const anchoTarjeta = width - 56
  const medidas = useMemo(() => medidasTop(lista.length, anchoTarjeta), [lista.length, anchoTarjeta])

  const barras = useMemo(
    () =>
      lista.map((e, i) => {
        const horas = Number(e.Horas_Solicitadas ?? 0)
        return {
          value: horas,
          label: rotuloEmpleado(e.Employee_Name),
          // El primero —el que más horas tiene— en naranja fuerte.
          frontColor: i === 0 ? COLOR_BARRA : COLOR_BARRA_SUAVE,
          onPress: () => setAbierto(e),
          topLabelComponent: () =>
            horas > 0 ? (
              <Text fontSize={9} fontWeight="800" color="$text" marginBottom={2} numberOfLines={1}>
                {fmtHoras(horas)}
              </Text>
            ) : null,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empleados],
  )

  const muted = (theme.textMuted?.val as string) ?? '#94A3B8'
  const grid = (theme.border?.val as string) ?? '#E2E8F0'

  return (
    <YStack
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      padding="$3"
      gap="$2.5"
      {...shadows.sm}
    >
      <XStack alignItems="center" justifyContent="space-between" gap="$2">
        <YStack flex={1} minWidth={0}>
          <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.4} numberOfLines={1}>
            {titulo}
          </Text>
          {!cargando && lista.length > 0 && (
            <Text fontSize={9} color="$textMuted">
              Sin las rechazadas · toque una barra para ver el detalle
            </Text>
          )}
        </YStack>
        {!cargando && lista.length > 0 && (
          <Text fontSize={11} color="$textMuted">
            {lista.length} empleado(s)
          </Text>
        )}
      </XStack>

      {cargando ? (
        <XStack height={CHART_H} alignItems="flex-end" justifyContent="space-around" gap="$2">
          {[95, 80, 70, 60, 50, 40, 30, 20].map((h, i) => (
            <View
              key={i}
              width={BAR_W_MIN + 8}
              height={`${h}%`}
              borderTopLeftRadius={3}
              borderTopRightRadius={3}
              backgroundColor="$textDisabled"
              opacity={0.3}
            />
          ))}
        </XStack>
      ) : error ? (
        <Text fontSize={11} color="$textMuted" paddingVertical="$2">
          {error}
        </Text>
      ) : lista.length === 0 || maximo === 0 ? (
        <YStack alignItems="center" justifyContent="center" gap="$1.5" paddingVertical="$5">
          <CalendarX size={26} color="#94A3B8" />
          <Text fontSize={11} color="$textMuted" textAlign="center" lineHeight={16}>
            {vacio}
          </Text>
        </YStack>
      ) : (
        <View width={anchoTarjeta} overflow="hidden">
          <BarChart
            data={barras}
            width={medidas.plot}
            disableScroll
            height={CHART_H}
            barWidth={medidas.barW}
            spacing={medidas.spacing}
            initialSpacing={medidas.inicial}
            noOfSections={escala.secciones}
            stepValue={escala.paso}
            maxValue={escala.paso * escala.secciones}
            barBorderTopLeftRadius={3}
            barBorderTopRightRadius={3}
            minHeight={2}
            yAxisLabelWidth={Y_LABEL_W}
            yAxisTextStyle={{ fontSize: 9, color: muted }}
            labelWidth={medidas.barW}
            xAxisLabelTextStyle={{ fontSize: 8, color: muted, textAlign: 'center' }}
            // El nombre en una línea y girado: entra entero sin montarse sobre
            // la columna vecina. El alto extra es para que el giro no se corte.
            rotateLabel
            labelsExtraHeight={34}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={grid}
            rulesColor={grid}
            rulesType="dashed"
            formatYLabel={(valor: string) => {
              const n = Number(valor)
              return n ? `${Math.round(n * 10) / 10}h` : '0'
            }}
            onPress={(_item: any, index: number) => {
              const e = lista[index]
              if (e) setAbierto(e)
            }}
          />
        </View>
      )}

      <DetalleEmpleadoTop
        empleado={abierto}
        verbo={verbo}
        etiquetaAprobadas={etiquetaAprobadas}
        etiquetaEnProceso={etiquetaEnProceso}
        onCerrar={() => setAbierto(null)}
      />
    </YStack>
  )
}

/**
 * El detalle de UN empleado del top, al tocar su barra.
 *
 * Nombre completo y código —el eje solo lleva nombre y apellido—, módulo,
 * posición, y sus horas de la semana repartidas en aprobadas y en proceso. Las
 * rechazadas no vienen: no suben a nadie en el top.
 *
 * Mismo diálogo que los demás desgloses (sube desde abajo), pero sin lista:
 * acá es una sola persona.
 */
function DetalleEmpleadoTop({
  empleado,
  verbo,
  etiquetaAprobadas,
  etiquetaEnProceso,
  onCerrar,
}: {
  empleado: IRequesterTopEmployee | null
  verbo: string
  etiquetaAprobadas: string
  etiquetaEnProceso: string | null
  onCerrar: () => void
}) {
  const theme = useTheme()
  const verde = theme.success?.val as string
  const ambar = theme.warning?.val as string

  const total = Number(empleado?.Horas_Solicitadas ?? 0)
  const aprobadas = Number(empleado?.Horas_Aprobadas ?? 0)
  const enProceso = Number(empleado?.Horas_En_Proceso ?? 0)

  return (
    <Modal visible={!!empleado} transparent animationType="slide" onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="flex-end">
        <YStack
          backgroundColor="$backgroundElevated"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          paddingHorizontal="$4"
          paddingTop="$4"
          paddingBottom="$5"
          gap="$3"
        >
          {/* Quién es: nombre completo con su código. */}
          <YStack gap={2}>
            <Text fontSize={15} fontWeight="800" color="$text" numberOfLines={2}>
              {empleado ? nombreConCodigo(empleado.Employee_Name, empleado.Employee_Code) : ''}
            </Text>
            <Text fontSize={10} color="$textMuted">
              {empleado?.Solicitudes ?? 0} solicitud(es)
            </Text>
          </YStack>

          {/* Dónde está. */}
          <YStack
            gap="$1.5"
            backgroundColor="$backgroundSurface"
            borderRadius="$4"
            paddingVertical="$2"
            paddingHorizontal="$3"
          >
            <XStack justifyContent="space-between" gap="$2">
              <Text fontSize={10} color="$textMuted">
                Módulo
              </Text>
              <Text
                fontSize={12}
                fontWeight="700"
                color={empleado?.Modulo === 'Sin módulo' ? '$textMuted' : '$text'}
                flex={1}
                textAlign="right"
                numberOfLines={1}
              >
                {empleado?.Modulo || 'Sin módulo'}
              </Text>
            </XStack>
            <XStack justifyContent="space-between" gap="$2">
              <Text fontSize={10} color="$textMuted">
                Posición
              </Text>
              <Text fontSize={12} fontWeight="700" color="$text" flex={1} textAlign="right" numberOfLines={1}>
                {empleado?.Posicion || '—'}
              </Text>
            </XStack>
          </YStack>

          {/* Sus horas: el total y en qué quedaron. Mismos colores que la
              tarjeta de la semana. */}
          <YStack gap="$2">
            <XStack alignItems="baseline" gap="$1.5">
              <Text fontSize={24} fontWeight="800" color="$text">
                {fmtHoras(total)}
              </Text>
              <Text fontSize={12} fontWeight="600" color="$textSecondary">
                {verbo} en la semana
              </Text>
            </XStack>

            <XStack height={10} borderRadius={5} overflow="hidden" backgroundColor="$backgroundSurface">
              {aprobadas > 0 && <View flex={aprobadas} style={{ backgroundColor: verde }} />}
              {enProceso > 0 && <View flex={enProceso} style={{ backgroundColor: ambar }} />}
            </XStack>

            <XStack gap="$3">
              <YStack flex={1} gap={1}>
                <XStack gap="$1" alignItems="center">
                  <View width={8} height={8} borderRadius={4} style={{ backgroundColor: verde }} />
                  <Text fontSize={11} fontWeight="600" color="$textSecondary">
                    {etiquetaAprobadas}
                  </Text>
                </XStack>
                <Text fontSize={14} fontWeight="800" color="$text">
                  {fmtHoras(aprobadas)}
                </Text>
              </YStack>
              {etiquetaEnProceso != null && (
                <YStack flex={1} gap={1}>
                  <XStack gap="$1" alignItems="center">
                    <View width={8} height={8} borderRadius={4} style={{ backgroundColor: ambar }} />
                    <Text fontSize={11} fontWeight="600" color="$textSecondary">
                      {etiquetaEnProceso}
                    </Text>
                  </XStack>
                  <Text fontSize={14} fontWeight="800" color="$text">
                    {fmtHoras(enProceso)}
                  </Text>
                </YStack>
              )}
            </XStack>

            <Text fontSize={10} color="$textMuted">
              No incluye horas rechazadas.
            </Text>
          </YStack>

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
