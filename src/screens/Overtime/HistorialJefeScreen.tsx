import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { FlatList, RefreshControl, ScrollView } from 'react-native'
import { YStack, XStack, Text, View, Card, styled, useTheme } from 'tamagui'
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, Undo2, UserRound, XCircle } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import AppSelect from '../../components/commons/AppSelect'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import { IApproverHistory, IPayWebWeek } from '../../api/modules/overtime/overtime.types'
import { fmtHora, fmtHoras, nombreConCodigo } from './Overtime.utils'

// El HISTORIAL del jefe: lo que firmó con su entidad, semana por semana.
//
// Se entra desde la bandeja de aprobación, al lado del tablero, y "atrás"
// regresa a ella. Un renglón por DECISIÓN: aprobado, rechazado o devuelto. Un
// detalle que se devolvió y después se aprobó sale dos veces, porque son dos
// cosas que el jefe hizo.

const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

type HistorialRouteParams = {
  historialJefeHE?: {
    /** La entidad con la que firma el jefe: solo cuentan sus firmas con ella. */
    entityId?: number
    /** Solo el jefe devuelve: sin eso no se muestra el filtro de devueltos. */
    puedeDevolver?: boolean
  }
}

type Filtro = 'Todos' | 'Aprobado' | 'Rechazado' | 'Devuelto'

const etiquetaSemana = (w: IPayWebWeek): string => {
  const corta = (iso: string | null) =>
    iso ? iso.substring(0, 10).split('-').reverse().slice(0, 2).join('/') : ''
  return `Sem ${w.WeekNumber} · ${corta(w.InitialDate)} - ${corta(w.FinalDate)}`
}

const claveSemana = (w: IPayWebWeek) => `${w.Year}-${w.WeekNumber}`

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** 'Mié 24' de un 'yyyy-mm-dd'. */
const etiquetaDia = (clave: string): string => {
  const [a, m, d] = clave.split('-').map(Number)
  const fecha = new Date(a, m - 1, d)
  return `${DIAS[fecha.getDay()]} ${d}`
}

/** Los siete días de la semana, en 'yyyy-mm-dd'. */
const diasDeSemana = (w: IPayWebWeek | null): string[] => {
  if (!w?.InitialDate) return []
  const [a, m, d] = w.InitialDate.substring(0, 10).split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => {
    const f = new Date(a, m - 1, d + i)
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
  })
}

const claveDia = (iso: string | null | undefined) => String(iso ?? '').substring(0, 10)

/** Fecha y hora corta de la firma: '24/09 14:30'. */
const fmtFirma = (iso: string | null) => {
  if (!iso) return ''
  const s = String(iso)
  return `${s.substring(8, 10)}/${s.substring(5, 7)} ${s.substring(11, 16)}`
}

export default function HistorialJefeScreen() {
  const navigation = useNavigation()
  const route = useRoute<RouteProp<HistorialRouteParams, 'historialJefeHE'>>()
  const entityId = route.params?.entityId ?? 0
  const puedeDevolver = route.params?.puedeDevolver ?? true

  const { defaultCompany } = useAuth()
  const companyCode = defaultCompany?.Code ?? ''

  const [semanas, setSemanas] = useState<IPayWebWeek[]>([])
  const [semana, setSemana] = useState('')
  const [filas, setFilas] = useState<IApproverHistory[]>([])
  const [dia, setDia] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('Todos')
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Historial de aprobaciones
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

  const opcionesSemana = useMemo(
    () => [...semanas].reverse().map(w => ({ label: etiquetaSemana(w), value: claveSemana(w) })),
    [semanas],
  )

  const cargarSemana = useCallback(
    async (w: IPayWebWeek | null) => {
      if (!companyCode || !entityId || !w?.InitialDate || !w?.FinalDate) {
        setFilas([])
        return
      }
      const res = await overtimeService.getApproverHistory(
        companyCode,
        entityId,
        w.InitialDate.substring(0, 10),
        w.FinalDate.substring(0, 10),
      )
      if (!res?.Success) {
        throw new Error(res?.ErrorMessage || 'No se pudo cargar el historial de la semana.')
      }
      setFilas(res.Data ?? [])
    },
    [companyCode, entityId],
  )

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

      await cargarSemana(elegida)
    } catch (err) {
      setError(handleError(err))
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
    // `semana` fuera a propósito, igual que en el tablero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyCode, cargarSemana])

  useEffect(() => {
    cargarTodo()
  }, [cargarTodo])

  const cambiarSemana = useCallback(
    async (clave: string) => {
      setSemana(clave)
      setDia(null)
      const w = semanas.find(x => claveSemana(x) === clave) ?? null
      setCargando(true)
      try {
        await cargarSemana(w)
      } catch (err) {
        setError(handleError(err))
      } finally {
        setCargando(false)
      }
    },
    [semanas, cargarSemana],
  )

  const onRefresh = useCallback(() => {
    setRefrescando(true)
    cargarTodo()
  }, [cargarTodo])

  // El día filtra primero; los totales de los chips de decisión son del día.
  const delDia = useMemo(
    () => (dia ? filas.filter(f => claveDia(f.Fecha) === dia) : filas),
    [filas, dia],
  )

  const visibles = useMemo(
    () => (filtro === 'Todos' ? delDia : delDia.filter(f => f.Mi_Decision === filtro)),
    [delDia, filtro],
  )

  const conteo = useMemo(() => {
    const c = { Aprobado: 0, Rechazado: 0, Devuelto: 0 } as Record<string, number>
    for (const f of delDia) c[f.Mi_Decision] = (c[f.Mi_Decision] ?? 0) + 1
    return c
  }, [delDia])

  const horasAprobadas = useMemo(
    () => delDia.filter(f => f.Mi_Decision === 'Aprobado').reduce((a, f) => a + Number(f.Horas ?? 0), 0),
    [delDia],
  )

  const dias = useMemo(() => diasDeSemana(semanaSel), [semanaSel])

  if (error) {
    return <ErrorState title={error.title} message={error.message} onRetry={onRefresh} />
  }

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <FlatList
        data={cargando ? [] : visibles}
        keyExtractor={(f, i) => `${f.Id}-${f.Mi_Decision}-${i}`}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <YStack gap="$2.5" marginBottom="$1">
            <AppSelect
              label="Semana"
              value={semana}
              options={opcionesSemana}
              onValueChange={v => cambiarSemana(String(v))}
              placeholder={semanas.length === 0 ? 'Sin semanas' : ''}
              disabled={semanas.length === 0}
            />

            {/* Los días de la semana: "Semana" los junta todos. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Chip label="Semana" activo={dia === null} onPress={() => setDia(null)} />
              {dias.map(d => (
                <Chip key={d} label={etiquetaDia(d)} activo={dia === d} onPress={() => setDia(d)} />
              ))}
            </ScrollView>

            {/* Por decisión, con cuántas hay de cada una. */}
            <XStack gap={6} flexWrap="wrap">
              <Chip label={`Todos · ${delDia.length}`} activo={filtro === 'Todos'} onPress={() => setFiltro('Todos')} />
              <Chip label={`Aprobados · ${conteo.Aprobado ?? 0}`} activo={filtro === 'Aprobado'} onPress={() => setFiltro('Aprobado')} />
              <Chip label={`Rechazados · ${conteo.Rechazado ?? 0}`} activo={filtro === 'Rechazado'} onPress={() => setFiltro('Rechazado')} />
              {puedeDevolver && (
                <Chip label={`Devueltos · ${conteo.Devuelto ?? 0}`} activo={filtro === 'Devuelto'} onPress={() => setFiltro('Devuelto')} />
              )}
            </XStack>

            {!cargando && delDia.length > 0 && (
              <Text fontSize={11} color="$textMuted">
                {`Aprobaste ${fmtHoras(horasAprobadas)} ${dia ? 'ese día' : 'en la semana'}.`}
              </Text>
            )}
          </YStack>
        }
        ListEmptyComponent={
          cargando ? (
            <Text fontSize={12} color="$textMuted" textAlign="center" paddingVertical="$5">
              Cargando…
            </Text>
          ) : (
            <EmptyState
              title="Sin firmas"
              message={
                dia
                  ? 'No firmaste horas extra de ese día. Toque "Semana" para ver toda la semana.'
                  : puedeDevolver
                    ? 'No aprobaste, rechazaste ni devolviste horas extra en esta semana.'
                    : 'No aprobaste ni rechazaste horas extra en esta semana.'
              }
            />
          )
        }
        renderItem={({ item }) => <TarjetaDecision item={item} />}
      />
    </View>
  )
}

function Chip({ label, activo, onPress }: { label: string; activo: boolean; onPress: () => void }) {
  return (
    <View
      paddingHorizontal="$2"
      paddingVertical={5}
      borderRadius={999}
      borderWidth={1}
      borderColor={activo ? '$primary' : '$border'}
      backgroundColor={activo ? '$primaryOpacity2' : '$backgroundElevated'}
      pressStyle={{ opacity: 0.6 }}
      onPress={onPress}
    >
      <Text fontSize={10} fontWeight="700" color={activo ? '$primary' : '$textMuted'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/** Una decisión del jefe: qué hizo, sobre quién, y en qué quedó después. */
function TarjetaDecision({ item }: { item: IApproverHistory }) {
  const theme = useTheme()

  const tono =
    item.Mi_Decision === 'Aprobado'
      ? { color: theme.success?.val as string, Icono: CheckCircle2, texto: 'Aprobé' }
      : item.Mi_Decision === 'Rechazado'
        ? { color: theme.error?.val as string, Icono: XCircle, texto: 'Rechacé' }
        : { color: '#FF551A', Icono: Undo2, texto: 'Devolví' }

  // Qué pasó después de mi decisión.
  const despues =
    item.Mi_Decision === 'Devuelto'
      ? item.Resolucion === 'Corregido'
        ? 'El solicitante lo corrigió'
        : item.Resolucion === 'Eliminado'
          ? 'El solicitante lo eliminó'
          : 'Esperando corrección'
      : item.Estado === 'Aprobada'
        ? 'Aprobada por todos'
        : item.Estado === 'Rechazada'
          ? 'Rechazada'
          : item.Estado === 'Devuelta'
            ? 'Devuelta al solicitante'
            : 'Esperando otras firmas'

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={14}
      padding="$3"
      borderWidth={1}
      borderColor="$border"
      borderLeftWidth={3}
      borderLeftColor={tono.color}
    >
      <YStack gap="$1.5">
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <Text fontSize={13} fontWeight="700" color="$text" flex={1} numberOfLines={2}>
            {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
          </Text>
          <Text fontSize={15} fontWeight="800" color="$text">
            {fmtHoras(item.Horas)}
          </Text>
        </XStack>

        <XStack alignItems="center" gap="$2">
          <CalendarDays size={11} color={theme.textMuted?.val as string} />
          <Text fontSize={11} color="$textMuted">
            {item.Fecha ? etiquetaDia(claveDia(item.Fecha)) : ''} · {fmtHora(item.Start_Time)} - {fmtHora(item.End_Time)}
          </Text>
          <Text fontSize={11} fontWeight="600" color="$textMuted" marginLeft="auto">
            {item.Correlative}
          </Text>
        </XStack>

        <Text fontSize={11} color="$textSecondary" numberOfLines={2}>
          {(item.Category_Name ?? '').trim() || 'Sin motivo'}
        </Text>

        {!!item.Solicitante && (
          <XStack alignItems="center" gap="$1.5">
            <UserRound size={11} color={theme.textMuted?.val as string} />
            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
              Solicitó {nombreConCodigo(item.Solicitante)}
            </Text>
          </XStack>
        )}

        {/* Mi decisión, con su comentario y cuándo. */}
        <YStack
          gap={2}
          marginTop={2}
          padding="$2"
          borderRadius={8}
          style={{ backgroundColor: `${tono.color}14` }}
        >
          <XStack alignItems="center" gap="$1">
            <tono.Icono size={12} color={tono.color} />
            <Text fontSize={11} fontWeight="800" style={{ color: tono.color }}>
              {tono.texto}
            </Text>
            <Text fontSize={10} color="$textMuted" marginLeft="auto">
              {fmtFirma(item.Fecha_Firma)}
            </Text>
          </XStack>
          {!!item.Mi_Comentario && item.Mi_Comentario !== 'Autorizado por el solicitante al crear.' && (
            <Text fontSize={11} color="$text">
              {item.Mi_Comentario}
            </Text>
          )}
          <XStack alignItems="center" gap="$1">
            <Clock size={10} color={theme.textMuted?.val as string} />
            <Text fontSize={10} color="$textMuted">
              {despues}
            </Text>
          </XStack>
        </YStack>
      </YStack>
    </Card>
  )
}
