import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { FlatList, RefreshControl, ScrollView } from 'react-native'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  PlusCircle,
  Users,
  X,
  XCircle,
} from 'lucide-react-native'
import dayjs from 'dayjs'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { useLoader } from '../../providers/LoaderProvider'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import AppInput from '../../components/commons/AppInput'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import AppSelect from '../../components/commons/AppSelect'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeRequestDetail,
  IPayWebWeek,
  IUserEntity,
} from '../../api/modules/overtime/overtime.types'
import { fmtFecha, fmtHora, fmtHoras, nombreConCodigo, tieneFirma } from './Overtime.utils'

// Las solicitudes de horas extra que el usuario PIDIÓ, semana por semana.
//
// No es la bandeja de aprobación: ahí se firma lo de otros y no hay fechas.
// Acá se ve lo propio, filtrado por la semana del calendario de PLANILLA —que
// no coincide con la natural— y con lo aprobado y lo rechazado incluidos, que
// es justo lo que se viene a mirar.
//
// El recorte a "lo mío" lo hace el servidor: se entra con la entidad de
// Solicitante y el procedimiento limita a lo creado por el usuario.

/** Rutas a las que navega esta pantalla. */
type NavParams = {
  /**
   * El formulario. Sin parámetros crea una nueva; con `requestId` edita esa.
   *
   * Los detalles viajan junto al id porque el listado ya los tiene: pedirlos de
   * nuevo del otro lado obligaría a saber en qué semana cae la solicitud.
   */
  crearSolicitudHE: { requestId?: number; detalles?: IOvertimeRequestDetail[] } | undefined
}

/**
 * ¿La entidad indicada todavía puede firmar este renglón?
 *
 * Su columna de estado tiene que estar en 'Pendiente'. Sin columna no se
 * bloquea: puede ser una entidad que el procedimiento no expone.
 */
const puedeFirmar = (item: IOvertimeRequestDetail, nombreEntidad: string): boolean => {
  if (!nombreEntidad) return false

  const estado = String(
    item?.DynamicColumns?.[`Status_${nombreEntidad.replace(/\s+/g, '')}`] ?? '',
  ).trim()

  return estado === '' || estado === 'Pendiente'
}

/** Estado del flujo de UN renglón, leído de sus columnas dinámicas. */
type EstadoDetalle = 'aprobada' | 'rechazada' | 'pendiente'

/**
 * En qué quedó un renglón.
 *
 * Las columnas de autorización viajan en DynamicColumns como
 * `Status_<NombreSinEspacios>`, una por cada entidad del proceso. Un rechazo de
 * cualquier etapa manda: corta el flujo. Aprobada solo cuando TODAS firmaron —
 * 'No aplica' no cuenta como firma, es lo que queda después de un rechazo.
 */
const estadoDetalle = (item: IOvertimeRequestDetail): EstadoDetalle => {
  const estados = Object.entries(item?.DynamicColumns ?? {})
    .filter(([k]) => k.startsWith('Status_'))
    .map(([, v]) => String(v ?? '').trim())

  if (estados.some(e => e === 'Rechazado')) return 'rechazada'
  if (estados.length > 0 && estados.every(e => e === 'Aprobado')) return 'aprobada'
  return 'pendiente'
}

/**
 * Una solicitud con todos sus empleados.
 *
 * El listado llega renglón por renglón —un empleado cada uno— porque así se
 * aprueba. Pero quien pidió las horas pidió UNA solicitud, así que se agrupa
 * por correlativo: en el teléfono, cuatro tarjetas del mismo correlativo se
 * leen como cuatro solicitudes que nadie hizo.
 */
interface Solicitud {
  requestId: number
  correlativo: string
  fecha: string | null
  comentario: string
  detalles: IOvertimeRequestDetail[]
  horas: number
  motivos: string[]
  /** Cuántos renglones quedaron en cada estado. */
  aprobados: number
  rechazados: number
  pendientes: number
}

const agrupar = (filas: IOvertimeRequestDetail[]): Solicitud[] => {
  const mapa = new Map<number, Solicitud>()

  for (const fila of filas) {
    let grupo = mapa.get(fila.Request_Id)

    if (!grupo) {
      grupo = {
        requestId: fila.Request_Id,
        correlativo: fila.Correlative,
        fecha: fila.Date,
        comentario: fila.Comment ?? '',
        detalles: [],
        horas: 0,
        motivos: [],
        aprobados: 0,
        rechazados: 0,
        pendientes: 0,
      }
      mapa.set(fila.Request_Id, grupo)
    }

    grupo.detalles.push(fila)
    grupo.horas += fila.Total_Overtime_Hours ?? 0

    const motivo = (fila.Category_Name ?? '').trim()
    if (motivo && !grupo.motivos.includes(motivo)) grupo.motivos.push(motivo)

    const estado = estadoDetalle(fila)
    if (estado === 'aprobada') grupo.aprobados++
    else if (estado === 'rechazada') grupo.rechazados++
    else grupo.pendientes++
  }

  // De la más reciente a la más vieja: lo que se acaba de pedir es lo que se
  // viene a ver.
  return [...mapa.values()].sort((a, b) => b.requestId - a.requestId)
}

/** 'Sem 33 · 11/08 - 17/08' */
const etiquetaSemana = (w: IPayWebWeek): string => {
  const corta = (iso: string | null) =>
    iso ? iso.substring(0, 10).split('-').reverse().slice(0, 2).join('/') : ''
  return `Sem ${w.WeekNumber} · ${corta(w.InitialDate)} - ${corta(w.FinalDate)}`
}

const claveSemana = (w: IPayWebWeek) => `${w.Year}-${w.WeekNumber}`

/**
 * El 'yyyy-mm-dd' de una fecha, venga como venga.
 *
 * Las dos puntas de la comparación llegan de fuentes distintas —la fecha de la
 * solicitud y el rango del calendario— y no hay garantía de que traigan el
 * mismo formato. Se toma el prefijo cuando ya es ISO y se interpreta cuando no.
 */
const claveDia = (valor: string | null | undefined): string => {
  const s = String(valor ?? '')
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)

  const d = dayjs(s)
  return d.isValid() ? d.format('YYYY-MM-DD') : ''
}

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * Los días de una semana, para el filtro.
 *
 * Solo el nombre del día, sin la fecha: en un teléfono los siete botones con
 * fecha no caben en una fila y partirlos en dos deja el filtro ocupando más
 * espacio que la lista. La fecha completa ya está en cada tarjeta.
 */
const diasDeSemana = (w: IPayWebWeek | null): { key: string; label: string }[] => {
  if (!w?.InitialDate || !w?.FinalDate) return []

  const inicio = dayjs(claveDia(w.InitialDate))
  const fin = dayjs(claveDia(w.FinalDate))
  if (!inicio.isValid() || !fin.isValid()) return []

  const dias: { key: string; label: string }[] = []

  for (let d = inicio; !d.isAfter(fin) && dias.length < 7; d = d.add(1, 'day')) {
    dias.push({
      key: d.format('YYYY-MM-DD'),
      // dayjs pone el domingo en 0; acá la semana arranca el lunes.
      label: DIAS_CORTOS[(d.day() + 6) % 7],
    })
  }

  return dias
}

export default function MisSolicitudesHorasExtraScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<NavParams>>()
  const { defaultCompany } = useAuth()
  const theme = useTheme()
  const loader = useLoader()
  const { showToast } = useShowToast()

  const companyCode = defaultCompany?.Code ?? ''

  const [entidad, setEntidad] = useState<IUserEntity | null>(null)
  const [semanas, setSemanas] = useState<IPayWebWeek[]>([])
  const [semana, setSemana] = useState<string>('')
  const [dia, setDia] = useState<string | null>(null)
  const [filas, setFilas] = useState<IOvertimeRequestDetail[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  /**
   * Lo que se está por firmar.
   *
   * UN solo estado para aprobar y rechazar, y para un empleado o para toda la
   * solicitud: la decisión es siempre sobre una LISTA de detalles, y una fila
   * suelta es una lista de uno. Con dos estados y dos diálogos había cuatro
   * caminos que mantener parejos.
   */
  const [decidiendo, setDecidiendo] = useState<{
    correlativo: string
    detalles: IOvertimeRequestDetail[]
    aprueba: boolean
  } | null>(null)

  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [enviando, setEnviando] = useState(false)

  // El usuario no tiene la entidad de Solicitante. No es un error: es que no
  // puede pedir horas extra, y eso se dice en lugar de dejar una lista vacía.
  const [sinEntidad, setSinEntidad] = useState(false)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitudes HE
      </Text>
    ),
    right: <NotificationBell size={18} />,
  })

  // Última combinación con la que se pidieron datos, para que el cambio de
  // semana no repita la consulta que la recarga completa acaba de hacer.
  const cargadoRef = useRef<string>('')

  const semanaSel = useMemo(
    () => semanas.find(w => claveSemana(w) === semana) ?? null,
    [semanas, semana],
  )

  const dias = useMemo(() => diasDeSemana(semanaSel), [semanaSel])

  // ── Carga ─────────────────────────────────────────────────────────────────

  /**
   * La entidad de Solicitante y el calendario de planilla.
   *
   * LANZAN si fallan, y eso es a propósito: una respuesta con Success en false
   * que se tragara dejaría la pantalla con la lista vacía y sin nada que
   * reintentar, que se lee como "no pedí nada esta semana".
   */
  const cargarBase = useCallback(async () => {
    const [resEntidad, resSemanas] = await Promise.all([
      overtimeService.getRequestorEntities(companyCode),
      overtimeService.getCalendarWeeks(companyCode),
    ])

    if (!resEntidad?.Success) {
      throw new Error(resEntidad?.ErrorMessage || 'No se pudo cargar tu entidad de solicitante.')
    }
    if (!resSemanas?.Success) {
      throw new Error(resSemanas?.ErrorMessage || 'No se pudo cargar el calendario de semanas.')
    }

    const ent = (resEntidad.Data ?? [])[0] ?? null
    setEntidad(ent)
    setSinEntidad(!ent)

    const lista = resSemanas.Data ?? []
    setSemanas(lista)

    // Se conserva la semana elegida si sigue existiendo; si no, la en curso,
    // que es donde está lo que se acaba de pedir.
    const previa = lista.find(w => claveSemana(w) === semana)
    const elegida = previa ?? lista.find(w => w.IsCurrentWeek) ?? lista[lista.length - 1] ?? null

    setSemana(elegida ? claveSemana(elegida) : '')

    return { entidad: ent, semana: elegida }
  }, [companyCode, semana])

  /**
   * Las solicitudes de la semana. La entidad y la semana viajan como argumento
   * y no se leen del estado: así la función no cambia de identidad con cada
   * selección, que es lo que hacía que el efecto de foco consultara de más.
   */
  const cargarSolicitudes = useCallback(
    async (ent: IUserEntity | null, sem: IPayWebWeek | null) => {
      if (!ent) {
        setFilas([])
        return
      }

      const res = await overtimeService.getMyRequests(
        companyCode,
        ent.Id,
        sem?.InitialDate?.substring(0, 10),
        sem?.FinalDate?.substring(0, 10),
      )

      if (!res?.Success) {
        throw new Error(res?.ErrorMessage || 'No se pudieron cargar tus solicitudes.')
      }

      setFilas(res.Data ?? [])
      cargadoRef.current = `${ent.Id}|${sem ? claveSemana(sem) : ''}`
    },
    [companyCode],
  )

  /**
   * Recarga COMPLETA: entidad, calendario y solicitudes, con un solo manejador
   * de error para que cualquiera de los tres que falle deje la pantalla en
   * estado de error —con su botón— en lugar de a medio cargar.
   */
  const recargarTodo = useCallback(async () => {
    if (!companyCode) {
      setCargando(false)
      return
    }

    setError(null)

    try {
      const { entidad: ent, semana: sem } = await cargarBase()
      await cargarSolicitudes(ent, sem)
    } catch (err) {
      setError(handleError(err))
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
    // cargarBase depende de `semana` para conservar la elegida, y meterlo acá
    // volvería a disparar la recarga completa con cada cambio de semana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyCode, cargarSolicitudes])

  /**
   * Se recarga al ENTRAR y no solo al montar: la navegación deja la pantalla
   * montada, y entre una visita y otra pudieron haber aprobado o rechazado lo
   * que se pidió.
   */
  useFocusEffect(
    useCallback(() => {
      setCargando(true)
      recargarTodo()
    }, [recargarTodo]),
  )

  // Cambiar de semana pide solo las solicitudes: la entidad y el calendario no
  // cambiaron. El ref evita repetir lo que la recarga completa acaba de traer.
  const cambiarSemana = useCallback(
    (clave: string) => {
      setSemana(clave)
      // El día elegido era de la semana anterior: dejarlo puesto mostraría la
      // nueva vacía sin que se entienda por qué.
      setDia(null)

      const sem = semanas.find(w => claveSemana(w) === clave) ?? null
      if (!entidad || `${entidad.Id}|${clave}` === cargadoRef.current) return

      setCargando(true)
      setError(null)

      cargarSolicitudes(entidad, sem)
        .catch(err => setError(handleError(err)))
        .finally(() => setCargando(false))
    },
    [semanas, entidad, cargarSolicitudes],
  )

  const onRefresh = useCallback(() => {
    setRefrescando(true)
    recargarTodo()
  }, [recargarTodo])

  /**
   * Aprueba o rechaza los renglones indicados.
   *
   * La decisión es por EMPLEADO, no por solicitud: desde la tarjeta se firman
   * todos los que esta entidad todavía puede firmar, y desde el detalle uno
   * solo. Las dos cosas entran por acá.
   */
  const firmar = useCallback(
    async (
      correlativo: string,
      detalles: IOvertimeRequestDetail[],
      aprueba: boolean,
      comentario: string,
    ) => {
      if (!entidad || enviando) return

      // Se vuelve a filtrar acá y no solo al abrir el diálogo: entre que se
      // abrió y se confirmó, otra pantalla pudo haber resuelto alguno. Mandar
      // uno ya firmado haría que el procedimiento rechazara el lote entero.
      const ids = detalles.filter(d => puedeFirmar(d, entidad.Name)).map(d => d.Id)

      if (ids.length === 0) {
        showToast('info', 'Nada que firmar', 'Estos empleados ya fueron resueltos.')
        return
      }

      setEnviando(true)
      loader.show()

      try {
        const res = await overtimeService.authorizeRequest(companyCode, {
          SystemEntities_Id: entidad.Id,
          Auth: aprueba,
          Comment: comentario,
          Details: ids,
        })

        if (!res?.Success) {
          showToast(
            'error',
            aprueba ? 'No se pudo aprobar' : 'No se pudo rechazar',
            res?.ErrorMessage || 'El servidor no aceptó la decisión.',
            6000,
            'top',
          )
          return
        }

        showToast(
          'success',
          aprueba ? 'Aprobada' : 'Rechazada',
          res.SuccessMessage || `${correlativo} · ${ids.length} empleado(s)`,
        )

        setDecidiendo(null)
        setMotivoRechazo('')

        // Se recarga para que la tarjeta refleje la firma: el estado sale de
        // las columnas dinámicas y esas solo vienen del servidor.
        onRefresh()
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 6000, 'top')
      } finally {
        setEnviando(false)
        loader.hide()
      }
      // `loader` queda fuera: el provider no memoiza su valor.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [entidad, enviando, companyCode, showToast, onRefresh],
  )

  /** Editar lleva la solicitud completa al formulario. */
  const editar = useCallback(
    (grupo: Solicitud) => {
      navigation.navigate('crearSolicitudHE', {
        requestId: grupo.requestId,
        detalles: grupo.detalles,
      })
    },
    [navigation],
  )

  // ── Datos a la vista ──────────────────────────────────────────────────────

  const solicitudes = useMemo(() => {
    const base = dia ? filas.filter(f => claveDia(f.Date) === dia) : filas
    return agrupar(base)
  }, [filas, dia])

  const totales = useMemo(() => {
    const horas = solicitudes.reduce((acc, s) => acc + s.horas, 0)
    const empleados = solicitudes.reduce((acc, s) => acc + s.detalles.length, 0)
    return { horas, empleados }
  }, [solicitudes])

  /**
   * Las semanas de la más RECIENTE a la más vieja.
   *
   * El calendario llega en orden cronológico, así que la de esta semana caía al
   * fondo de la lista: había que bajar hasta el final para llegar a lo que se
   * viene a ver.
   */
  const opcionesSemana = useMemo(
    () => [...semanas].reverse().map(w => ({ label: etiquetaSemana(w), value: claveSemana(w) })),
    [semanas],
  )

  // ── Render ────────────────────────────────────────────────────────────────

  if (error) {
    return <ErrorState title={error.title} message={error.message} onRetry={onRefresh} />
  }

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$2">
        {/* La acción, arriba a la derecha y CON NOMBRE: un '+' suelto no se lee
            como "crear" para quien no usa mucho el teléfono, y esta pantalla es
            justo para ellos. Mismo patrón que Cooperativa.

            Va siempre, no solo cuando hay solicitudes: pedir horas extra es
            para lo que se entra acá, y esconderlo en la semana vacía —que es
            justo cuando hace falta— sería al revés. */}
        <XStack justifyContent="flex-end">
          <Button
            height={40}
            borderRadius="$3"
            paddingHorizontal="$3"
            backgroundColor="$primary"
            pressStyle={{ opacity: 0.85 }}
            onPress={() => navigation.navigate('crearSolicitudHE')}
          >
            <XStack alignItems="center" gap="$2">
              <PlusCircle size={17} color="#FFFFFF" />
              <Text fontSize={14} fontWeight="700" color="white">
                Crear solicitud
              </Text>
            </XStack>
          </Button>
        </XStack>

        {/* El selector NO se esconde mientras carga: es el control con el que
            se está pidiendo, y ocultarlo deja sin saber qué semana quedó. */}
        <AppSelect
          label="Semana"
          value={semana}
          options={opcionesSemana}
          onValueChange={v => cambiarSemana(String(v))}
          placeholder={semanas.length === 0 ? 'Sin semanas' : ''}
          disabled={semanas.length === 0}
        />

        {dias.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
          >
            <ChipDia label="Semana" activo={!dia} onPress={() => setDia(null)} />
            {dias.map(d => (
              <ChipDia
                key={d.key}
                label={d.label}
                activo={dia === d.key}
                // Volver a tocar el día activo lo apaga: es el camino corto a
                // ver la semana completa.
                onPress={() => setDia(dia === d.key ? null : d.key)}
              />
            ))}
          </ScrollView>
        )}

        {solicitudes.length > 0 && (
          <XStack justifyContent="space-between" alignItems="center" paddingHorizontal="$1">
            <Text fontSize={12} color="$textMuted">
              <Text fontSize={12} fontWeight="700" color="$text">{solicitudes.length}</Text>
              {' '}solicitud(es) · {totales.empleados} empleado(s)
            </Text>
            <Text fontSize={12} fontWeight="700" color="$text">
              {fmtHoras(totales.horas)}
            </Text>
          </XStack>
        )}
      </YStack>

      {cargando && !refrescando ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={solicitudes}
          keyExtractor={item => String(item.requestId)}
          contentContainerStyle={
            solicitudes.length === 0
              ? { flexGrow: 1 }
              : { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 }
          }
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={onRefresh}
              colors={[theme.primary?.val as string]}
              tintColor={theme.primary?.val as string}
            />
          }
          ListEmptyComponent={
            sinEntidad ? (
              <EmptyState
                title="No puedes pedir horas extra"
                message="Tu usuario no tiene asignada la entidad de solicitante del proceso de horas extra. Pídeselo a quien administra los accesos."
              />
            ) : semanas.length === 0 ? (
              <EmptyState
                title="Sin calendario de semanas"
                message="No se pudo cargar el calendario de planilla, así que no hay semana que consultar. Deslizá hacia abajo para reintentar."
              />
            ) : (
              <EmptyState
                title={dia ? 'Sin solicitudes ese día' : 'Sin solicitudes esta semana'}
                message={
                  dia
                    ? 'No pediste horas extra ese día. Tocá "Semana" para ver todos los días.'
                    : 'Todavía no has pedido horas extra en esta semana.'
                }
              />
            )
          }
          renderItem={({ item }) => (
            <SolicitudCard
              item={item}
              nombreEntidad={entidad?.Name ?? ''}
              onEditar={() => editar(item)}
              onDecidir={(detalles, aprueba) => {
                setMotivoRechazo('')
                setDecidiendo({ correlativo: item.correlativo, detalles, aprueba })
              }}
            />
          )}
        />
      )}

      {/* UN diálogo para las dos decisiones. Lo único que cambia es el color,
          el verbo y que rechazar pide motivo — no ameritaba dos componentes
          con la misma lógica al lado.

          El mensaje nombra al empleado cuando es uno solo: firmar a "1
          empleado" de una solicitud de cinco no dice a cuál. */}
      <ConfirmDialog
        open={!!decidiendo}
        onOpenChange={abierto => { if (!abierto) { setDecidiendo(null); setMotivoRechazo('') } }}
        title={decidiendo?.aprueba ? 'Aprobar horas extra' : 'Rechazar horas extra'}
        message={
          !decidiendo
            ? ''
            : decidiendo.detalles.length === 1
              ? `¿${decidiendo.aprueba ? 'Aprobar' : 'Rechazar'} las horas de ${nombreConCodigo(
                  decidiendo.detalles[0].Employee_Name,
                  decidiendo.detalles[0].Employee_Code,
                )}?`
              : `¿${decidiendo.aprueba ? 'Aprobar' : 'Rechazar'} ${decidiendo.detalles.length} empleado(s) de ${decidiendo.correlativo}?`
        }
        confirmLabel={decidiendo?.aprueba ? 'Aprobar' : 'Rechazar'}
        confirmColor={decidiendo?.aprueba ? '#22C55E' : '#EF4444'}
        loading={enviando}
        onConfirm={() => {
          if (!decidiendo) return
          // Rechazar sin motivo no se manda: lo exige el procedimiento y el
          // viaje iba a rebotar igual.
          if (!decidiendo.aprueba && !motivoRechazo.trim()) return

          firmar(
            decidiendo.correlativo,
            decidiendo.detalles,
            decidiendo.aprueba,
            decidiendo.aprueba ? '' : motivoRechazo.trim(),
          )
        }}
        onCancel={() => { setDecidiendo(null); setMotivoRechazo('') }}
        extra={
          decidiendo && !decidiendo.aprueba ? (
            <YStack gap="$1">
              <AppInput
                label="Motivo del rechazo"
                value={motivoRechazo}
                onChangeText={setMotivoRechazo}
                multiline
                minLines={2}
                maxLength={500}
                placeholder="Por qué no se aprueban estas horas…"
              />
              {!motivoRechazo.trim() && (
                <Text fontSize={11} color="$error">
                  El motivo es obligatorio para rechazar. Lo va a leer quien pidió las horas.
                </Text>
              )}
            </YStack>
          ) : undefined
        }
      />

    </View>
  )
}

/**
 * Un día del filtro. Todos se pueden tocar, incluso los que no tienen nada: un
 * día vacío lleva a una lista vacía, que es la respuesta correcta a "qué pedí
 * ese día".
 */
function ChipDia({
  label,
  activo,
  onPress,
}: {
  label: string
  activo: boolean
  onPress: () => void
}) {
  return (
    <View
      // Compacto a propósito: los siete días más el de "todos" tienen que
      // entrar sin que la fila se coma la pantalla en un teléfono angosto. El
      // ScrollView horizontal se encarga del resto.
      paddingHorizontal="$2"
      paddingVertical={5}
      borderRadius={999}
      borderWidth={1}
      borderColor={activo ? '$primary' : '$border'}
      backgroundColor={activo ? '$primaryOpacity2' : '$backgroundElevated'}
      pressStyle={{ opacity: 0.6 }}
      onPress={onPress}
    >
      <Text
        fontSize={10}
        fontWeight="700"
        color={activo ? '$primary' : '$textMuted'}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

function SolicitudCard({
  item,
  nombreEntidad,
  onEditar,
  onDecidir,
}: {
  item: Solicitud
  /** Con qué entidad entra el usuario: define qué puede firmar. */
  nombreEntidad: string
  onEditar: () => void
  /** Los renglones a firmar: todos los de la tarjeta, o uno del detalle. */
  onDecidir: (detalles: IOvertimeRequestDetail[], aprueba: boolean) => void
}) {
  const theme = useTheme()

  // Cerrada por omisión: la tarjeta tiene que caber de un vistazo y el detalle
  // por empleado se pide cuando se quiere.
  const [abierta, setAbierta] = useState(false)

  // Un rechazo manda sobre el resto: es lo que hay que ir a ver. Después lo
  // pendiente, que es lo que todavía puede cambiar.
  const estado =
    item.rechazados > 0 ? 'rechazada' : item.pendientes > 0 ? 'pendiente' : 'aprobada'

  const tono = {
    aprobada: { color: theme.success?.val as string, texto: 'Aprobada', Icono: CheckCircle2 },
    rechazada: { color: theme.error?.val as string, texto: 'Rechazada', Icono: XCircle },
    pendiente: { color: theme.warning?.val as string, texto: 'En proceso', Icono: Clock },
  }[estado]

  // Con renglones en distinto estado el badge solo dice el peor: el desglose
  // aclara cuántos son cuáles, que en una solicitud de varios empleados es la
  // diferencia entre "me la rechazaron" y "le rechazaron a uno".
  const mixta =
    [item.aprobados, item.rechazados, item.pendientes].filter(n => n > 0).length > 1

  /**
   * Queda al menos un empleado sin firma.
   *
   * No se exige que NADIE haya firmado: la edición es por capas, igual que en
   * la pantalla web. Con un empleado ya autorizado, los demás se siguen
   * pudiendo cambiar —el que tiene firma queda de solo lectura— y lo único que
   * se cierra por completo es el encabezado.
   */
  const puedeEditar = item.detalles.some(d => !tieneFirma(d))

  // Los renglones que ESTA entidad todavía puede firmar. El botón de la
  // tarjeta los firma todos de una; el del detalle, uno solo.
  const firmables = item.detalles.filter(d => puedeFirmar(d, nombreEntidad))
  const puedeDecidir = firmables.length > 0

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={14}
      padding="$3"
      borderWidth={1}
      borderColor="$border"
      // La tarjeta COMPLETA abre y cierra el detalle: en un teléfono apuntarle
      // a un texto de 12px es más difícil que tocar la tarjeta, y no hay otra
      // acción compitiendo por el toque.
      pressStyle={{ opacity: 0.85 }}
      onPress={() => setAbierta(a => !a)}
    >
      <YStack gap="$2.5">
        {/* Correlativo y en qué va: el titular de la tarjeta */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <Text fontSize={13} fontWeight="800" color="$text" numberOfLines={1}>
            {item.correlativo}
          </Text>

          <XStack
            paddingHorizontal={8}
            paddingVertical={3}
            borderRadius={20}
            alignItems="center"
            gap="$1"
            style={{ backgroundColor: `${tono.color}1f` }}
          >
            <tono.Icono size={13} color={tono.color} />
            <Text fontSize={11} fontWeight="800" style={{ color: tono.color }}>
              {tono.texto}
            </Text>
          </XStack>
        </XStack>

        <XStack alignItems="center" gap="$2">
          <CalendarDays size={12} color={theme.textMuted?.val as string} />
          <Text fontSize={12} color="$textMuted">
            {fmtFecha(item.fecha) || '—'}
            {item.detalles[0]?.Start_Time
              ? ` · ${fmtHora(item.detalles[0].Start_Time)} - ${fmtHora(item.detalles[0].End_Time)}`
              : ''}
          </Text>
        </XStack>

        {/* Cuánta gente y cuántas horas: es lo que se pidió */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius={10}
          backgroundColor="$backgroundSurface"
        >
          <XStack alignItems="center" gap="$2">
            <Users size={13} color={theme.textSecondary?.val as string} />
            <Text fontSize={12} fontWeight="600" color="$textSecondary">
              {item.detalles.length} empleado(s)
            </Text>
          </XStack>
          <Text fontSize={17} fontWeight="800" color="$text">
            {fmtHoras(item.horas)}
          </Text>
        </XStack>

        {/* El detalle por empleado, desplegable.
            Cerrado se ven los motivos del lote sin repetir, que es el resumen;
            abierto, un renglón por empleado con SU motivo y SUS horas. En una
            solicitud de varios, el motivo del lote no dice por qué se quedó
            cada uno, y la lista completa siempre a la vista convertiría la
            tarjeta en una pantalla. */}
        {/* Ya no lleva onPress propio: lo abre la tarjeta entera. Queda como
            indicador —dice que hay algo más y en qué estado está— alineado a la
            derecha, donde termina la línea y no compite con el contenido. */}
        <XStack alignItems="center" justifyContent="flex-end" gap="$2" paddingVertical="$1">
          <Text fontSize={12} fontWeight="700" color="$textMuted">
            {abierta ? 'Ocultar detalle' : 'Ver detalle por empleado'}
          </Text>
          {abierta ? (
            <ChevronUp size={14} color={'#FF551A'} />
          ) : (
            <ChevronDown size={14} color={'#FF551A'} />
          )}
        </XStack>

        {abierta ? (
          <YStack gap="$2">
            {item.detalles.map(d => {
              const estadoD = estadoDetalle(d)
              const colorD =
                estadoD === 'aprobada'
                  ? (theme.success?.val as string)
                  : estadoD === 'rechazada'
                    ? (theme.error?.val as string)
                    : (theme.warning?.val as string)

              return (
                <YStack
                  key={d.Id}
                  gap="$1"
                  paddingHorizontal="$2.5"
                  paddingVertical="$2"
                  borderRadius={10}
                  backgroundColor="$backgroundSurface"
                  // Una línea de color a la izquierda: en una solicitud mixta
                  // dice de un vistazo a quién le rechazaron sin tener que
                  // leer cada renglón.
                  borderLeftWidth={3}
                  borderLeftColor={colorD}
                >
                  <XStack justifyContent="space-between" alignItems="center" gap="$2">
                    <Text fontSize={12} fontWeight="700" color="$text" flex={1} numberOfLines={1}>
                      {nombreConCodigo(d.Employee_Name, d.Employee_Code)}
                    </Text>
                    <Text fontSize={13} fontWeight="800" color="$text">
                      {fmtHoras(d.Total_Overtime_Hours)}
                    </Text>
                  </XStack>

                  <Text fontSize={11} color="$textSecondary" numberOfLines={2}>
                    {(d.Category_Name ?? '').trim() || 'Sin motivo'}
                  </Text>

                  <XStack justifyContent="space-between" alignItems="center" gap="$2">
                    <Text fontSize={11} color="$textMuted">
                      {fmtHora(d.Start_Time)} - {fmtHora(d.End_Time)}
                    </Text>
                    <Text fontSize={11} fontWeight="700" style={{ color: colorD }}>
                      {estadoD === 'aprobada'
                        ? 'Aprobada'
                        : estadoD === 'rechazada'
                          ? 'Rechazada'
                          : 'En proceso'}
                    </Text>
                  </XStack>

                  {/* Firmar SOLO a este empleado. La decisión es por empleado,
                      así que en una solicitud de varios se puede aprobar a
                      unos y rechazar a otros sin abrir nada más: acá mismo y
                      con un confirm. */}
                  {puedeFirmar(d, nombreEntidad) && (
                    <XStack gap="$1" justifyContent="flex-end" marginTop={2}>
                      <AccionSutil
                        Icono={X}
                        texto="Rechazar"
                        color={theme.error?.val as string}
                        onPress={() => onDecidir([d], false)}
                      />
                      <AccionSutil
                        Icono={Check}
                        texto="Aprobar"
                        color={theme.success?.val as string}
                        onPress={() => onDecidir([d], true)}
                      />
                    </XStack>
                  )}
                </YStack>
              )
            })}
          </YStack>
        ) : (
          item.motivos.length > 0 && (
            <XStack gap="$1.5" flexWrap="wrap">
              {item.motivos.map((motivo, i) => (
                <XStack
                  key={`mot-${i}`}
                  paddingHorizontal={8}
                  paddingVertical={3}
                  borderRadius={20}
                  backgroundColor="$backgroundSurface"
                >
                  <Text fontSize={11} color="$textSecondary" numberOfLines={1}>
                    {motivo}
                  </Text>
                </XStack>
              ))}
            </XStack>
          )
        )}

        {!!item.comentario && (
          <Text fontSize={12} color="$textSecondary" numberOfLines={2}>
            {item.comentario}
          </Text>
        )}

        {/* ── Acciones ───────────────────────────────────────────────────
            Sutiles y al pie: la tarjeta se viene a LEER, y con botones grandes
            la lista se convertía en una fila de botones con datos alrededor.

            Editar solo mientras NADIE haya firmado: en cuanto una entidad se
            pronuncia la solicitud ya no es del solicitante. Firmar solo lo que
            esta entidad todavía puede firmar. Cuando no queda ninguna de las
            dos, la tarjeta no muestra nada — que es el caso de una solicitud ya
            resuelta por todos. */}
        {(puedeEditar || puedeDecidir) && (
          <XStack
            gap="$2"
            justifyContent="flex-end"
            borderTopWidth={1}
            borderTopColor="$border"
            paddingTop="$2.5"
          >
            {puedeEditar && (
              <AccionSutil
                Icono={Pencil}
                texto="Editar"
                color={theme.textSecondary?.val as string}
                onPress={onEditar}
              />
            )}

            {puedeDecidir && (
              <>
                <AccionSutil
                  Icono={X}
                  texto={firmables.length > 1 ? `Rechazar ${firmables.length}` : 'Rechazar'}
                  color={theme.error?.val as string}
                  onPress={() => onDecidir(firmables, false)}
                />
                <AccionSutil
                  Icono={Check}
                  texto={firmables.length > 1 ? `Aprobar ${firmables.length}` : 'Aprobar'}
                  color={theme.success?.val as string}
                  onPress={() => onDecidir(firmables, true)}
                />
              </>
            )}
          </XStack>
        )}

        {mixta && (
          <XStack gap="$3" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
            {item.aprobados > 0 && (
              <Text fontSize={11} color="$textMuted">
                <Text fontSize={11} fontWeight="700" color="$success">{item.aprobados}</Text> aprobado(s)
              </Text>
            )}
            {item.pendientes > 0 && (
              <Text fontSize={11} color="$textMuted">
                <Text fontSize={11} fontWeight="700" color="$warning">{item.pendientes}</Text> en proceso
              </Text>
            )}
            {item.rechazados > 0 && (
              <Text fontSize={11} color="$textMuted">
                <Text fontSize={11} fontWeight="700" color="$error">{item.rechazados}</Text> rechazado(s)
              </Text>
            )}
          </XStack>
        )}
      </YStack>
    </Card>
  )
}

/**
 * Una acción al pie de la tarjeta.
 *
 * Ícono y texto en 12px, sin relleno ni borde: se lee como una acción y no
 * compite con el contenido. Tres botones de tamaño normal no caben en el ancho
 * de un teléfono, y de todas formas la tarjeta se viene a leer.
 */
function AccionSutil({
  Icono,
  texto,
  color,
  onPress,
}: {
  Icono: React.ComponentType<{ size?: number; color?: string }>
  texto: string
  color: string
  onPress: () => void
}) {
  return (
    <XStack
      alignItems="center"
      gap="$1.5"
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius={8}
      pressStyle={{ opacity: 0.5 }}
      // La acción NO puede disparar el acordeón de la tarjeta, que también
      // responde al toque.
      onPress={(e: any) => {
        e?.stopPropagation?.()
        onPress()
      }}
    >
      <Icono size={13} color={color} />
      <Text fontSize={12} fontWeight="700" style={{ color }}>
        {texto}
      </Text>
    </XStack>
  )
}
