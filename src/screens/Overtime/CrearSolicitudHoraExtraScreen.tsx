import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Card, View, Button, styled, useTheme } from 'tamagui'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Lock,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { useShowToast } from '../../utils/useShowToast'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import AppSelect from '../../components/commons/AppSelect'
import AppInput from '../../components/commons/AppInput'
import AppDatePicker from '../../components/commons/AppDatePicker'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeEmployee,
  IOvertimeEmployeeWithRequest,
  IOvertimeReason,
  IOvertimeRequestDetail,
  IOvertimeShiftSchedule,
  ISaveOvertimeDetail,
  IShiftParameterKey,
  IUserEntity,
} from '../../api/modules/overtime/overtime.types'
import { etiquetaFirma, fmtHoras, nombreConCodigo, tieneFirma } from './Overtime.utils'
import {
  OvertimeBand,
  TimeBand,
  bandsFrom,
  computeBreakdown,
  cruzaMedianoche,
  fechaHoraISO,
  inicioPorJornada,
  normalizeTime,
  opcionesFin,
  opcionesInicio,
  parameterKey,
  rowHours,
  seEncimaConJornada,
} from './Overtime.calc'

// Crear una solicitud de horas extra desde el teléfono.
//
// Va por pasos y no en una sola pantalla larga porque los datos dependen unos
// de otros: sin fecha no se sabe el horario de los turnos —y por lo tanto a qué
// hora empieza la hora extra de cada uno— y sin empleados no hay horas que
// capturar. Un formulario plano dejaría campos vacíos que no se pueden llenar
// todavía, sin decir por qué.
//
// Todo lo que se valida acá se valida OTRA VEZ en el procedimiento, que es el
// dueño de las reglas. Lo de acá es para no hacer viajar una solicitud que ya
// se sabe que va a rebotar.

// El header cae al botón del drawer cuando no se le pasa `left`. Acá es una
// pantalla hija a la que se llega desde el listado, así que corresponde volver:
// abrir el menú desde un formulario a medio llenar no lleva a ningún lado.
const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

/**
 * Lo que recibe la pantalla cuando se entra a EDITAR.
 *
 * Los detalles viajan por parámetro en lugar de volver a consultarlos: el
 * listado ya los tiene en memoria —son los que pintó en la tarjeta— y pedirlos
 * de nuevo obligaría a saber en qué semana cae la solicitud, que es justo el
 * dato que el formulario no tiene.
 */
type CrearRouteParams = {
  crearSolicitudHE?: {
    /** Mayor que 0 = editar esa solicitud. Sin esto, crea una nueva. */
    requestId?: number
    detalles?: IOvertimeRequestDetail[]
  }
}

/** El estado guardado de un empleado, para restituirlo al armar el detalle. */
interface Semilla {
  start: string
  end: string
  categoryId: number | null
}

/** Un empleado ya elegido, con su horario y sus horas. */
interface Fila {
  employee_Code: string
  employee_Name: string
  cod_Planilla: string
  shift_Id: number | null
  /** TurnoDetalleId: sale del horario del día, no del empleado. */
  shift_ScheduleId: number | null
  shift_Start: string
  shift_End: string
  /**
   * El día es laborable para su turno y el turno tiene fin: la hora de inicio
   * la manda la jornada y no se captura.
   */
  hasSchedule: boolean
  start_Time: string
  end_Time: string
  category_Id: number | null
  breakdown: OvertimeBand[]

  /**
   * Este empleado ya tiene firma: sus horas no se tocan.
   *
   * La edición es por capas, igual que en la web: el renglón firmado queda de
   * solo lectura y los demás se siguen pudiendo cambiar. Tampoco se puede
   * quitar de la solicitud — el procedimiento lo rechaza.
   */
  isLocked: boolean
  /** Por qué quedó bloqueado: 'Aprobado' o 'Rechazado'. */
  lockLabel: string
}

/**
 * Los pasos, por nombre y no por número.
 *
 * El de prestados solo existe cuando hay prestados que ofrecer: sin el acceso
 * 'OtrosEmpleados' la lista viene vacía, y un paso que no se puede llenar deja
 * al usuario buscando qué le falta. Por eso el recorrido se decide por nombre —
 * con índices fijos, saltarse uno desalinearía todo.
 */
type Paso = 'Mis empleados' | 'Prestados' | 'Horas'

/** 0=Lunes … 6=Domingo, que es como los numera la vista de turnos. */
const diaDeSemana = (fecha: string): number | null => {
  const [y, m, d] = fecha.split('-').map(Number)
  if (!y || !m || !d) return null
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

const hoyISO = (): string => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const corrimiento = (dias: number): string => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dias)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Un entero no negativo, o null si el parámetro no está configurado. */
const aEntero = (valor: string | null | undefined): number | null => {
  const s = String(valor ?? '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export default function CrearSolicitudHoraExtraScreen() {
  const navigation = useNavigation()
  const route = useRoute<RouteProp<CrearRouteParams, 'crearSolicitudHE'>>()

  /**
   * La solicitud que se está editando. 0 o ausente = una nueva.
   *
   * Se lee una sola vez del parámetro: si el usuario cambia algo y vuelve, lo
   * que manda es el estado del formulario, no lo que trajo la navegación.
   */
  const editandoId = route.params?.requestId ?? 0
  const editando = editandoId > 0

  /**
   * Los empleados con firma, con el estado que los bloqueó.
   *
   * Sale de los detalles que trajo la navegación, así que se calcula una vez:
   * mientras el formulario está abierto nadie más va a firmar.
   */
  const bloqueados = useMemo(() => {
    const mapa = new Map<string, string>()

    for (const d of route.params?.detalles ?? []) {
      if (tieneFirma(d)) mapa.set(d.Employee_Code, etiquetaFirma(d))
    }

    return mapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Con alguna firma de por medio el ENCABEZADO queda fijo.
   *
   * Es la misma regla del procedimiento: cambiar la fecha o el comentario
   * afectaría a los empleados que ya fueron autorizados, y esos no se tocan.
   */
  const encabezadoFijo = bloqueados.size > 0

  const { defaultCompany } = useAuth()
  const theme = useTheme()
  const loader = useLoader()
  const { showToast } = useShowToast()

  const companyCode = defaultCompany?.Code ?? ''

  const [paso, setPaso] = useState(0)

  /**
   * El scroll del paso.
   *
   * Se lleva al tope en cada cambio: el ScrollView es UNO solo y conserva su
   * posición cuando el contenido se reemplaza, así que llegando al paso de
   * prestados desde el final del anterior aparecían los últimos de la lista y
   * parecía que faltaban los primeros.
   */
  const scrollRef = useRef<ScrollView | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Paso 1. Editando, la fecha y el comentario salen de lo ya guardado.
  const [fecha, setFecha] = useState<string>(
    () => String(route.params?.detalles?.[0]?.Date ?? '').substring(0, 10) || hoyISO(),
  )
  const [comentario, setComentario] = useState(() => route.params?.detalles?.[0]?.Comment ?? '')
  const [diasAntes, setDiasAntes] = useState<number | null>(null)
  const [diasDespues, setDiasDespues] = useState<number | null>(null)

  // Catálogos
  const [entidad, setEntidad] = useState<IUserEntity | null>(null)
  const [motivos, setMotivos] = useState<IOvertimeReason[]>([])
  const [propios, setPropios] = useState<IOvertimeEmployee[]>([])
  const [prestados, setPrestados] = useState<IOvertimeEmployee[]>([])

  // Paso 2. Cada lista lleva su propio buscador: son dos pasos distintos y
  // compartirlo haría que pasar al siguiente arrastrara el filtro puesto.
  const [busquedaPropios, setBusquedaPropios] = useState('')
  const [busquedaPrestados, setBusquedaPrestados] = useState('')
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set((route.params?.detalles ?? []).map(d => d.Employee_Code)),
  )
  const [tomados, setTomados] = useState<Map<string, IOvertimeEmployeeWithRequest>>(new Map())

  /**
   * Las horas y el motivo que ya tenía cada empleado.
   *
   * Se consumen UNA vez al armar el detalle y después se descartan: si se
   * quedaran, volver atrás a agregar gente restituiría lo guardado encima de
   * lo que el usuario acaba de cambiar.
   */
  const [semilla, setSemilla] = useState<Map<string, Semilla> | null>(() => {
    const detalles = route.params?.detalles
    if (!detalles?.length) return null

    return new Map(
      detalles.map(d => [
        d.Employee_Code,
        {
          start: String(d.Start_Time ?? '').substring(11, 16),
          end: String(d.End_Time ?? '').substring(11, 16),
          categoryId: d.Category_Id ?? null,
        },
      ]),
    )
  })

  // Paso 3
  const [horarios, setHorarios] = useState<IOvertimeShiftSchedule[]>([])
  const [bandas, setBandas] = useState<Map<string, TimeBand[]>>(new Map())
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargandoHorarios, setCargandoHorarios] = useState(false)
  /**
   * Las bandas llegan en un viaje aparte, al entrar al paso de horas.
   *
   * Se distingue de "no tiene bandas configuradas": hasta que la consulta
   * responda no se sabe cuál de los dos es, y avisar de que el turno no tiene
   * parámetros mientras todavía están en camino sería mentir.
   */
  const [cargandoBandas, setCargandoBandas] = useState(false)
  /**
   * La vista de turnos no respondió.
   *
   * Se guarda aparte y no como error de pantalla porque la solicitud se puede
   * armar igual escribiendo las horas a mano; lo que no puede pasar es que se
   * confunda con "día no laborable", que se ve exactamente igual.
   */
  const [errorHorarios, setErrorHorarios] = useState('')

  /**
   * Enviar la solicitud ya autorizada por el solicitante.
   *
   * Es lo que arranca el flujo, y por eso viene marcado: el caso normal es
   * pedir y mandar. Desmarcado la solicitud queda guardada sin entrar al flujo
   * —editable todavía— pero solo se puede terminar desde la pantalla web, así
   * que se advierte en lugar de dejarlo como una opción cualquiera.
   */
  const [autorizar, setAutorizar] = useState(true)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        {editando ? 'Editar solicitud' : 'Nueva solicitud'}
      </Text>
    ),
    left: (
      <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
        <ArrowLeftStyled />
      </View>
    ),
  })

  // ── Carga inicial ─────────────────────────────────────────────────────────

  const cargarBase = useCallback(async () => {
    if (!companyCode) {
      setCargando(false)
      return
    }

    setError(null)

    try {
      // En paralelo: no dependen entre sí y son cuatro viajes al abrir.
      const [resEnt, resMot, resProp, resPrest, resParams] = await Promise.all([
        overtimeService.getRequestorEntities(companyCode),
        overtimeService.getReasons(companyCode),
        overtimeService.getEmployeesInCharge(companyCode),
        overtimeService.getOtherEmployees(companyCode),
        overtimeService.getMyParameters(companyCode),
      ])

      if (!resEnt?.Success) {
        throw new Error(resEnt?.ErrorMessage || 'No se pudo cargar tu entidad de solicitante.')
      }
      if (!resMot?.Success) {
        throw new Error(resMot?.ErrorMessage || 'No se pudieron cargar los motivos.')
      }
      if (!resProp?.Success) {
        throw new Error(resProp?.ErrorMessage || 'No se pudo cargar tu personal a cargo.')
      }

      setEntidad((resEnt.Data ?? [])[0] ?? null)
      setMotivos(resMot.Data ?? [])
      setPropios(resProp.Data ?? [])

      // Los prestados NO tumban la pantalla: sin el acceso 'OtrosEmpleados' el
      // servidor devuelve vacío, y ahí la solicitud se arma igual con la gente
      // propia.
      setPrestados(resPrest?.Success ? (resPrest.Data ?? []) : [])

      // Los parámetros tampoco: sin ellos no hay límite de fechas, que es
      // justo lo que significa no tenerlos configurados.
      if (resParams?.Success) {
        const mapa = new Map((resParams.Data ?? []).map(p => [p.KeyVar, p.Value]))
        setDiasAntes(aEntero(mapa.get('OT_DAYS_BEFORE_CREATE')))
        setDiasDespues(aEntero(mapa.get('OT_DAYS_AFTER_CREATE')))
      }
    } catch (err) {
      setError(handleError(err))
    } finally {
      setCargando(false)
    }
  }, [companyCode])

  useEffect(() => {
    cargarBase()
  }, [cargarBase])

  // ── La fecha manda ────────────────────────────────────────────────────────

  /**
   * Al cambiar la fecha se piden los horarios de ese día y quiénes ya están
   * tomados.
   *
   * Los dos dependen SOLO de la fecha, así que se piden acá y no al entrar al
   * paso de horas: cuando el usuario llega, ya están.
   */
  useEffect(() => {
    if (!companyCode || !fecha) return

    const dia = diaDeSemana(fecha)
    if (dia === null) return

    let vigente = true
    setCargandoHorarios(true)

    setErrorHorarios('')

    Promise.all([
      overtimeService.getShiftSchedules(companyCode, dia),
      // La solicitud que se edita se EXCLUYE: sus propios empleados no están
      // tomados desde su punto de vista.
      overtimeService.getEmployeesWithRequest(companyCode, fecha, editandoId || undefined),
    ])
      .then(([resHor, resTom]) => {
        if (!vigente) return

        // Un fallo acá NO puede pasar por "día no laborable": los dos se ven
        // igual —la fila queda sin jornada y pidiendo la hora de inicio a
        // mano— pero uno es un dato del turno y el otro es que la consulta no
        // respondió. Sin distinguirlos, un error de la vista de turnos se lee
        // como que el empleado no trabaja ese día.
        if (resHor?.Success) {
          setHorarios(resHor.Data ?? [])
        } else {
          setHorarios([])
          setErrorHorarios(resHor?.ErrorMessage || 'No se pudieron cargar los horarios de los turnos.')
        }

        // Los tomados sí son de mejor esfuerzo: sin la lista el procedimiento
        // rechaza el duplicado igual al guardar, así que como mucho se pierde
        // el aviso temprano.
        const lista = resTom?.Success ? (resTom.Data ?? []) : []
        setTomados(new Map(lista.map(t => [t.Employee_Code, t])))
      })
      .catch(err => {
        if (!vigente) return
        setHorarios([])
        setTomados(new Map())
        setErrorHorarios(handleError(err).message)
      })
      .finally(() => {
        if (vigente) setCargandoHorarios(false)
      })

    return () => {
      vigente = false
    }
  }, [companyCode, fecha, editandoId])

  // Cambiar de fecha invalida a los tomados que ya estaban marcados: ese
  // empleado ya tiene solicitud ESE día y no se puede pedir dos veces.
  useEffect(() => {
    setElegidos(prev => {
      const limpio = new Set([...prev].filter(c => !tomados.has(c)))
      return limpio.size === prev.size ? prev : limpio
    })
  }, [tomados])

  // ── Empleados ─────────────────────────────────────────────────────────────

  const todos = useMemo(() => {
    // Un empleado puede venir en las dos listas; la de a cargo manda.
    const mapa = new Map<string, IOvertimeEmployee>()
    for (const e of prestados) mapa.set(e.Employee_Code, e)
    for (const e of propios) mapa.set(e.Employee_Code, e)
    return mapa
  }, [propios, prestados])

  const filtrar = useCallback((lista: IOvertimeEmployee[], termino: string) => {
    const q = termino.trim().toLowerCase()
    if (!q) return lista

    return lista.filter(
      e =>
        e.Employee_Name?.toLowerCase().includes(q) ||
        e.Employee_Code?.toLowerCase().includes(q) ||
        e.Posicion?.toLowerCase().includes(q) ||
        e.Modulo_Nombre?.toLowerCase().includes(q),
    )
  }, [])

  const alternar = useCallback(
    (code: string) => {
      // Un empleado con firma no se puede quitar: el procedimiento lo rechaza
      // y tumbaría el guardado completo.
      if (bloqueados.has(code)) return

      setElegidos(prev => {
        const next = new Set(prev)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        return next
      })
    },
    [bloqueados],
  )

  // ── Filas de horas ────────────────────────────────────────────────────────

  /**
   * Arma las filas del paso de horas a partir de la selección.
   *
   * Conserva lo ya capturado: volver atrás a agregar un empleado no puede
   * borrar las horas de los otros.
   */
  const construirFilas = useCallback(() => {
    setFilas(prev => {
      const anterior = new Map(prev.map(f => [f.employee_Code, f]))

      return [...elegidos]
        .map(code => {
          const emp = todos.get(code)
          if (!emp) return null

          const horario = horarios.find(h => h.ShiftId === emp.Turno_Id)
          const inicio = inicioPorJornada(horario)
          const conJornada = !!inicio
          const previa = anterior.get(code)

          // Lo capturado en esta sesión manda sobre lo guardado: volver atrás
          // a agregar gente no puede deshacer lo que se acaba de cambiar.
          const guardado = previa ? undefined : semilla?.get(code)

          return {
            employee_Code: code,
            employee_Name: emp.Employee_Name,
            cod_Planilla: emp.Cod_Planilla ?? '',
            shift_Id: emp.Turno_Id ?? null,
            shift_ScheduleId: horario?.ShiftScheduleId ?? null,
            shift_Start: horario?.ShiftStart ? String(horario.ShiftStart).substring(0, 5) : '',
            shift_End: horario?.ShiftEnd ? String(horario.ShiftEnd).substring(0, 5) : '',
            hasSchedule: conJornada,
            // Con jornada el inicio lo manda el turno; sin ella se conserva lo
            // que el usuario ya había puesto, o lo que traía guardado.
            start_Time: conJornada
              ? inicio
              : (previa && !previa.hasSchedule ? previa.start_Time : (guardado?.start ?? '')),
            end_Time: previa?.end_Time ?? guardado?.end ?? '',
            category_Id: previa?.category_Id ?? guardado?.categoryId ?? null,
            breakdown: [] as OvertimeBand[],
            isLocked: bloqueados.has(code),
            lockLabel: bloqueados.get(code) ?? '',
          } as Fila
        })
        .filter((f): f is Fila => f !== null)
    })

    // La semilla se consume una sola vez: de acá en adelante el estado de las
    // filas ES la verdad.
    setSemilla(null)
  }, [elegidos, todos, horarios, semilla, bloqueados])

  /**
   * Las bandas de recargo de las combinaciones que hay en pantalla.
   *
   * Se piden por combinación distinta y no por empleado: varios comparten turno
   * y planilla, y con veinte empleados serían veinte viajes por lo mismo.
   */
  const cargarBandas = useCallback(
    async (lista: Fila[]) => {
      if (!companyCode || lista.length === 0) return

      const vistas = new Set<string>()
      const keys: IShiftParameterKey[] = []

      for (const f of lista) {
        const llave = parameterKey(f.cod_Planilla, f.shift_Id, f.shift_ScheduleId)
        if (vistas.has(llave)) continue
        vistas.add(llave)

        keys.push({
          Planilla: f.cod_Planilla,
          TurnoId: f.shift_Id ?? 0,
          TurnoDetalleId: f.shift_ScheduleId ?? 0,
        })
      }

      if (keys.length === 0) return

      setCargandoBandas(true)

      try {
        const res = await overtimeService.getOvertimeParameters(companyCode, keys)
        if (!res?.Success) return

        const agrupadas = new Map<string, TimeBand[]>()
        const porLlave = new Map<string, typeof res.Data>()

        for (const p of res.Data ?? []) {
          const llave = parameterKey(p.cod_tip_planilla, p.TurnoId, p.TurnoDetalleId)
          const actual = porLlave.get(llave) ?? []
          actual.push(p)
          porLlave.set(llave, actual)
        }

        for (const [llave, params] of porLlave) agrupadas.set(llave, bandsFrom(params ?? []))

        setBandas(agrupadas)
      } finally {
        setCargandoBandas(false)
      }
    },
    [companyCode],
  )

  // El reparto se recalcula cuando cambian las horas o llegan las bandas.
  useEffect(() => {
    setFilas(prev => {
      let cambio = false

      const next = prev.map(f => {
        const llave = parameterKey(f.cod_Planilla, f.shift_Id, f.shift_ScheduleId)
        const nuevo = computeBreakdown(f.start_Time, f.end_Time, bandas.get(llave) ?? [])

        if (JSON.stringify(nuevo) === JSON.stringify(f.breakdown)) return f
        cambio = true
        return { ...f, breakdown: nuevo }
      })

      return cambio ? next : prev
    })
  }, [bandas, filas])

  const editarFila = useCallback((code: string, cambios: Partial<Fila>) => {
    setFilas(prev => prev.map(f => (f.employee_Code === code ? { ...f, ...cambios } : f)))
  }, [])

  /** Copia el horario del primer renglón capturado al resto. */
  const aplicarHorarioATodos = useCallback(() => {
    setFilas(prev => {
      const origen = prev.find(f => !f.isLocked && !!f.end_Time)
      if (!origen) return prev

      return prev.map(f =>
        f.isLocked || f.employee_Code === origen.employee_Code
          ? f
          : {
              ...f,
              end_Time: origen.end_Time,
              // El inicio solo se copia a quien lo captura a mano: donde hay
              // jornada lo manda el turno, y pisarlo pondría al empleado a
              // hacer horas extra dentro de su propio horario.
              start_Time: f.hasSchedule ? f.start_Time : origen.start_Time,
            },
      )
    })
  }, [])

  /** Copia el motivo del primer renglón que lo tenga al resto. */
  const aplicarMotivoATodos = useCallback(() => {
    setFilas(prev => {
      const origen = prev.find(f => !f.isLocked && !!f.category_Id)
      if (!origen) return prev
      return prev.map(f => (f.isLocked ? f : { ...f, category_Id: origen.category_Id }))
    })
  }, [])

  // ── Validación por paso ───────────────────────────────────────────────────

  const minFecha = diasAntes === null ? undefined : corrimiento(-diasAntes)
  const maxFecha = diasDespues === null ? undefined : corrimiento(diasDespues)

  const errorFila = useCallback(
    (f: Fila): string => {
      // Ya fue firmada: el procedimiento no la vuelve a escribir, así que
      // exigirle algo trabaría el guardado por un renglón que nadie va a
      // cambiar. Puede incluso venir sin motivo, de antes del catálogo.
      if (f.isLocked) return ''

      if (!f.start_Time) return 'Falta la hora de inicio'
      if (!f.end_Time) return 'Falta la hora de fin'
      if (normalizeTime(f.start_Time) === null) return 'Hora de inicio inválida'
      if (normalizeTime(f.end_Time) === null) return 'Hora de fin inválida'

      const horas = rowHours(f.start_Time, f.end_Time)
      if (horas === null || horas <= 0) return 'El fin no puede ser igual al inicio'

      const horario = horarios.find(h => h.ShiftId === f.shift_Id)
      if (seEncimaConJornada(f.start_Time, f.end_Time, horario)) {
        return `Se encima con la jornada ${f.shift_Start} - ${f.shift_End}`
      }

      if (!f.category_Id) return 'Falta el motivo'

      return ''
    },
    [horarios],
  )

  /**
   * El recorrido de esta solicitud. El paso de prestados solo aparece si hay
   * prestados que ofrecer.
   */
  const pasos = useMemo<Paso[]>(
    () =>
      prestados.length > 0
        ? ['Mis empleados', 'Prestados', 'Horas']
        : ['Mis empleados', 'Horas'],
    [prestados.length],
  )

  const pasoActual = pasos[Math.min(paso, pasos.length - 1)]
  const siguientePaso = pasos[paso + 1]

  const filasCompletas = filas.length > 0 && filas.every(f => !errorFila(f))

  const pasoValido = useMemo(() => {
    if (!fecha) return false

    // Entrar a capturar horas exige gente. Se pide acá y no al salir del primer
    // paso porque con el de prestados de por medio eso dejaría trabado a quien
    // no tiene equipo propio y viene justamente a pedir prestados.
    if (siguientePaso === 'Horas' && elegidos.size === 0) return false

    if (pasoActual === 'Horas') return filasCompletas

    return true
  }, [fecha, siguientePaso, pasoActual, elegidos.size, filasCompletas])

  // Cada paso arranca desde arriba.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [paso])

  const avanzar = useCallback(() => {
    if (siguientePaso === 'Horas') {
      construirFilas()
      // Las bandas se piden con la selección que se acaba de confirmar; las
      // filas se rearman dentro del setState, así que acá se calculan a partir
      // de la misma información.
      const lista = [...elegidos]
        .map(code => {
          const emp = todos.get(code)
          if (!emp) return null
          const horario = horarios.find(h => h.ShiftId === emp.Turno_Id)
          return {
            cod_Planilla: emp.Cod_Planilla ?? '',
            shift_Id: emp.Turno_Id ?? null,
            shift_ScheduleId: horario?.ShiftScheduleId ?? null,
          } as Fila
        })
        .filter((f): f is Fila => f !== null)

      cargarBandas(lista)
    }

    setPaso(p => Math.min(p + 1, pasos.length - 1))
  }, [siguientePaso, construirFilas, elegidos, todos, horarios, cargarBandas, pasos.length])

  const retroceder = useCallback(() => {
    if (paso === 0) {
      navigation.goBack()
      return
    }
    setPaso(p => Math.max(p - 1, 0))
  }, [paso, navigation])

  // ── Guardar ───────────────────────────────────────────────────────────────

  const totalHoras = useMemo(
    () => filas.reduce((acc, f) => acc + (rowHours(f.start_Time, f.end_Time) ?? 0), 0),
    [filas],
  )

  const guardar = useCallback(async () => {
    if (guardando) return

    setGuardando(true)
    loader.show()

    try {
      const details: ISaveOvertimeDetail[] = filas.map(f => {
        const cruza = cruzaMedianoche(f.start_Time, f.end_Time)

        return {
          Employee_Code: f.employee_Code,
          Category_Id: f.category_Id,
          Shift_Id: f.shift_Id,
          Start_Time: fechaHoraISO(fecha, f.start_Time),
          // El fin cae el día siguiente cuando el rango cruza la medianoche.
          End_Time: fechaHoraISO(fecha, f.end_Time, cruza ? 1 : 0),
          Total_Overtime_Hours: rowHours(f.start_Time, f.end_Time),
          Concepts: f.breakdown
            // Las horas sin banda no son pagables y el procedimiento las
            // descarta; no se mandan para que el payload diga lo mismo que se
            // va a guardar.
            .filter(b => !!b.concepto && b.hours > 0)
            .map(b => ({
              Concepto: b.concepto,
              Descripcion: b.descripcion,
              Porcentaje: b.porcentaje,
              Hours: b.hours,
              ParametroId: b.parametroId,
            })),
        }
      })

      const res = await overtimeService.saveRequest(companyCode, {
        Header: {
          Id: editando ? editandoId : -1,
          Date: fecha,
          Comment: comentario.trim() || null,
          Auth: autorizar,
          SystemEntities_Id: entidad?.Id ?? null,
        },
        Details: details,
      })

      if (!res?.Success) {
        // El mensaje del procedimiento se muestra tal cual: dice exactamente
        // qué regla no se cumplió, y reemplazarlo por un texto genérico dejaría
        // al usuario sin saber qué corregir.
        showToast(
          'error',
          'No se pudo enviar',
          res?.ErrorMessage || 'No se pudo guardar la solicitud',
          6000,
          'top',
        )
        return
      }

      showToast(
        'success',
        'Solicitud enviada',
        res.SuccessMessage || `Solicitud ${res.Correlative} enviada`,
      )
      navigation.goBack()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 6000, 'top')
    } finally {
      setGuardando(false)
      loader.hide()
    }
    // `loader` queda fuera: el provider no memoiza su valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardando, filas, fecha, comentario, autorizar, editando, editandoId, entidad, companyCode, showToast, navigation])

  // ── Render ────────────────────────────────────────────────────────────────

  if (cargando) return <SkeletonForm />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={cargarBase} />

  if (!entidad) {
    return (
      <EmptyState
        title="No puedes pedir horas extra"
        message="Tu usuario no tiene asignada la entidad de solicitante del proceso de horas extra. Pídeselo a quien administra los accesos."
      />
    )
  }

  const opcionesMotivo = motivos
    .filter(m => m.IsActive || filas.some(f => f.category_Id === m.Id))
    .map(m => ({
      label: m.IsActive ? m.Name : `${m.Name} (inactivo)`,
      value: String(m.Id),
    }))

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {pasoActual === 'Mis empleados' && (
          <PasoMiPersonal
            fecha={fecha}
            onFecha={f => setFecha(f ?? hoyISO())}
            comentario={comentario}
            onComentario={setComentario}
            minFecha={minFecha}
            maxFecha={maxFecha}
            encabezadoFijo={encabezadoFijo}
            bloqueados={bloqueados}
            propios={filtrar(propios, busquedaPropios)}
            elegidos={elegidos}
            tomados={tomados}
            busqueda={busquedaPropios}
            onBusqueda={setBusquedaPropios}
            onAlternar={alternar}
          />
        )}

        {pasoActual === 'Prestados' && (
          <PasoPrestados
            prestados={filtrar(prestados, busquedaPrestados)}
            bloqueados={bloqueados}
            elegidos={elegidos}
            tomados={tomados}
            busqueda={busquedaPrestados}
            onBusqueda={setBusquedaPrestados}
            onAlternar={alternar}
          />
        )}

        {pasoActual === 'Horas' && (
          <PasoHoras
            filas={filas}
            cargandoHorarios={cargandoHorarios}
            errorHorarios={errorHorarios}
            opcionesMotivo={opcionesMotivo}
            errorFila={errorFila}
            onEditar={editarFila}
            onAplicarHorario={aplicarHorarioATodos}
            onAplicarMotivo={aplicarMotivoATodos}
            totalHoras={totalHoras}
            autorizar={autorizar}
            onAutorizar={setAutorizar}
            bandas={bandas}
            cargandoBandas={cargandoBandas}
          />
        )}

      </ScrollView>

      {/* Pie fijo: los dos únicos movimientos posibles, siempre en el mismo
          lugar. En un teléfono el botón de avanzar no puede estar al final de
          un scroll largo.

          Los botones NO ocupan el ancho completo: alineados a la derecha, en el
          orden en que se lee —lo que retrocede primero, lo que avanza al final,
          donde cae el pulgar. Debajo, el avance: la barra dice cuánto falta sin
          pedir que se lea nada. */}
      <YStack
        paddingHorizontal="$3"
        paddingTop="$2.5"
        paddingBottom="$3"
        gap="$2.5"
        borderTopWidth={1}
        borderTopColor="$border"
        backgroundColor="$backgroundElevated"
      >
        <XStack justifyContent="flex-end" gap="$2">
          <Button
            height={40}
            borderRadius="$3"
            paddingHorizontal="$3"
            backgroundColor="transparent"
            borderWidth={1}
            borderColor="$border"
            pressStyle={{ opacity: 0.7 }}
            onPress={retroceder}
          >
            <XStack alignItems="center" gap="$1.5">
              <ArrowLeft size={15} color={theme.textMuted?.val as string} />
              <Text fontSize={13} fontWeight="700" color="$textSecondary">
                {paso === 0 ? 'Cancelar' : 'Atrás'}
              </Text>
            </XStack>
          </Button>

          {pasoActual !== 'Horas' ? (
            <Button
              height={40}
              borderRadius="$3"
              paddingHorizontal="$4"
              backgroundColor={pasoValido ? '$primary' : '$textDisabled'}
              disabled={!pasoValido}
              pressStyle={{ opacity: 0.85 }}
              onPress={avanzar}
            >
              <XStack alignItems="center" gap="$1.5">
                <Text fontSize={13} fontWeight="700" color="white">
                  Siguiente
                </Text>
                <ArrowRight size={15} color="#FFFFFF" />
              </XStack>
            </Button>
          ) : (
            <Button
              height={40}
              borderRadius="$3"
              paddingHorizontal="$4"
              backgroundColor={pasoValido ? '$primary' : '$textDisabled'}
              disabled={guardando || !pasoValido}
              opacity={guardando ? 0.6 : 1}
              pressStyle={{ opacity: 0.85 }}
              onPress={guardar}
            >
              <XStack alignItems="center" gap="$1.5">
                <Send size={15} color="#FFFFFF" />
                <Text fontSize={13} fontWeight="700" color="white">
                  {autorizar ? 'Enviar' : 'Guardar'}
                </Text>
              </XStack>
            </Button>
          )}
        </XStack>

        <Progreso actual={paso} total={pasos.length} nombre={pasoActual} />
      </YStack>
    </View>
  )
}

/**
 * Cuánto falta.
 *
 * Una barra y un contador, no una fila de círculos numerados: los círculos
 * ocupaban el ancho completo arriba —donde compiten con el contenido— y decían
 * en qué paso se está sin decir cuánto queda. La barra sí, de un vistazo.
 */
function Progreso({
  actual,
  total,
  nombre,
}: {
  actual: number
  total: number
  nombre: string
}) {
  // Sobre los pasos ya terminados, no sobre el actual: en el primero la barra
  // arranca vacía y en el último se llena, que es como se lee "3 de 4".
  const pct = total <= 1 ? 100 : Math.round((actual / (total - 1)) * 100)

  return (
    <YStack gap="$1.5">
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize={11} fontWeight="700" color="$textMuted" numberOfLines={1}>
          {nombre}
        </Text>
        <Text fontSize={11} fontWeight="800" color="$textSecondary">
          {actual + 1}/{total}
        </Text>
      </XStack>

      <View height={4} borderRadius={999} backgroundColor="$border" overflow="hidden">
        <View height={4} borderRadius={999} backgroundColor="$primary" width={`${pct}%`} />
      </View>
    </YStack>
  )
}

/**
 * Fecha, comentario y la gente propia, juntos.
 *
 * La fecha iba en un paso aparte y era un paso con un solo campo: se llenaba en
 * dos segundos y obligaba a un toque más para llegar a lo que de verdad toma
 * tiempo. Va acá arriba porque igual manda —de ella salen los horarios— y así
 * queda a la vista mientras se elige a quién.
 */
function PasoMiPersonal({
  fecha,
  onFecha,
  comentario,
  onComentario,
  minFecha,
  maxFecha,
  encabezadoFijo,
  bloqueados,
  propios,
  elegidos,
  tomados,
  busqueda,
  onBusqueda,
  onAlternar,
}: {
  fecha: string
  onFecha: (f: string | null) => void
  comentario: string
  onComentario: (c: string) => void
  minFecha?: string
  maxFecha?: string
  /** Ya hay empleados firmados: la fecha y el comentario no se pueden cambiar. */
  encabezadoFijo: boolean
  /** Empleado -> estado que lo bloqueo. */
  bloqueados: Map<string, string>
  propios: IOvertimeEmployee[]
  elegidos: Set<string>
  tomados: Map<string, IOvertimeEmployeeWithRequest>
  busqueda: string
  onBusqueda: (q: string) => void
  onAlternar: (code: string) => void
}) {
  return (
    <YStack gap="$3">
      <AppDatePicker
        label="Fecha de las horas extra"
        value={fecha}
        onChange={onFecha}
        minDate={minFecha}
        maxDate={maxFecha}
        disabled={encabezadoFijo}
      />

      {/* Por que el encabezado esta fijo. Un campo deshabilitado sin
          explicacion se lee como que la pantalla esta trabada. */}
      {encabezadoFijo && (
        <XStack alignItems="flex-start" gap="$1.5">
          <View marginTop={1}>
            <AlertTriangle size={11} color="#F59E0B" />
          </View>
          <Text fontSize={11} color="$warning" flex={1}>
            La solicitud ya tiene empleados autorizados: la fecha y el
            comentario no se pueden cambiar. Los empleados sin autorizar si.
          </Text>
        </XStack>
      )}

      {!encabezadoFijo && (minFecha || maxFecha) && (
        <Text fontSize={11} color="$textMuted">
          Puedes pedir horas extra
          {minFecha ? ` desde el ${minFecha.split('-').reverse().join('/')}` : ''}
          {maxFecha ? ` hasta el ${maxFecha.split('-').reverse().join('/')}` : ''}.
        </Text>
      )}

      <AppInput
        label="Comentario de la solicitud (opcional)"
        value={comentario}
        onChangeText={onComentario}
        multiline
        minLines={2}
        maxLength={500}
        placeholder="Por qué se necesita este trabajo adicional…"
        disabled={encabezadoFijo}
      />

      <ListaEmpleados
        titulo="Mi personal"
        bloqueados={bloqueados}
        ayuda="¿Quiénes van a hacer las horas extra?"
        lista={propios}
        elegidos={elegidos}
        tomados={tomados}
        busqueda={busqueda}
        onBusqueda={onBusqueda}
        onAlternar={onAlternar}
        vacioTitulo="Sin personal a cargo"
        vacioMensaje="No tienes empleados a cargo, así que no hay a quién pedirle horas extra."
      />
    </YStack>
  )
}

/**
 * Los prestados de la unidad, agrupados por módulo.
 *
 * Van en un paso propio y no mezclados con la gente a cargo: son dos cosas
 * distintas —una es quién reporta a quién, la otra un permiso— y en una sola
 * lista no se distingue de dónde salió cada uno.
 *
 * Agrupados por módulo porque así se piden: "necesito dos del módulo 4", no
 * dos nombres sueltos de una lista de doscientos.
 */
function PasoPrestados({
  prestados,
  bloqueados,
  elegidos,
  tomados,
  busqueda,
  onBusqueda,
  onAlternar,
}: {
  prestados: IOvertimeEmployee[]
  bloqueados: Map<string, string>
  elegidos: Set<string>
  tomados: Map<string, IOvertimeEmployeeWithRequest>
  busqueda: string
  onBusqueda: (q: string) => void
  onAlternar: (code: string) => void
}) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, IOvertimeEmployee[]>()

    for (const emp of prestados) {
      const modulo = (emp.Modulo_Nombre ?? '').trim() || 'Sin módulo'
      const actual = mapa.get(modulo) ?? []
      actual.push(emp)
      mapa.set(modulo, actual)
    }

    // 'Sin módulo' al final: es el cajón de lo que no se pudo clasificar y no
    // un módulo más.
    return [...mapa.entries()].sort(([a], [b]) => {
      if (a === 'Sin módulo') return 1
      if (b === 'Sin módulo') return -1
      return a.localeCompare(b)
    })
  }, [prestados])

  return (
    <YStack gap="$3">
      <Text fontSize={13} color="$textMuted">
        Operarios de tu unidad que no están a tu cargo. Este paso es opcional
      </Text>

      <ListaEmpleados
        titulo="De otros módulos"
        bloqueados={bloqueados}
        lista={prestados}
        grupos={grupos}
        elegidos={elegidos}
        tomados={tomados}
        busqueda={busqueda}
        onBusqueda={onBusqueda}
        onAlternar={onAlternar}
        vacioTitulo="Sin resultados"
        vacioMensaje="Ningún empleado coincide con lo que buscaste."
      />
    </YStack>
  )
}

/**
 * Una lista de empleados con su buscador.
 *
 * La comparten los dos pasos: son la misma interacción —buscar y marcar— y
 * duplicarla haría que se separaran con el primer ajuste. Con `grupos` dibuja
 * encabezados por módulo; sin ellos, una lista plana.
 */
function ListaEmpleados({
  titulo,
  ayuda,
  lista,
  grupos,
  bloqueados,
  elegidos,
  tomados,
  busqueda,
  onBusqueda,
  onAlternar,
  vacioTitulo,
  vacioMensaje,
}: {
  titulo: string
  ayuda?: string
  lista: IOvertimeEmployee[]
  grupos?: [string, IOvertimeEmployee[]][]
  /** Empleado -> estado que lo bloqueo. No se pueden desmarcar. */
  bloqueados: Map<string, string>
  elegidos: Set<string>
  tomados: Map<string, IOvertimeEmployeeWithRequest>
  busqueda: string
  onBusqueda: (q: string) => void
  onAlternar: (code: string) => void
  vacioTitulo: string
  vacioMensaje: string
}) {
  const marcadosAqui = lista.filter(e => elegidos.has(e.Employee_Code)).length

  return (
    <YStack gap="$2.5">
      <XStack alignItems="center" justifyContent="space-between" gap="$2">
        <YStack flex={1} gap={2}>
          <Text fontSize={12} fontWeight="800" color="$textMuted" textTransform="uppercase">
            {titulo}
          </Text>
          {!!ayuda && (
            <Text fontSize={12} color="$textMuted">
              {ayuda}
            </Text>
          )}
        </YStack>

        <XStack
          alignItems="center"
          gap="$1.5"
          paddingHorizontal={8}
          paddingVertical={3}
          borderRadius={20}
          backgroundColor="$primaryOpacity2"
        >
          <Users size={12} color={'#FF551A'} />
          <Text fontSize={12} fontWeight="800" color="$primary">
            {marcadosAqui}
          </Text>
        </XStack>
      </XStack>

      <AppInput
        label="Buscar empleado"
        value={busqueda}
        onChangeText={onBusqueda}
        placeholder="Nombre, código o posición"
        prefix={<Search size={16} color="#94A3B8" />}
        rightElement={
          busqueda ? (
            <View pressStyle={{ opacity: 0.6 }} onPress={() => onBusqueda('')}>
              <X size={16} color="#94A3B8" />
            </View>
          ) : undefined
        }
      />

      {lista.length === 0 ? (
        // Se distingue "la búsqueda no encontró" de "no hay a quién pedirle":
        // el primero se arregla borrando el filtro, el segundo no se arregla.
        <EmptyState
          title={busqueda ? 'Sin resultados' : vacioTitulo}
          message={busqueda ? 'Ningún empleado coincide con lo que buscaste.' : vacioMensaje}
        />
      ) : grupos ? (
        grupos.map(([modulo, empleados]) => (
          <YStack key={modulo} gap="$2">
            <XStack alignItems="center" gap="$2" paddingTop="$1">
              <View width={3} height={14} borderRadius={2} backgroundColor="$primary" />
              <Text fontSize={12} fontWeight="800" color="$text" flex={1} numberOfLines={1}>
                {modulo}
              </Text>
              <Text fontSize={11} color="$textMuted">
                {empleados.length}
              </Text>
            </XStack>

            {empleados.map(emp => (
              <FilaEmpleado
                key={emp.Employee_Code}
                emp={emp}
                marcado={elegidos.has(emp.Employee_Code)}
                tomado={tomados.get(emp.Employee_Code)}
                firma={bloqueados.get(emp.Employee_Code)}
                onPress={() => onAlternar(emp.Employee_Code)}
              />
            ))}
          </YStack>
        ))
      ) : (
        lista.map(emp => (
          <FilaEmpleado
            key={emp.Employee_Code}
            emp={emp}
            marcado={elegidos.has(emp.Employee_Code)}
            tomado={tomados.get(emp.Employee_Code)}
            firma={bloqueados.get(emp.Employee_Code)}
            onPress={() => onAlternar(emp.Employee_Code)}
          />
        ))
      )}
    </YStack>
  )
}

function FilaEmpleado({
  emp,
  marcado,
  tomado,
  firma,
  onPress,
}: {
  emp: IOvertimeEmployee
  marcado: boolean
  /** Ya tiene horas extra ese día: no se puede elegir. */
  tomado?: IOvertimeEmployeeWithRequest
  /** Ya fue autorizado en ESTA solicitud: no se puede quitar. */
  firma?: string
  onPress: () => void
}) {
  const theme = useTheme()

  // Las dos razones para no poder tocarlo, pero se explican distinto: una es
  // que esta en otra solicitud y la otra que ya le firmaron esta.
  const fijo = !!tomado || !!firma

  return (
    <Card
      backgroundColor={marcado ? '$primaryOpacity2' : '$backgroundElevated'}
      borderRadius={12}
      padding="$3"
      borderWidth={1}
      borderColor={marcado ? '$primary' : '$border'}
      opacity={tomado ? 0.6 : 1}
      pressStyle={fijo ? undefined : { opacity: 0.75 }}
      onPress={() => !fijo && onPress()}
    >
      <XStack alignItems="center" gap="$3">
        <View
          width={22}
          height={22}
          borderRadius={6}
          borderWidth={2}
          borderColor={marcado ? '$primary' : '$border'}
          backgroundColor={marcado ? '$primary' : 'transparent'}
          alignItems="center"
          justifyContent="center"
        >
          {marcado && <Check size={14} color="#FFFFFF" />}
        </View>

        <YStack flex={1} gap={2}>
          <Text fontSize={14} fontWeight="700" color="$text" numberOfLines={1}>
            {nombreConCodigo(emp.Employee_Name, emp.Employee_Code)}
          </Text>

          {!!emp.Posicion && (
            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
              {emp.Posicion}
            </Text>
          )}

          {/* Ya le firmaron este renglon: se queda en la solicitud. */}
          {!!firma && (
            <XStack alignItems="center" gap="$1.5" marginTop={2}>
              <Check size={11} color={theme.success?.val as string} />
              <Text fontSize={11} color="$success" numberOfLines={1}>
                {firma} · no se puede quitar
              </Text>
            </XStack>
          )}

          {/* Por qué no se puede elegir, y a quién reclamarle: casi siempre lo
              pidió otro jefe. */}
          {!!tomado && (
            <XStack alignItems="center" gap="$1.5" marginTop={2}>
              <AlertTriangle size={11} color={theme.warning?.val as string} />
              <Text fontSize={11} color="$warning" numberOfLines={2}>
                Ya tiene horas extra ese día ({tomado.Correlative})
                {tomado.Solicitante ? ` · ${tomado.Solicitante}` : ''}
              </Text>
            </XStack>
          )}
        </YStack>
      </XStack>
    </Card>
  )
}

function PasoHoras({
  filas,
  cargandoHorarios,
  errorHorarios,
  opcionesMotivo,
  errorFila,
  onEditar,
  onAplicarHorario,
  onAplicarMotivo,
  totalHoras,
  autorizar,
  onAutorizar,
  bandas,
  cargandoBandas,
}: {
  filas: Fila[]
  cargandoHorarios: boolean
  /** La vista de turnos falló: no es lo mismo que un día no laborable. */
  errorHorarios: string
  opcionesMotivo: { label: string; value: string }[]
  errorFila: (f: Fila) => string
  onEditar: (code: string, cambios: Partial<Fila>) => void
  onAplicarHorario: () => void
  onAplicarMotivo: () => void
  totalHoras: number
  autorizar: boolean
  onAutorizar: (v: boolean) => void
  /** Las bandas de recargo por combinación de planilla + turno. */
  bandas: Map<string, TimeBand[]>
  cargandoBandas: boolean
}) {
  const theme = useTheme()

  /** Las bandas de la fila, que son las que definen sus horas posibles. */
  const bandasDe = (f: Fila) =>
    bandas.get(parameterKey(f.cod_Planilla, f.shift_Id, f.shift_ScheduleId)) ?? []

  /**
   * Las opciones de fin de una fila.
   *
   * Si lo ya elegido no está entre ellas se agrega al final. Pasa cuando se
   * eligió antes de que llegaran las bandas: sin esto el select se vería VACÍO
   * teniendo valor, y el usuario volvería a elegir creyendo que no se guardó.
   * Va marcado, porque esas horas quedan sin concepto con el que pagarse.
   */
  const opcionesDeFin = (f: Fila) => {
    const opciones = opcionesFin(f.start_Time, bandasDe(f)).map(o => ({
      label: `${o.hora}  ·  ${fmtHoras(o.minutos / 60)}`,
      value: o.hora,
    }))

    if (f.end_Time && !opciones.some(o => o.value === f.end_Time)) {
      opciones.push({ label: `${f.end_Time}  ·  fuera de banda`, value: f.end_Time })
    }

    return opciones
  }

  const editables = filas.filter(f => !f.isLocked)
  const hayHorario = editables.length > 1 && editables.some(f => !!f.end_Time)
  const hayMotivo = editables.length > 1 && editables.some(f => !!f.category_Id)

  return (
    <YStack gap="$3">
      <Text fontSize={13} color="$textMuted">
        ¿Hasta qué hora se queda cada uno y por qué? Donde hay jornada, la hora
        de inicio sale del turno y no se cambia.
      </Text>

      {/* Lo normal es que todo el lote se quede a la misma hora y por lo mismo:
          se captura un renglón y se copia. */}
      {(hayHorario || hayMotivo) && (
        <XStack gap="$2" flexWrap="wrap">
          {hayHorario && (
            <Button
              height={34}
              borderRadius="$3"
              paddingHorizontal="$3"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="$border"
              pressStyle={{ opacity: 0.7 }}
              onPress={onAplicarHorario}
            >
              <Text fontSize={12} fontWeight="700" color="$primary">
                Aplicar horario a todos
              </Text>
            </Button>
          )}
          {hayMotivo && (
            <Button
              height={34}
              borderRadius="$3"
              paddingHorizontal="$3"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="$border"
              pressStyle={{ opacity: 0.7 }}
              onPress={onAplicarMotivo}
            >
              <Text fontSize={12} fontWeight="700" color="$primary">
                Aplicar motivo a todos
              </Text>
            </Button>
          )}
        </XStack>
      )}

      {cargandoHorarios && (
        <Text fontSize={12} color="$textMuted" fontStyle="italic">
          Cargando horarios del día…
        </Text>
      )}

      {/* Se dice una sola vez y arriba, no fila por fila: si la consulta falló
          falló para TODOS, y repetirlo en cada tarjeta haría parecer que es
          algo de cada empleado. */}
      {!!errorHorarios && !cargandoHorarios && (
        <XStack
          gap="$2"
          alignItems="flex-start"
          padding="$3"
          borderRadius={10}
          backgroundColor="$backgroundSurface"
          borderLeftWidth={3}
          borderLeftColor="$error"
        >
          <View marginTop={1}>
            <AlertTriangle size={14} color="#DC2626" />
          </View>
          <YStack flex={1} gap={2}>
            <Text fontSize={12} fontWeight="700" color="$error">
              No se pudieron cargar los horarios
            </Text>
            <Text fontSize={11} color="$textSecondary">
              {errorHorarios}
            </Text>
            <Text fontSize={11} color="$textMuted">
              Podés capturar las horas a mano, pero verificá el inicio de cada
              uno: sin el turno no se puede deducir del fin de su jornada.
            </Text>
          </YStack>
        </XStack>
      )}

      {filas.map(f => {
        const horas = rowHours(f.start_Time, f.end_Time)
        const err = errorFila(f)

        return (
          <Card
            key={f.employee_Code}
            backgroundColor="$backgroundElevated"
            borderRadius={12}
            padding="$3"
            borderWidth={1}
            borderColor={err ? '$error' : '$border'}
          >
            <YStack gap="$2.5">
              {/* Por que esta fila no se puede tocar. La edicion es por capas:
                  el renglon firmado queda de solo lectura y los demas se
                  siguen pudiendo cambiar. */}
              {f.isLocked && (
                <XStack alignItems="center" gap="$1.5">
                  <XStack
                    paddingHorizontal={8}
                    paddingVertical={2}
                    borderRadius={20}
                    alignItems="center"
                    gap="$1"
                    backgroundColor={
                      f.lockLabel === 'Rechazado' ? '$errorOpacity2' : '$successOpacity2'
                    }
                  >
                    <Lock
                      size={10}
                      color={
                        (f.lockLabel === 'Rechazado'
                          ? theme.error?.val
                          : theme.success?.val) as string
                      }
                    />
                    <Text
                      fontSize={10}
                      fontWeight="800"
                      color={f.lockLabel === 'Rechazado' ? '$error' : '$success'}
                    >
                      {f.lockLabel || 'Autorizado'}
                    </Text>
                  </XStack>
                  <Text fontSize={10} color="$textMuted">
                    ya no se puede editar
                  </Text>
                </XStack>
              )}

              <XStack justifyContent="space-between" alignItems="center" gap="$2">
                <Text fontSize={14} fontWeight="700" color="$text" flex={1} numberOfLines={1}>
                  {nombreConCodigo(f.employee_Name, f.employee_Code)}
                </Text>

                <XStack
                  alignItems="center"
                  gap="$1"
                  paddingHorizontal={8}
                  paddingVertical={3}
                  borderRadius={20}
                  backgroundColor={horas ? '$successOpacity2' : '$backgroundSurface'}
                >
                  <Clock size={12} color={horas ? (theme.success?.val as string) : '#94A3B8'} />
                  <Text
                    fontSize={12}
                    fontWeight="800"
                    color={horas ? '$success' : '$textMuted'}
                  >
                    {horas ? fmtHoras(horas) : '—'}
                  </Text>
                </XStack>
              </XStack>

              {/* Por qué la hora de inicio está abierta. Solo se afirma que
                  el día no es laborable cuando el horario SÍ se pudo consultar;
                  si la consulta falló, no se sabe. */}
              {!f.hasSchedule && !f.isLocked && !errorHorarios && (
                <XStack alignItems="center" gap="$1.5">
                  <AlertTriangle size={11} color={theme.warning?.val as string} />
                  <Text fontSize={11} color="$warning">
                    Día no laborable para su turno: elegí la hora de inicio
                  </Text>
                </XStack>
              )}

              {f.isLocked ? (
                /* Solo lectura: lo que se pidio y por que, sin controles. Se
                   muestra igual porque forma parte de la solicitud y quien
                   edita necesita verlo para decidir sobre los demas. */
                <YStack
                  gap="$1"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius={10}
                  backgroundColor="$backgroundSurface"
                >
                  <XStack alignItems="center" gap="$2">
                    <Clock size={13} color={theme.textMuted?.val as string} />
                    <Text fontSize={12} color="$textSecondary">
                      {f.start_Time || '--:--'} - {f.end_Time || '--:--'}
                    </Text>
                  </XStack>
                  <Text fontSize={11} color="$textMuted" numberOfLines={2}>
                    {opcionesMotivo.find(o => o.value === String(f.category_Id))?.label
                      ?? 'Sin motivo'}
                  </Text>
                </YStack>
              ) : (
                <>
                {/* ── El inicio ──────────────────────────────────────────────
                    Con jornada no se elige: lo manda el turno y solo se informa
                    de dónde salió. Sin jornada se elige de una lista, porque no
                    hay jornada de la cual deducirlo. */}
                {f.hasSchedule ? (
                  <XStack
                    alignItems="center"
                    gap="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius={10}
                    backgroundColor="$backgroundSurface"
                  >
                    <Clock size={13} color={theme.textMuted?.val as string} />
                    <Text fontSize={12} color="$textSecondary" flex={1}>
                      Empieza a las{' '}
                      <Text fontSize={13} fontWeight="800" color="$text">
                        {f.start_Time}
                      </Text>
                      , al terminar su jornada
                    </Text>
                  </XStack>
                ) : (
                  <AppSelect
                    label="Empieza a las"
                    value={f.start_Time}
                    options={opcionesInicio().map(h => ({ label: h, value: h }))}
                    onValueChange={v => onEditar(f.employee_Code, { start_Time: String(v) })}
                  />
                )}

                {/* ── El fin ─────────────────────────────────────────────────
                    Se elige CUÁNTO se queda, no a qué hora: así se pide y así se
                    paga. Cada opción dice la hora de salida y la duración,
                    porque son las dos preguntas y la respuesta es la misma.

                    Las opciones salen de LAS BANDAS del turno, así que ninguna
                    puede dar un rango inválido ni horas fuera de banda: lo que no
                    es pagable no se ofrece. */}
                {!f.start_Time ? (
                  <Text fontSize={11} color="$textMuted" fontStyle="italic">
                    Elegí primero la hora de inicio
                  </Text>
                ) : (
                  <YStack gap="$1">
                    <AppSelect
                      label="Se queda hasta"
                      value={f.end_Time}
                      options={opcionesDeFin(f)}
                      onValueChange={v => onEditar(f.employee_Code, { end_Time: String(v) })}
                    />

                    {/* Sin bandas las opciones son un tope genérico y no lo que
                        está configurado: se avisa, porque esas horas pueden
                        terminar sin concepto con el que pagarse. */}
                    {bandasDe(f).length === 0 && !cargandoBandas && (
                      <XStack alignItems="center" gap="$1.5">
                        <AlertTriangle size={11} color={theme.warning?.val as string} />
                        <Text fontSize={10} color="$warning" flex={1}>
                          Su turno no tiene bandas de recargo configuradas para
                          este día: las horas podrían quedar sin concepto.
                        </Text>
                      </XStack>
                    )}
                  </YStack>
                )}
                  <AppSelect
                    label="Motivo"
                    value={f.category_Id ? String(f.category_Id) : ''}
                    options={opcionesMotivo}
                    onValueChange={v =>
                      onEditar(f.employee_Code, { category_Id: v ? Number(v) : null })
                    }
                  />
                </>
              )}

              {/* El reparto por banda: es lo que define cuánto cuesta */}
              {f.breakdown.length > 0 && (
                <XStack gap="$1.5" flexWrap="wrap">
                  {f.breakdown.map((b, i) => (
                    <XStack
                      key={`${f.employee_Code}-b-${i}`}
                      paddingHorizontal={8}
                      paddingVertical={3}
                      borderRadius={20}
                      backgroundColor="$backgroundSurface"
                      alignItems="center"
                      gap="$1"
                    >
                      <Text fontSize={10} fontWeight="700" color="$textSecondary">
                        {b.descripcion}
                      </Text>
                      <Text fontSize={10} fontWeight="800" color="$text">
                        {fmtHoras(b.hours)}
                      </Text>
                    </XStack>
                  ))}
                </XStack>
              )}

              {cruzaMedianoche(f.start_Time, f.end_Time) && !err && (
                <Text fontSize={11} color="$textMuted">
                  Termina el día siguiente
                </Text>
              )}

              {!!err && (
                <Text fontSize={11} fontWeight="700" color="$error">
                  {err}
                </Text>
              )}
            </YStack>
          </Card>
        )
      })}

      {/* El total, antes de guardar. Reemplaza al paso de revisar que había
          acá: de todo ese resumen, lo único que no se veía ya en las tarjetas
          era cuánto suma el lote. */}
      {filas.length > 0 && (
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal="$3"
          paddingVertical="$2.5"
          borderRadius={10}
          backgroundColor="$backgroundSurface"
        >
          <Text fontSize={12} fontWeight="600" color="$textSecondary">
            {filas.length} empleado(s)
          </Text>
          <Text fontSize={18} fontWeight="800" color="$text">
            {fmtHoras(totalHoras)}
          </Text>
        </XStack>
      )}

      {/* Autorizar de una vez.
          Marcado por omisión porque es el caso normal —se pide y se manda— y
          la casilla existe para el que quiere dejarla guardada y revisarla
          antes. La advertencia es honesta: sin autorizar, terminarla solo se
          puede desde la web. */}
      <Card
        backgroundColor={autorizar ? '$primaryOpacity2' : '$backgroundElevated'}
        borderRadius={12}
        padding="$3"
        borderWidth={1}
        borderColor={autorizar ? '$primary' : '$border'}
        pressStyle={{ opacity: 0.8 }}
        onPress={() => onAutorizar(!autorizar)}
      >
        <XStack alignItems="flex-start" gap="$3">
          <View
            width={22}
            height={22}
            borderRadius={6}
            borderWidth={2}
            borderColor={autorizar ? '$primary' : '$border'}
            backgroundColor={autorizar ? '$primary' : 'transparent'}
            alignItems="center"
            justifyContent="center"
            marginTop={1}
          >
            {autorizar && <Check size={14} color="#FFFFFF" />}
          </View>

          <YStack flex={1} gap={3}>
            <Text fontSize={14} fontWeight="700" color="$text">
              Autorizar y enviar
            </Text>
            <Text fontSize={11} color="$textSecondary">
              {autorizar
                ? 'La solicitud sale con tu autorización y arranca el flujo. Después ya no se puede editar.'
                : 'Queda guardada sin enviar y todavía se puede editar, pero solo desde la pantalla web de PayWeb.'}
            </Text>
          </YStack>
        </XStack>
      </Card>
    </YStack>
  )
}
