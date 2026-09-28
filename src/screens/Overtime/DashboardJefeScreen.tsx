import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { Modal, RefreshControl, ScrollView, useWindowDimensions } from 'react-native'
import { BarChart } from 'react-native-gifted-charts'
import { YStack, XStack, Text, View, Card, Button, styled, useTheme } from 'tamagui'
import { ArrowLeft, CalendarX, Clock, FileText, UserRound, Users } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import AppSelect from '../../components/commons/AppSelect'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IApproverWeekDay,
  IApproverWeekSummary,
  IPayWebWeek,
  IRequesterWeekModule,
  IRequesterTopEmployee,
  IApproverTopRequester,
} from '../../api/modules/overtime/overtime.types'
// El gráfico por día es EL MISMO del tablero del solicitante: así los dos se
// ven y se usan igual, y un cambio en uno llega al otro.
import {
  BAR_INITIAL,
  BAR_W_MIN,
  CHART_H,
  COLOR_BARRA,
  COLOR_BARRA_SUAVE,
  GraficoDias,
  GraficoModulos,
  GraficoTop,
  TOP_MAX,
  Y_LABEL_W,
  escalaEje,
  medidasTop,
  rotuloEmpleado,
} from './DashboardSolicitanteScreen'
import { fmtHoras } from './Overtime.utils'
import { shadows } from '../../theme/shadows'

// El tablero del JEFE: lo que llega a su bandeja y lo que firmó, en números.
//
// Se entra desde la bandeja de aprobación (Solicitudes HE) cuando la entidad
// elegida es la del Jefe, y "atrás" regresa a ella: por eso va como pantalla
// hija de ese listado, igual que el tablero del solicitante cuelga de "Mis
// solicitudes". Mismo diseño que ese tablero.
//
// 1. Lo que aprobé en la semana.

const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

type JefeRouteParams = {
  dashboardJefeHE?: {
    /** La entidad con la que firma el jefe: solo cuentan sus firmas con ella. */
    entityId?: number
  }
}

/** 'Sem 39 · 22/09 - 28/09', igual que en los otros tableros. */
const etiquetaSemana = (w: IPayWebWeek): string => {
  const corta = (iso: string | null) =>
    iso ? iso.substring(0, 10).split('-').reverse().slice(0, 2).join('/') : ''
  return `Sem ${w.WeekNumber} · ${corta(w.InitialDate)} - ${corta(w.FinalDate)}`
}

const claveSemana = (w: IPayWebWeek) => `${w.Year}-${w.WeekNumber}`

export default function DashboardJefeScreen() {
  const navigation = useNavigation()
  const route = useRoute<RouteProp<JefeRouteParams, 'dashboardJefeHE'>>()
  const entityId = route.params?.entityId ?? 0

  const { defaultCompany } = useAuth()
  const companyCode = defaultCompany?.Code ?? ''

  const [semanas, setSemanas] = useState<IPayWebWeek[]>([])
  const [semana, setSemana] = useState('')
  const [resumen, setResumen] = useState<IApproverWeekSummary | null>(null)
  const [dias, setDias] = useState<IApproverWeekDay[]>([])
  const [modulos, setModulos] = useState<IRequesterWeekModule[]>([])
  const [errorModulos, setErrorModulos] = useState('')
  const [top, setTop] = useState<IRequesterTopEmployee[]>([])
  const [errorTop, setErrorTop] = useState('')
  const [solicitantes, setSolicitantes] = useState<IApproverTopRequester[]>([])
  const [errorSolicitantes, setErrorSolicitantes] = useState('')
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Resumen de aprobaciones
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

  // De la más reciente a la más vieja, igual que los otros tableros.
  const opcionesSemana = useMemo(
    () => [...semanas].reverse().map(w => ({ label: etiquetaSemana(w), value: claveSemana(w) })),
    [semanas],
  )

  const cargarResumen = useCallback(
    async (w: IPayWebWeek | null) => {
      if (!companyCode || !entityId || !w?.InitialDate || !w?.FinalDate) {
        setResumen(null)
        setDias([])
        setModulos([])
        setTop([])
        setSolicitantes([])
        return
      }
      const inicio = w.InitialDate.substring(0, 10)
      const fin = w.FinalDate.substring(0, 10)

      // En paralelo: los dos son de la misma semana y no dependen entre sí.
      const [res, resDias, resMod, resTop, resSol] = await Promise.all([
        overtimeService.getApproverWeekSummary(companyCode, entityId, inicio, fin),
        overtimeService.getApproverWeekDays(companyCode, entityId, inicio, fin),
        // Va al cubo por el servidor vinculado: puede tardar o fallar sin que
        // eso tenga que ver con lo demás, así que no tumba la pantalla.
        overtimeService.getApproverWeekModules(companyCode, entityId, inicio, fin).catch(() => null),
        overtimeService.getApproverTopEmployees(companyCode, entityId, inicio, fin).catch(() => null),
        overtimeService.getApproverTopRequesters(companyCode, entityId, inicio, fin).catch(() => null),
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
      setSolicitantes(resSol?.Success ? (resSol.Data ?? []) : [])
      setErrorSolicitantes(resSol?.Success ? '' : (resSol?.ErrorMessage || 'No se pudo cargar el top de solicitantes.'))
    },
    [companyCode, entityId],
  )

  // Al entrar: el calendario y, de inicio, la semana en curso.
  const cargarTodo = useCallback(async () => {
    if (!companyCode) return
    setError(null)
    try {
      const res = await overtimeService.getCalendarWeeks(companyCode)
      if (!res?.Success) {
        throw new Error(res?.ErrorMessage || 'No se pudo cargar el calendario de semanas.')
      }
      const lista = res.Data ?? []
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

  // Los empleados de un día: lo que ESTE jefe aprobó, con quién lo solicitó.
  const cargarEmpleadosDelDia = useCallback(
    (fecha: string) => overtimeService.getApproverDayEmployees(companyCode, entityId, fecha),
    [companyCode, entityId],
  )

  // Los empleados de un módulo: lo que ESTE jefe aprobó, con quién lo pidió.
  const cargarEmpleadosDelModulo = useCallback(
    (modulo: string, inicio: string, fin: string) =>
      overtimeService.getApproverModuleEmployees(companyCode, entityId, inicio, fin, modulo),
    [companyCode, entityId],
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

        <TarjetaAprobadas resumen={resumen} cargando={cargando} semana={semanaSel} />

        <TarjetaDespues resumen={resumen} cargando={cargando} />

        <GraficoDias
          // Las aprobadas van en Horas_Solicitadas: es la forma que dibuja el
          // gráfico compartido.
          dias={dias.map(d => ({ Fecha: d.Fecha, Dia_Semana: d.Dia_Semana, Horas_Solicitadas: d.Horas_Aprobadas }))}
          cargando={cargando}
          companyCode={companyCode}
          titulo="HORAS APROBADAS POR DÍA"
          verbo="aprobadas"
          vacio="No aprobaste horas extra ningún día de esta semana."
          cargarEmpleados={cargarEmpleadosDelDia}
        />

        <GraficoModulos
          modulos={modulos}
          error={errorModulos}
          cargando={cargando}
          companyCode={companyCode}
          semana={semanaSel}
          titulo="HORAS APROBADAS POR MÓDULO"
          verbo="aprobadas"
          vacio="No aprobaste horas extra en esta semana."
          cargarEmpleados={cargarEmpleadosDelModulo}
        />

        <GraficoTop
          empleados={top}
          error={errorTop}
          cargando={cargando}
          titulo="TOP 8 EMPLEADOS CON MÁS HORAS APROBADAS"
          verbo="aprobadas"
          vacio="No aprobaste horas extra en esta semana."
          etiquetaAprobadas="Aprobadas"
          etiquetaEnProceso="Esperando firma"
        />

        <GraficoTopSolicitantes solicitantes={solicitantes} error={errorSolicitantes} cargando={cargando} />
      </ScrollView>
    </View>
  )
}

/**
 * 1. Lo que aprobé en la semana.
 *
 * Mismo diseño que la tarjeta del solicitante: el total en grande y una barra
 * con partes que SUMAN el total. Solo cuentan las firmas del jefe: lo que
 * aprobó (verde) y lo que rechazó (rojo), falten o no las demás etapas.
 */
function TarjetaAprobadas({
  resumen,
  cargando,
  semana,
}: {
  resumen: IApproverWeekSummary | null
  cargando: boolean
  semana: IPayWebWeek | null
}) {
  const theme = useTheme()
  const verde = theme.success?.val as string
  const rojo = theme.error?.val as string

  // Solo MIS firmas: lo que aprobé y lo que rechacé, falten o no otras etapas.
  const aprobadas = resumen?.Horas_Aprobadas ?? 0
  const rechazadas = resumen?.Horas_Rechazadas ?? 0
  const total = aprobadas + rechazadas
  const partes = [
    { clave: 'a', texto: 'Aprobadas por mí', horas: aprobadas, cantidad: resumen?.Detalles_Aprobados ?? 0, color: verde },
    { clave: 'r', texto: 'Rechazadas por mí', horas: rechazadas, cantidad: resumen?.Detalles_Rechazados ?? 0, color: rojo },
  ]

  const sinNada = total === 0

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={12}
      padding="$2.5"
      borderWidth={1}
      borderColor="$border"
      opacity={cargando ? 0.6 : 1}
    >
      <YStack gap="$2">
        <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.4} numberOfLines={1}>
          HORAS QUE FIRMÉ EN LA SEMANA
        </Text>

        {sinNada && !cargando ? (
          <XStack alignItems="center" gap="$2" paddingVertical="$1.5">
            <Clock size={18} color="#CBD5E1" />
            <YStack flex={1}>
              <Text fontSize={13} fontWeight="700" color="$text">
                Sin firmas en la semana
              </Text>
              <Text fontSize={11} color="$textMuted">
                {semana
                  ? `No firmaste horas extra de la ${etiquetaSemana(semana).split(' · ')[0].replace('Sem', 'semana')}.`
                  : 'Elegí una semana.'}
              </Text>
            </YStack>
          </XStack>
        ) : (
          <>
            {/* El total, con solicitudes, empleados y solicitantes a la derecha. */}
            <XStack alignItems="center" justifyContent="space-between" gap="$2">
              <XStack alignItems="baseline" gap="$1.5">
                <Text fontSize={24} fontWeight="800" color="$text">
                  {fmtHoras(total)}
                </Text>
                <Text fontSize={12} fontWeight="600" color="$textSecondary">
                  firmadas
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
                <XStack gap="$1" alignItems="center">
                  <UserRound size={11} color={theme.textMuted?.val as string} />
                  <Text fontSize={11} color="$textMuted">
                    {resumen?.Solicitantes ?? 0} solicitante(s)
                  </Text>
                </XStack>
              </YStack>
            </XStack>

            {/* La barra: qué pasó con cada hora que aprobé. */}
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
                    <Text fontSize={11} fontWeight="600" color="$textSecondary" numberOfLines={1} flexShrink={1}>
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
          </>
        )}
      </YStack>
    </Card>
  )
}

/**
 * Qué hizo gerencia con lo que el jefe aprobó.
 *
 * Solo lo que YO aprobé, repartido según las etapas siguientes: aprobado por
 * gerencia (todas las firmas completas), pendiente de su firma, o rechazado
 * por gerencia. Las tres partes suman mis aprobadas.
 */
function TarjetaDespues({ resumen, cargando }: { resumen: IApproverWeekSummary | null; cargando: boolean }) {
  const theme = useTheme()
  const verde = theme.success?.val as string
  const ambar = theme.warning?.val as string
  const rojo = theme.error?.val as string

  const total = resumen?.Horas_Aprobadas ?? 0
  if (total === 0) return null

  const partes = [
    { clave: 'a', texto: 'Aprobadas', horas: resumen?.Horas_Aprobadas_Final ?? 0, cantidad: resumen?.Detalles_Aprobados_Final ?? 0, color: verde },
    { clave: 'e', texto: 'Pendientes', horas: resumen?.Horas_Esperando ?? 0, cantidad: resumen?.Detalles_Esperando ?? 0, color: ambar },
    { clave: 'r', texto: 'Rechazadas', horas: resumen?.Horas_Rechazadas_Despues ?? 0, cantidad: resumen?.Detalles_Rechazados_Despues ?? 0, color: rojo },
  ]

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={12}
      padding="$2.5"
      borderWidth={1}
      borderColor="$border"
      opacity={cargando ? 0.6 : 1}
    >
      <YStack gap="$2">
        <YStack>
          <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.4} numberOfLines={1}>
            RESPUESTA DE GERENCIA
          </Text>
          <Text fontSize={9} color="$textMuted">
            {`Sobre las ${fmtHoras(total)} que aprobé`}
          </Text>
        </YStack>

        <XStack height={10} borderRadius={5} overflow="hidden" backgroundColor="$backgroundSurface">
          {partes
            .filter(p => p.horas > 0)
            .map(p => (
              <View key={p.clave} flex={p.horas} style={{ backgroundColor: p.color }} />
            ))}
        </XStack>

        <XStack gap="$2">
          {partes.map(p => (
            <YStack key={p.clave} flex={1} gap={1}>
              <XStack gap="$1" alignItems="center">
                <View width={8} height={8} borderRadius={4} style={{ backgroundColor: p.color }} />
                <Text fontSize={11} fontWeight="600" color="$textSecondary" numberOfLines={1} flexShrink={1}>
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
      </YStack>
    </Card>
  )
}

/**
 * 5. Los solicitantes que más horas le piden al jefe.
 *
 * Exclusivo de este tablero. Mismo gráfico que el top de empleados —columnas
 * que se engrosan cuando son menos de 8 (medidasTop), nombre y apellido
 * girados, el primero en naranja fuerte, el total encima— para que los dos
 * tops se lean igual.
 *
 * Cada columna es lo que ese solicitante le pidió a ESTE jefe: lo que aprobó
 * más lo que rechazó. Al tocarla se ve cómo se reparte.
 */
function GraficoTopSolicitantes({
  solicitantes,
  error,
  cargando,
}: {
  solicitantes: IApproverTopRequester[]
  error: string
  cargando: boolean
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()

  const lista = solicitantes.slice(0, TOP_MAX)
  const maximo = lista.reduce((m, e) => Math.max(m, Number(e.Horas_Solicitadas ?? 0)), 0)
  const escala = useMemo(() => escalaEje(maximo), [maximo])

  // La tarjeta va dentro del ScrollView con 16 de margen y 12 de relleno.
  const anchoTarjeta = width - 56
  const medidas = useMemo(() => medidasTop(lista.length, anchoTarjeta), [lista.length, anchoTarjeta])

  const [abierto, setAbierto] = useState<IApproverTopRequester | null>(null)

  const barras = useMemo(
    () =>
      lista.map((e, i) => {
        const horas = Number(e.Horas_Solicitadas ?? 0)
        return {
          value: horas,
          label: rotuloEmpleado(e.Solicitante_Name),
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
    [solicitantes],
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
            {`TOP ${TOP_MAX} SOLICITANTES CON MÁS HORAS`}
          </Text>
          {!cargando && lista.length > 0 && (
            <Text fontSize={9} color="$textMuted">
              Lo que te pidieron · toque una barra para ver el detalle
            </Text>
          )}
        </YStack>
        {!cargando && lista.length > 0 && (
          <Text fontSize={11} color="$textMuted">
            {lista.length} solicitante(s)
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
            No firmaste horas extra de ningún solicitante en esta semana.
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
            initialSpacing={medidas.inicial ?? BAR_INITIAL}
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

      <DetalleSolicitante solicitante={abierto} onCerrar={() => setAbierto(null)} />
    </YStack>
  )
}

/**
 * El detalle de UN solicitante del top, al tocar su barra: quién es, cuántas
 * solicitudes y empleados le mandó al jefe en la semana, y qué hizo el jefe
 * con esas horas —aprobadas en verde, rechazadas en rojo—.
 */
function DetalleSolicitante({
  solicitante,
  onCerrar,
}: {
  solicitante: IApproverTopRequester | null
  onCerrar: () => void
}) {
  const theme = useTheme()
  const verde = theme.success?.val as string
  const rojo = theme.error?.val as string

  const total = Number(solicitante?.Horas_Solicitadas ?? 0)
  const aprobadas = Number(solicitante?.Horas_Aprobadas ?? 0)
  const rechazadas = Number(solicitante?.Horas_Rechazadas ?? 0)

  return (
    <Modal visible={!!solicitante} transparent animationType="slide" onRequestClose={onCerrar}>
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
          <YStack gap={2}>
            <Text fontSize={15} fontWeight="800" color="$text" numberOfLines={2}>
              {solicitante?.Solicitante_Name ?? ''}
            </Text>
            <Text fontSize={10} color="$textMuted">
              {[solicitante?.Solicitante, solicitante?.Posicion].filter(Boolean).join(' · ')}
            </Text>
          </YStack>

          <XStack
            justifyContent="space-between"
            backgroundColor="$backgroundSurface"
            borderRadius="$4"
            paddingVertical="$2"
            paddingHorizontal="$3"
          >
            <YStack>
              <Text fontSize={9} color="$textMuted">
                Solicitudes
              </Text>
              <Text fontSize={14} fontWeight="800" color="$text">
                {solicitante?.Solicitudes ?? 0}
              </Text>
            </YStack>
            <YStack alignItems="flex-end">
              <Text fontSize={9} color="$textMuted">
                Empleados
              </Text>
              <Text fontSize={14} fontWeight="800" color="$text">
                {solicitante?.Empleados ?? 0}
              </Text>
            </YStack>
          </XStack>

          <YStack gap="$2">
            <XStack alignItems="baseline" gap="$1.5">
              <Text fontSize={24} fontWeight="800" color="$text">
                {fmtHoras(total)}
              </Text>
              <Text fontSize={12} fontWeight="600" color="$textSecondary">
                te pidió en la semana
              </Text>
            </XStack>

            <XStack height={10} borderRadius={5} overflow="hidden" backgroundColor="$backgroundSurface">
              {aprobadas > 0 && <View flex={aprobadas} style={{ backgroundColor: verde }} />}
              {rechazadas > 0 && <View flex={rechazadas} style={{ backgroundColor: rojo }} />}
            </XStack>

            <XStack gap="$3">
              <YStack flex={1} gap={1}>
                <XStack gap="$1" alignItems="center">
                  <View width={8} height={8} borderRadius={4} style={{ backgroundColor: verde }} />
                  <Text fontSize={11} fontWeight="600" color="$textSecondary">
                    Aprobé
                  </Text>
                </XStack>
                <Text fontSize={14} fontWeight="800" color="$text">
                  {fmtHoras(aprobadas)}
                </Text>
              </YStack>
              <YStack flex={1} gap={1}>
                <XStack gap="$1" alignItems="center">
                  <View width={8} height={8} borderRadius={4} style={{ backgroundColor: rojo }} />
                  <Text fontSize={11} fontWeight="600" color="$textSecondary">
                    Rechacé
                  </Text>
                </XStack>
                <Text fontSize={14} fontWeight="800" color="$text">
                  {fmtHoras(rechazadas)}
                </Text>
              </YStack>
            </XStack>
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
