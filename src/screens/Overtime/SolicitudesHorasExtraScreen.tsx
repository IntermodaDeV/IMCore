import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet } from 'react-native'
import dayjs from 'dayjs'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import { Briefcase, CalendarDays, Check, CheckSquare, ChevronDown, Clock, MessageSquare, Square, UserRound, X } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { useKeyboardHeight } from '../../hooks/useKeyboardInset'
import { useShowToast } from '../../utils/useShowToast'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import SearchInput from '../../components/commons/SearchInput'
import AppSelect from '../../components/commons/AppSelect'
import AppInput from '../../components/commons/AppInput'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { subscribeOpenSolicitudHoraExtra } from '../../services/overtimeNavigation'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeApprovalImpact,
  IOvertimeRequestDetail,
  IUserEntity,
} from '../../api/modules/overtime/overtime.types'
import {
  DistribucionHoras,
  fmtFecha,
  fmtHora,
  fmtHoras,
  nombreConCodigo,
  parseConceptos,
} from './Overtime.utils'


/**
 * ¿Esta entidad todavía puede firmar este renglón?
 *
 * La columna de estado de cada entidad viaja en DynamicColumns como
 * `Status_<NombreSinEspacios>`; solo 'Pendiente' habilita la decisión.
 * 'Aprobado' y 'Rechazado' significan que esta misma entidad ya se pronunció, y
 * 'No aplica' que una etapa anterior rechazó y el flujo se cortó.
 *
 * La bandeja ya viene filtrada por el procedimiento, así que en condiciones
 * normales todo lo que se ve es firmable. La comprobación existe igual para el
 * lote: si algo se coló —una lista vieja en pantalla, un renglón resuelto desde
 * otro lado— es preferible dejarlo fuera del envío que mandarlo y que el SP lo
 * rechace a mitad del lote.
 */
const puedeAutorizar = (item: IOvertimeRequestDetail, nombreEntidad: string): boolean => {
  if (!nombreEntidad) return true

  const columna = `Status_${nombreEntidad.replace(/\s+/g, '')}`
  const estado = String(item?.DynamicColumns?.[columna] ?? '').trim()

  // Sin columna de estado no hay motivo para bloquear: puede ser una entidad
  // que el procedimiento no expone.
  return estado === '' || estado === 'Pendiente'
}

/**
 * Una solicitud con sus renglones pendientes.
 *
 * La bandeja llega renglón por renglón —un empleado cada uno— porque eso es lo
 * que se firma. Para la última entidad eso no alcanza: lo que decide es cuánto
 * cuesta LA SOLICITUD, y con los empleados sueltos hay que sumarlos de cabeza.
 */
interface GrupoSolicitud {
  requestId: number
  correlativo: string
  fecha: string | null
  solicitante: string
  motivo: string
  comentario: string
  detalles: IOvertimeRequestDetail[]
  horas: number
  /** Suma de lo que cuesta aprobar los renglones que siguen pendientes. */
  costo: number | null
}

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * El 'yyyy-mm-dd' de una fecha, venga como venga.
 *
 * Se toma el prefijo cuando ya es ISO y se interpreta cuando no: la fecha de la
 * solicitud y la que arma el filtro salen de fuentes distintas.
 */
const claveDia = (valor: string | null | undefined): string => {
  const s = String(valor ?? '')
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)

  const d = dayjs(s)
  return d.isValid() ? d.format('YYYY-MM-DD') : ''
}

/**
 * Los días con algo pendiente, de la fecha más vieja a la más nueva.
 *
 * Salen de los DATOS y no de una semana fija, a diferencia de la pantalla del
 * solicitante: esta bandeja es una cola de trabajo sin filtro de fecha, así que
 * puede tener solicitudes de varias semanas y los siete días de una no
 * alcanzarían. Un día que no aparece es un día sin nada que firmar.
 *
 * La etiqueta lleva día, número y mes ('Lun 07/09') porque la lista puede
 * cruzar semanas Y meses: solo el nombre del día sería ambiguo, y sin el mes
 * dos días 07 de meses distintos se verían iguales.
 */
const diasConPendientes = (
  filas: IOvertimeRequestDetail[],
): { key: string; label: string }[] => {
  const claves = new Set<string>()

  for (const f of filas) {
    const k = claveDia(f.Date)
    if (k) claves.add(k)
  }

  // Del día más VIEJO al más nuevo: lo que lleva más tiempo esperando una
  // firma es lo primero que hay que atender. Las claves son 'yyyy-mm-dd', así
  // que el orden alfabético ya es el cronológico.
  return [...claves].sort().map(key => {
    const d = dayjs(key)
    return {
      key,
      // dayjs pone el domingo en 0; acá la semana arranca el lunes.
      label: `${DIAS_CORTOS[(d.day() + 6) % 7]} ${key.substring(8, 10)}/${key.substring(5, 7)}`,
    }
  })
}

/** 'Juan Pérez' o '3 empleados · 12h 30m' para los textos del lote. */
const resumenLote = (detalles: IOvertimeRequestDetail[]): string => {
  const horas = detalles.reduce((acc, d) => acc + (d.Total_Overtime_Hours ?? 0), 0)

  if (detalles.length === 1) {
    return `${fmtHoras(detalles[0].Total_Overtime_Hours)} de ${nombreConCodigo(
      detalles[0].Employee_Name,
      detalles[0].Employee_Code,
    )}`
  }

  return `${detalles.length} solicitudes · ${fmtHoras(horas)}`
}

export default function SolicitudesHorasExtraScreen() {
  const { defaultCompany } = useAuth()
  const loader = useLoader()
  const theme = useTheme()
  const { showToast } = useShowToast()
  const keyboardHeight = useKeyboardHeight()

  const [entidades, setEntidades] = useState<IUserEntity[]>([])
  const [entidad, setEntidad] = useState<string>('')
  const [data, setData] = useState<IOvertimeRequestDetail[]>([])
  const [filtered, setFiltered] = useState<IOvertimeRequestDetail[]>([])

  /**
   * Día elegido. null = toda la semana, que es el arranque.
   *
   * Al revés que en la pantalla del solicitante, donde arranca en hoy: esta es
   * una cola de TRABAJO y lo primero que hay que ver es todo lo que falta
   * firmar, no solo lo de un día.
   */
  const [dia, setDia] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  // Aprobar y rechazar trabajan sobre una LISTA: una tarjeta suelta es un lote
  // de uno. Así el confirm, el envío y el mensaje son un solo camino en vez de
  // dos que hay que mantener parejos.
  const [aprobando, setAprobando] = useState<IOvertimeRequestDetail[] | null>(null)
  const [rechazando, setRechazando] = useState<IOvertimeRequestDetail[] | null>(null)

  // Ids marcados para resolver en lote.
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  // Impacto de la firma sobre el presupuesto. Solo llega con contenido en la
  // última etapa del flujo, que es la que compromete el dinero.
  const [impacto, setImpacto] = useState<IOvertimeApprovalImpact[]>([])

  // Impacto de TODA la bandeja, no del lote que se está por firmar. Es lo que
  // permite poner el costo en cada tarjeta antes de abrir nada.
  const [impactoBandeja, setImpactoBandeja] = useState<IOvertimeApprovalImpact[]>([])

  /**
   * Por qué no se pudo traer el impacto.
   *
   * No bloquea aprobar —el impacto es información de apoyo, no un requisito—
   * pero tampoco se descarta: sin el motivo, una consulta que revienta se ve
   * exactamente igual que un usuario sin el acceso 'CostoHE' o que una etapa
   * que todavía no compromete dinero, y los tres casos legítimamente no pintan
   * nada. No había forma de distinguirlos.
   */
  const [errorImpacto, setErrorImpacto] = useState('')
  // Solicitudes desplegadas. Arrancan cerradas: la tarjeta cerrada ya dice
  // cuántos empleados, cuántas horas y cuánto cuesta, que es con lo que se
  // decide; el detalle es para cuando algo no cuadra.
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set())
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resaltadaId, setResaltadaId] = useState<number | null>(null)
  // Sin tipo fijo: la lista muestra renglones o solicitudes agrupadas según
  // la etapa, y son dos formas distintas.
  const listaRef = useRef<FlatList<any> | null>(null)

  const companyCode = defaultCompany?.Code ?? ''

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitudes de Horas Extra
      </Text>
    ),
    right: <NotificationBell size={18} />,
  })

  const loadEntidades = useCallback(async () => {
    if (!companyCode) return
    try {
      const res = await overtimeService.getRequestEntities(companyCode)
      const lista = res.Success ? res.Data ?? [] : []
      setEntidades(lista)

      // Al cambiar de empresa la entidad anterior puede ya no existir.
      setEntidad(prev => {
        const sigueValida = prev && lista.some(e => String(e.Id) === prev)
        return sigueValida ? prev : lista.length ? String(lista[0].Id) : ''
      })
    } catch (err) {
      setError(handleError(err))
    }
  }, [companyCode])

  /**
   * Costo de cada renglón de la bandeja, para poder mostrarlo en la lista.
   *
   * El procedimiento devuelve el desglose por EMPLEADO, no por renglón, así
   * que de ahí sale una tarifa —costo entre horas— y con ella se reparte el
   * costo entre los renglones de ese empleado. Con un solo renglón pendiente
   * por empleado, que es el caso normal, el reparto es exacto; con más de uno
   * el total de la solicitud sigue siendo exacto y lo aproximado es cuánto
   * pone cada renglón.
   *
   * De mejor esfuerzo: si falla, las tarjetas salen sin monto y todo lo demás
   * funciona igual.
   */
  const pedirImpactoBandeja = useCallback(
    async (filas: IOvertimeRequestDetail[]) => {
      if (!companyCode || !entidad || filas.length === 0) {
        setImpactoBandeja([])
        return
      }

      try {
        const res = await overtimeService.getApprovalImpact(
          companyCode,
          Number(entidad),
          filas.map(d => d.Id),
        )

        // El fallo NO se traga. Sigue siendo de mejor esfuerzo —las tarjetas
        // salen sin monto y todo lo demás funciona— pero el motivo se guarda:
        // antes esto devolvía [] y una consulta que reventaba se veía igual que
        // un usuario sin el acceso al costo, así que no había cómo distinguirlas.
        if (res?.Success && res.Data) {
          setImpactoBandeja(res.Data)
          setErrorImpacto('')
        } else {
          setImpactoBandeja([])
          setErrorImpacto(res?.ErrorMessage || 'El servidor no devolvió el impacto en el presupuesto.')
        }
      } catch (err) {
        setImpactoBandeja([])
        setErrorImpacto(handleError(err).message)
      }
    },
    [companyCode, entidad],
  )

  const loadData = useCallback(async (silent = false) => {
    if (!companyCode || !entidad) {
      setData([])
      setFiltered([])
      return
    }

    try {
      if (silent) {
        setRefreshing(true)
      } else {
        loader.show()
        setLoading(true)
      }
      setError(null)

      const res = await overtimeService.getRequestDetails(companyCode, Number(entidad))

      // Sin esto, un error del backend (Success=false) se vería como bandeja vacía.
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudieron cargar las solicitudes')

      const filas = res.Data ?? []
      setData(filas)
      setFiltered(filas)

      pedirImpactoBandeja(filas)

      // Lo que ya no está en la bandeja no se puede seguir teniendo marcado.
      setSeleccionados(prev => {
        const vigentes = new Set(filas.map(d => d.Id))
        const quedan = new Set([...prev].filter(id => vigentes.has(id)))
        return quedan.size === prev.size ? prev : quedan
      })
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
      loader.hide()
    }
  }, [companyCode, entidad, pedirImpactoBandeja])

  /**
   * Registra la decisión sobre uno o varios detalles.
   *
   * Va en UNA sola llamada y no una por detalle: el endpoint recibe la lista y
   * el procedimiento la resuelve en una transacción. Mandarlas de a una dejaría
   * lotes a medio aplicar si algo falla en el camino.
   */
  const enviarDecision = useCallback(
    async (detalles: IOvertimeRequestDetail[], aprobar: boolean, comentario: string) => {
      if (detalles.length === 0) return

      try {
        setEnviando(true)
        loader.show()

        const ids = detalles.map(d => d.Id)

        const res = await overtimeService.authorizeRequest(companyCode, {
          SystemEntities_Id: Number(entidad),
          Auth: aprobar,
          Comment: comentario,
          Details: ids,
        })

        if (!res.Success) {
          showToast('error', 'Error', res.ErrorMessage || 'No se pudo registrar la decisión', 5000, 'top')
          return
        }

        const resueltos = new Set(ids)
        const quitar = (lista: IOvertimeRequestDetail[]) => lista.filter(d => !resueltos.has(d.Id))
        setData(quitar)
        setFiltered(quitar)

        setSeleccionados(prev => new Set([...prev].filter(id => !resueltos.has(id))))

        // El costo de la solicitud lo pone lo que sigue PENDIENTE, así que al
        // aprobar a uno tiene que bajar. Se vuelve a pedir con lo que quedó.
        pedirImpactoBandeja(data.filter(d => !resueltos.has(d.Id)))

        setAprobando(null)
        setRechazando(null)
        setMotivo('')

        showToast(
          'success',
          aprobar ? 'Aprobado' : 'Rechazado',
          detalles.length === 1
            ? `Horas extra de ${nombreConCodigo(detalles[0].Employee_Name, detalles[0].Employee_Code)}`
            : `${detalles.length} solicitudes de horas extra`,
          3000,
          'top',
        )
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 5000, 'top')
      } finally {
        setEnviando(false)
        loader.hide()
      }
    },
    [companyCode, entidad, loader, showToast, data, pedirImpactoBandeja],
  )

  /**
   * Pide el impacto sobre el presupuesto de lo que se está por aprobar.
   *
   * De mejor esfuerzo: si falla, el confirm sale sin el bloque. Es información
   * de apoyo para decidir, no un requisito para poder firmar — dejar de
   * aprobar porque no se pudo pintar un porcentaje sería peor.
   */
  const pedirImpacto = useCallback(
    async (detalles: IOvertimeRequestDetail[]) => {
      setImpacto([])
      if (!companyCode || !entidad || detalles.length === 0) return

      try {
        const res = await overtimeService.getApprovalImpact(
          companyCode,
          Number(entidad),
          detalles.map(d => d.Id),
        )

        if (!res?.Success || !res.Data) {
          setImpacto([])
          setErrorImpacto(res?.ErrorMessage || 'El servidor no devolvió el impacto en el presupuesto.')
          return
        }

        setErrorImpacto('')
        // Se piden las dos condiciones: que sea la última firma —antes no se
        // compromete nada— y que el usuario pueda ver montos. Sin lo segundo el
        // bloque quedaría vacío, porque ahora ES el dinero.
        setImpacto(res.Data.filter(r => r.Es_Ultima_Entidad && r.Ve_Costo))
      } catch (err) {
        setImpacto([])
        setErrorImpacto(handleError(err).message)
      }
    },
    [companyCode, entidad],
  )

  /** Abrir el confirm de aprobar: se muestra ya y el impacto llega después. */
  const abrirAprobacion = useCallback(
    (detalles: IOvertimeRequestDetail[]) => {
      setAprobando(detalles)
      pedirImpacto(detalles)
    },
    [pedirImpacto],
  )

  const confirmarRechazo = useCallback(() => {
    if (!rechazando || rechazando.length === 0) return
    const texto = motivo.trim()
    if (texto.length < 10) {
      setMotivoError('Indica el motivo del rechazo (al menos 10 caracteres)')
      return
    }

    enviarDecision(rechazando, false, texto)
  }, [rechazando, motivo, enviarDecision])

  useEffect(() => {
    loadEntidades()
  }, [loadEntidades])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData]),
  )

  useEffect(() => {
    const unsub = subscribeOpenSolicitudHoraExtra(requestId => {
      setResaltadaId(requestId)
      loadData(true)

      // Se espera a que la recarga pinte la lista antes de buscar la posición.
      setTimeout(() => {
        // Sirve para las dos formas: agrupada la fila ES la solicitud.
        const indice = filtradosRef.current.findIndex(
          (x: any) => (x?.requestId ?? x?.Request_Id) === requestId,
        )
        if (indice >= 0) {
          listaRef.current?.scrollToIndex({ index: indice, animated: true, viewPosition: 0 })
        }
      }, 350)

      setTimeout(() => setResaltadaId(null), 2600)
    })
    return unsub
  }, [loadData])

  const opcionesEntidad = useMemo(
    () => entidades.map(e => ({ label: e.Name, value: String(e.Id) })),
    [entidades],
  )

  // El nombre de la entidad activa es lo que arma el nombre de su columna de
  // estado, y con eso se sabe si le toca firmar cada renglón.
  const nombreEntidad = useMemo(
    () => entidades.find(e => String(e.Id) === entidad)?.Name ?? '',
    [entidades, entidad],
  )

  /**
   * ¿Le toca la última firma?
   *
   * Es la que compromete el dinero, y es donde agrupar por solicitud cambia
   * algo: las etapas anteriores solo dan el visto bueno de su gente y ven una
   * cola corta. El procedimiento del impacto ya resuelve la pregunta, así que
   * no hace falta reconocer a la entidad por su nombre —que cambiaría con
   * cualquier renombre en AdmSys.
   */
  /**
   * ¿Le toca la última firma?
   *
   * Sale de la entidad seleccionada y no del impacto: el impacto es una
   * consulta aparte que puede tardar o fallar, y con la agrupación colgando de
   * ella la bandeja se dibujaba plana y ya no se reacomodaba. Cómo está armado
   * el flujo es algo que se sabe apenas se eligen las entidades.
   */
  const esUltimaEntidad = useMemo(
    () => entidades.find(e => String(e.Id) === entidad)?.Es_Ultima === true,
    [entidades, entidad],
  )

  const veCosto = useMemo(
    () => impactoBandeja.some(r => r.Es_Ultima_Entidad && r.Ve_Costo),
    [impactoBandeja],
  )

  /** Tarifa por hora de cada empleado, deducida del impacto. */
  const tarifaPorEmpleado = useMemo(() => {
    const mapa = new Map<string, number>()

    impactoBandeja.forEach(area => {
      let empleados: any[] = []
      try {
        const parsed = JSON.parse(area.Empleados_Json ?? '[]')
        empleados = Array.isArray(parsed) ? parsed : []
      } catch {
        empleados = []
      }

      empleados.forEach(e => {
        const horas = Number(e?.horas ?? 0)
        const costo = e?.costo
        if (horas > 0 && costo !== null && costo !== undefined) {
          mapa.set(String(e.employee_Code), Number(costo) / horas)
        }
      })
    })

    return mapa
  }, [impactoBandeja])

  const costoDetalle = useCallback(
    (d: IOvertimeRequestDetail): number | null => {
      const tarifa = tarifaPorEmpleado.get(String(d.Employee_Code))
      if (tarifa === undefined) return null
      return tarifa * (d.Total_Overtime_Hours ?? 0)
    },
    [tarifaPorEmpleado],
  )

  /** La bandeja vista por solicitud, en el orden en que ya venía. */
  // Los botones salen de TODO lo que hay, no de lo que deja el día elegido:
  // si salieran de lo filtrado, elegir un día borraría los demás botones.
  const dias = useMemo(() => diasConPendientes(data), [data])

  /**
   * Lo que se muestra: la búsqueda y después el día.
   *
   * En ese orden porque SearchInput trabaja sobre el conjunto completo;
   * encadenarlo al revés dejaría fuera resultados que sí coinciden pero están
   * en otro día.
   */
  const visibles = useMemo(
    () => (dia ? filtered.filter(f => claveDia(f.Date) === dia) : filtered),
    [filtered, dia],
  )

  const grupos = useMemo<GrupoSolicitud[]>(() => {
    const porId = new Map<number, GrupoSolicitud>()

    visibles.forEach(d => {
      let g = porId.get(d.Request_Id)

      if (!g) {
        g = {
          requestId: d.Request_Id,
          correlativo: d.Correlative,
          fecha: d.Date,
          solicitante: d.Solicitante || d.Create_By,
          motivo: d.Category_Name,
          comentario: d.Comment,
          detalles: [],
          horas: 0,
          costo: null,
        }
        porId.set(d.Request_Id, g)
      }

      g.detalles.push(d)
      g.horas += d.Total_Overtime_Hours ?? 0

      const c = costoDetalle(d)
      if (c !== null) g.costo = (g.costo ?? 0) + c
    })

    return [...porId.values()]
  }, [visibles, costoDetalle])

  // La ref sigue a lo que realmente se está pintando, que es lo que hay que
  // recorrer para ubicar una solicitud que llegó por notificación.
  useEffect(() => {
    filtradosRef.current = esUltimaEntidad ? grupos : visibles
  }, [esUltimaEntidad, grupos, visibles])

  const alternarGrupo = useCallback((requestId: number) => {
    setExpandidas(prev => {
      const copia = new Set(prev)
      if (copia.has(requestId)) copia.delete(requestId)
      else copia.add(requestId)
      return copia
    })
  }, [])

  const alternarSeleccion = useCallback((id: number) => {
    setSeleccionados(prev => {
      const copia = new Set(prev)
      if (copia.has(id)) copia.delete(id)
      else copia.add(id)
      return copia
    })
  }, [])

  /**
   * Lo marcado que ADEMÁS se puede firmar, que es lo único que se manda.
   *
   * Se recorre lo filtrado y no lo seleccionado: si el buscador dejó una
   * tarjeta fuera de la vista, sigue contando —está marcada— pero se resuelve
   * contra la lista real de la bandeja.
   */
  const seleccionValida = useMemo(
    () => data.filter(d => seleccionados.has(d.Id) && puedeAutorizar(d, nombreEntidad)),
    [data, seleccionados, nombreEntidad],
  )

  // Marcadas que quedan fuera del envío. Se cuentan para que el número no
  // sorprenda al confirmar.
  const bloqueadas = seleccionados.size - seleccionValida.length

  const seleccionarTodas = useCallback(() => {
    // Solo las visibles y firmables: "todas" sobre una lista filtrada tiene que
    // significar las que se están viendo.
    const marcables = visibles.filter(d => puedeAutorizar(d, nombreEntidad)).map(d => d.Id)
    const todasMarcadas = marcables.length > 0 && marcables.every(id => seleccionados.has(id))

    setSeleccionados(prev => {
      const copia = new Set(prev)
      marcables.forEach(id => (todasMarcadas ? copia.delete(id) : copia.add(id)))
      return copia
    })
  }, [visibles, nombreEntidad, seleccionados])

  // El callback del bus se registra una sola vez, así que leería un `filtered`
  // viejo. La ref siempre tiene el actual.
  const filtradosRef = useRef<any[]>(filtered)

  /**
   * Conteo del pie de los filtros.
   *
   * Se cuenta sobre lo que se está VIENDO —búsqueda y día ya aplicados— pero
   * cuando eso recortó la lista se dice también el total: si no, parecería que
   * la bandeja tiene menos de lo que tiene.
   */
  const resumen = useMemo(() => {
    const empleados = new Set(visibles.map(d => d.Employee_Code)).size
    const horas = visibles.reduce((acc, d) => acc + (d.Total_Overtime_Hours ?? 0), 0)

    const texto =
      visibles.length === data.length
        ? `${data.length} registro${data.length === 1 ? '' : 's'} · ${empleados} empleado${empleados === 1 ? '' : 's'}`
        : `${visibles.length} de ${data.length} registros`

    return { empleados, horas, texto }
  }, [visibles, data])

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  const sinEntidades = !!companyCode && entidades.length === 0

  return (
    <>
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$2">
        {opcionesEntidad.length > 1 && (
          <AppSelect
            label="Entidad"
            value={entidad}
            options={opcionesEntidad}
            onValueChange={v => setEntidad(String(v))}
          />
        )}

        <SearchInput
          data={data}
          searchKeys={['Employee_Name', 'Employee_Code', 'Correlative', 'Category_Name', 'Solicitante']}
          onResults={setFiltered}
          placeholder="Buscar por empleado, correlativo o motivo"
        />

        {/* Los días con algo pendiente. Solo aparece con más de uno: con todo
            en el mismo día el filtro no separa nada y sería una fila de más. */}
        {dias.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
          >
            <ChipDia label="Todos" activo={!dia} onPress={() => setDia(null)} />
            {dias.map(d => (
              <ChipDia
                key={d.key}
                label={d.label}
                activo={dia === d.key}
                // Volver a tocar el día activo lo apaga: el camino corto a ver
                // todo de nuevo.
                onPress={() => setDia(dia === d.key ? null : d.key)}
              />
            ))}
          </ScrollView>
        )}

        {/* Barra de lote: aparece solo con tarjetas marcadas. Dice cuántas se
            van a firmar y cuántas quedan fuera, para que el conteo no
            sorprenda al confirmar. */}
        {seleccionados.size > 0 && (
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius={12}
            backgroundColor="$primaryOpacity2"
            borderWidth={1}
            borderColor="$primary"
          >
            <YStack flex={1} minWidth={0}>
              <Text fontSize={13} fontWeight="700" color="$text">
                {seleccionValida.length} seleccionada(s)
              </Text>
              <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                {fmtHoras(seleccionValida.reduce((a, d) => a + (d.Total_Overtime_Hours ?? 0), 0))}
                {bloqueadas > 0 ? ` · ${bloqueadas} sin acción disponible` : ''}
              </Text>
            </YStack>

            <Button
              height={36} borderRadius={10} paddingHorizontal="$3"
              backgroundColor="$backgroundSurface"
              borderWidth={1} borderColor="$border"
              pressStyle={{ opacity: 0.7 }}
              disabled={seleccionValida.length === 0}
              onPress={() => {
                setMotivo('')
                setMotivoError('')
                setRechazando(seleccionValida)
              }}
            >
              <X size={16} color={theme.error?.val as string} />
            </Button>

            <Button
              height={36} borderRadius={10} paddingHorizontal="$3"
              backgroundColor="$success"
              pressStyle={{ opacity: 0.85 }}
              disabled={seleccionValida.length === 0}
              onPress={() => abrirAprobacion(seleccionValida)}
            >
              <XStack alignItems="center" gap="$1.5">
                <Check size={16} color="white" />
                <Text fontSize={13} fontWeight="700" color="white">
                  Aprobar
                </Text>
              </XStack>
            </Button>
          </XStack>
        )}

        {/* Marcar o desmarcar lo que se está viendo, y cuánto hay */}
        {data.length > 0 && (
          <XStack alignItems="center" justifyContent="space-between" gap="$2" paddingVertical="$1">
            {visibles.length > 0 ? (
              <XStack
                alignItems="center"
                gap="$2"
                pressStyle={{ opacity: 0.6 }}
                onPress={seleccionarTodas}
              >
                <CheckSquare size={15} color={theme.textMuted?.val as string} />
                <Text fontSize={12} color="$textMuted">
                  {seleccionados.size > 0 ? 'Quitar selección' : 'Seleccionar todas'}
                </Text>
              </XStack>
            ) : (
              <View />
            )}

            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
              {resumen.texto}
            </Text>
          </XStack>
        )}
      </YStack>

      <FlatList
        ref={listaRef}
        // Para la última entidad la unidad de decisión es la SOLICITUD; para
        // las anteriores sigue siendo el renglón de su gente.
        data={(esUltimaEntidad ? grupos : visibles) as any[]}
        keyExtractor={(item: any) => String(esUltimaEntidad ? item.requestId : item.Id)}
        onScrollToIndexFailed={info => {
          listaRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          })
          setTimeout(() => {
            listaRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0 })
          }, 250)
        }}
        contentContainerStyle={
          visibles.length === 0
            ? { flexGrow: 1 }
            : { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 }
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[theme.primary?.val as string]}
            tintColor={theme.primary?.val as string}
          />
        }
        ListEmptyComponent={
          sinEntidades ? (
            <EmptyState
              title="Sin entidades asignadas"
              message="No participás en el flujo de aprobación de horas extra de esta empresa."
            />
          ) : dia ? (
            // Con un día puesto, "nada pendiente" sería falso: hay pendientes,
            // pero de otros días.
            <EmptyState
              title="Sin pendientes ese día"
              message='No hay nada que firmar de ese día. Toque "Todos" para ver el resto.'
            />
          ) : (
            <EmptyState
              title="Nada pendiente"
              message="No hay solicitudes de horas extra esperando tu aprobación."
            />
          )
        }
        renderItem={({ item }: any) =>
          esUltimaEntidad ? (
            <SolicitudGrupoCard
              grupo={item}
              resaltada={item.requestId === resaltadaId}
              abierta={expandidas.has(item.requestId)}
              veCosto={veCosto}
              seleccionados={seleccionados}
              esFirmable={d => puedeAutorizar(d, nombreEntidad)}
              costoDe={costoDetalle}
              onAlternar={() => alternarGrupo(item.requestId)}
              onSeleccionar={id => alternarSeleccion(id)}
              onAprobar={detalles => abrirAprobacion(detalles)}
              onRechazar={detalles => {
                setMotivo('')
                setMotivoError('')
                setRechazando(detalles)
              }}
            />
          ) : (
            <SolicitudCard
              item={item}
              resaltada={item.Request_Id === resaltadaId}
              seleccionada={seleccionados.has(item.Id)}
              firmable={puedeAutorizar(item, nombreEntidad)}
              onSeleccionar={() => alternarSeleccion(item.Id)}
              onAprobar={() => abrirAprobacion([item])}
              onRechazar={() => {
                setMotivo('')
                setMotivoError('')
                setRechazando([item])
              }}
            />
          )
        }
      />

    </View>
      <ConfirmDialog
        open={!!aprobando}
        onOpenChange={abierto => { if (!abierto) { setAprobando(null); setImpacto([]); setErrorImpacto('') } }}
        title="Aprobar horas extra"
        message={aprobando ? `¿Aprobar ${resumenLote(aprobando)}?` : ''}
        confirmLabel={aprobando && aprobando.length > 1 ? `Aprobar ${aprobando.length}` : 'Aprobar'}
        confirmColor="#22C55E"
        loading={enviando}
        onConfirm={() => aprobando && enviarDecision(aprobando, true, '')}
        onCancel={() => { setAprobando(null); setImpacto([]); setErrorImpacto('') }}
        // Con impacto se pinta el bloque; si la consulta falló se dice, para
        // no firmar creyendo que el presupuesto está bien solo porque no
        // apareció nada. Lo demás —sin acceso al costo, etapa que no
        // compromete dinero— sigue sin mostrar nada, que es lo correcto.
        extra={
          impacto.length > 0 ? (
            <ImpactoPresupuesto filas={impacto} />
          ) : errorImpacto ? (
            <XStack
              gap="$2"
              alignItems="flex-start"
              padding="$3"
              borderRadius={10}
              backgroundColor="$backgroundSurface"
              borderLeftWidth={3}
              borderLeftColor="$warning"
            >
              <View marginTop={1}>
                <MessageSquare size={14} color={theme.warning?.val as string} />
              </View>
              <YStack flex={1} gap={2}>
                <Text fontSize={12} fontWeight="700" color="$warning">
                  No se pudo consultar el presupuesto
                </Text>
                <Text fontSize={11} color="$textSecondary">
                  {errorImpacto}
                </Text>
              </YStack>
            </XStack>
          ) : undefined
        }
      />

      <Modal
        visible={!!rechazando}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRechazando(null)}
      >
        <ScrollView
          style={styles.backdrop}
          contentContainerStyle={[styles.backdropContent, { paddingBottom: 24 + keyboardHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundElevated?.val as string }]}>
            <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
              <YStack flex={1}>
                <Text fontSize={17} fontWeight="700" color="$text" marginBottom="$1">
                  Motivo de rechazo
                </Text>
                <Text fontSize={13} color="$textMuted" marginBottom="$3">
                  {rechazando ? `Vas a rechazar ${resumenLote(rechazando)}. Indica por qué.` : ''}
                </Text>
              </YStack>

              <View
                padding="$2"
                marginTop={-8}
                marginRight={-8}
                borderRadius={999}
                pressStyle={{ opacity: 0.6 }}
                onPress={() => setRechazando(null)}
              >
                <X size={20} color={theme.textMuted?.val as string} />
              </View>
            </XStack>

            <AppInput
              label="Motivo"
              multiline
              minLines={4}
              placeholder="Ej: No corresponde al turno, horas no autorizadas..."
              value={motivo}
              onChangeText={(v: string) => { setMotivo(v); setMotivoError('') }}
              error={motivoError}
              style={{ height: 140 }}
              autoFocus
            />

            <XStack gap="$3" marginTop={16}>
              <Button
                flex={1} height={44} borderRadius={10}
                backgroundColor="$backgroundSurface"
                borderWidth={1} borderColor="$border"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setRechazando(null)}
              >
                <Text color="$text" fontWeight="600">Cancelar</Text>
              </Button>
              <Button
                flex={1} height={44} borderRadius={10}
                backgroundColor="$error"
                pressStyle={{ opacity: 0.8 }}
                disabled={enviando}
                onPress={confirmarRechazo}
              >
                <Text color="white" fontWeight="700">
                  {rechazando && rechazando.length > 1 ? `Rechazar ${rechazando.length}` : 'Rechazar'}
                </Text>
              </Button>
            </XStack>
          </View>
        </ScrollView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdropContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  modalCard: { borderRadius: 16, padding: 20 },
})

const fmtDinero = (valor: number | null | undefined): string =>
  `L ${Math.round(Number(valor ?? 0)).toLocaleString('es-HN')}`

/**
 * Lo que cuesta aprobar, por centro de costos y por empleado.
 *
 * Quien pone la última firma es el que compromete el dinero, y hasta ahora lo
 * hacía sin saber cuánto. El total va arriba y el desglose debajo, porque la
 * pregunta es primero "cuánto" y después "de quién".
 *
 * Solo llega acá con el acceso 'CostoHE': el filtro está en la consulta, así
 * que si el usuario no lo tiene el bloque ni se pide.
 */
/**
 * Lo único que hace falta para decidir si la firma cabe: el presupuesto, lo
 * que cuesta aprobar, y con qué queda.
 *
 * Antes esto traía además el gastado de la semana y una tarjeta por centro de
 * costos con su desglose por empleado. Todo eso es contabilidad, no decisión:
 * quien firma no está eligiendo entre áreas, está contestando "¿me alcanza?",
 * y para eso sobran tres números. Con seis, la respuesta había que armarla.
 *
 * El costo de aprobar sale de la fila TOTAL y no de sumar las de área: es el
 * mismo número, pero pedido una sola vez y ya recortado al alcance del usuario.
 *
 * Solo llega acá con el acceso 'CostoHE' y con la entidad gerencial: el filtro
 * está en la consulta, así que si no corresponde el bloque ni se pide.
 */
function ImpactoPresupuesto({ filas }: { filas: IOvertimeApprovalImpact[] }) {
  const total = filas.find(r => r.Es_Total)
  if (!total) return null

  const presupuesto = total.Presupuesto ?? 0
  const costo = total.Costo_Nuevo ?? 0
  const despues = presupuesto - (total.Consumido_Despues ?? 0)
  const excedido = despues < 0

  return (
    <YStack
      width="100%"
      backgroundColor={excedido ? '#FEF2F2' : '#F0FDF4'}
      borderWidth={1}
      borderColor={excedido ? '#FECACA' : '#BBF7D0'}
      borderRadius={10}
      padding="$3"
      gap="$2"
    >
      <Text fontSize={10} fontWeight="700" color={excedido ? '#991B1B' : '#166534'} letterSpacing={0.4}>
        TU PRESUPUESTO
      </Text>

      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <Text fontSize={12} color="$textSecondary">Asignado</Text>
        <Text fontSize={14} fontWeight="700" color="$text">{fmtDinero(presupuesto)}</Text>
      </XStack>

      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <Text fontSize={12} color="$textSecondary">Cuesta aprobar</Text>
        <Text fontSize={14} fontWeight="700" color="$text">{fmtDinero(costo)}</Text>
      </XStack>

      {/* El que importa, y por eso es el único grande y con línea propia. */}
      <XStack
        justifyContent="space-between" alignItems="center" gap="$2"
        borderTopWidth={1} borderTopColor={excedido ? '#FECACA' : '#BBF7D0'} paddingTop="$2"
      >
        <Text fontSize={12} fontWeight="700" color={excedido ? '#991B1B' : '#166534'}>
          {excedido ? 'Excedido en' : 'Te quedarían'}
        </Text>
        <Text fontSize={20} fontWeight="800" color={excedido ? '#991B1B' : '#166534'}>
          {fmtDinero(Math.abs(despues))}
        </Text>
      </XStack>
    </YStack>
  )
}

/**
 * Una solicitud completa, con sus empleados adentro.
 *
 * Cerrada dice lo que hace falta para decidir: cuántos empleados, cuántas
 * horas y cuánto cuesta aprobarla entera. Abierta muestra renglón por renglón
 * con su motivo, porque la decisión también puede ser parcial —aprobar a tres
 * de cinco— y para eso hay que poder mirar a cada uno.
 *
 * El costo del encabezado es el de lo que sigue PENDIENTE: al aprobar a uno,
 * su renglón sale de la bandeja y el total de la solicitud baja solo.
 */
function SolicitudGrupoCard({
  grupo,
  resaltada,
  abierta,
  veCosto,
  seleccionados,
  esFirmable,
  costoDe,
  onAlternar,
  onSeleccionar,
  onAprobar,
  onRechazar,
}: {
  grupo: GrupoSolicitud
  resaltada?: boolean
  abierta?: boolean
  /** El usuario tiene el acceso para ver montos. */
  veCosto: boolean
  /** Disponible del centro de costos, antes y después de firmar. Null si no se sabe. */
  seleccionados: Set<number>
  esFirmable: (d: IOvertimeRequestDetail) => boolean
  costoDe: (d: IOvertimeRequestDetail) => number | null
  onAlternar: () => void
  onSeleccionar: (id: number) => void
  onAprobar: (detalles: IOvertimeRequestDetail[]) => void
  onRechazar: (detalles: IOvertimeRequestDetail[]) => void
}) {
  const theme = useTheme()
  const firmables = grupo.detalles.filter(esFirmable)

  return (
    <Card
      backgroundColor={resaltada ? '$primaryOpacity2' : '$backgroundElevated'}
      borderRadius={14}
      padding="$3"
      borderWidth={resaltada ? 2 : 1}
      borderColor={resaltada ? '$primary' : '$border'}
    >
      <YStack gap="$2.5">

        {/* Encabezado: toda la tarjeta abre y cierra, no un ícono chiquito */}
        <XStack alignItems="flex-start" gap="$2" pressStyle={{ opacity: 0.7 }} onPress={onAlternar}>
          <YStack flex={1} gap="$1">
            <XStack alignItems="center" gap="$2">
              <Text fontSize={15} fontWeight="700" color="$text">
                {grupo.correlativo}
              </Text>
              <XStack
                paddingHorizontal={8}
                paddingVertical={3}
                borderRadius={20}
                alignItems="center"
                gap="$1"
                backgroundColor={resaltada ? 'transparent' : '$backgroundSurface'}
              >
                <CalendarDays size={11} color={theme.textMuted?.val as string} />
                <Text fontSize={11} fontWeight="600" color="$textSecondary">
                  {fmtFecha(grupo.fecha)}
                </Text>
              </XStack>
            </XStack>

            <XStack alignItems="center" gap="$2">
              <UserRound size={13} color={theme.textMuted?.val as string} />
              <Text fontSize={12} color="$textMuted" numberOfLines={1} flex={1}>
                Solicita{' '}
                <Text fontSize={12} fontWeight="600" color="$textSecondary">
                  {nombreConCodigo(grupo.solicitante) || '—'}
                </Text>
              </Text>
            </XStack>
          </YStack>

          <YStack alignItems="flex-end" gap={2}>
            <Text fontSize={18} fontWeight="800" color="$text">
              {fmtHoras(grupo.horas)}
            </Text>
            {veCosto && grupo.costo !== null && (
              <Text fontSize={13} fontWeight="700" color="$textSecondary">
                {fmtDinero(grupo.costo)}
              </Text>
            )}
            <Text fontSize={10} color="$textMuted">
              {grupo.detalles.length} empleado{grupo.detalles.length === 1 ? '' : 's'}
            </Text>
          </YStack>

          {/* Una flecha que gira y no dos glifos distintos: el giro se lee
              como "esto se abre". */}
          <View rotate={abierta ? '180deg' : '0deg'} paddingTop={2}>
            <ChevronDown size={18} color={theme.textMuted?.val as string} />
          </View>
        </XStack>

        {/* El comentario del encabezado, si lo tiene.
            El MOTIVO ya no va acá: es del detalle —en un mismo lote cada
            empleado se queda por una razón distinta— así que ponerlo en la
            tarjeta obligaba a elegir uno y mostrarlo como si fuera el de todos.
            Ahora va en el renglón de cada empleado, que es de quien es. */}
        {!!grupo.comentario && (
          <Text fontSize={11} color="$textMuted" numberOfLines={abierta ? 4 : 1}>
            {grupo.comentario}
          </Text>
        )}

        {/* Los empleados */}
        {abierta && (
          <YStack gap="$2" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
            {grupo.detalles.map(d => {
              const firmable = esFirmable(d)
              const costo = costoDe(d)

              return (
                <YStack
                  key={d.Id}
                  backgroundColor={seleccionados.has(d.Id) ? '$primaryOpacity2' : '$backgroundSurface'}
                  borderRadius={10}
                  padding="$2.5"
                  gap="$1.5"
                >
                  <XStack alignItems="flex-start" gap="$2">
                    {firmable && (
                      <View hitSlop={12} paddingTop={2} pressStyle={{ opacity: 0.6 }} onPress={() => onSeleccionar(d.Id)}>
                        {seleccionados.has(d.Id) ? (
                          <CheckSquare size={18} color={theme.primary?.val as string} />
                        ) : (
                          <Square size={18} color={theme.textMuted?.val as string} />
                        )}
                      </View>
                    )}

                    <YStack flex={1} gap={2}>
                      <Text fontSize={13} fontWeight="600" color="$text" numberOfLines={2}>
                        {nombreConCodigo(d.Employee_Name, d.Employee_Code)}
                      </Text>
                      <XStack alignItems="center" gap="$1.5">
                        <Clock size={11} color={theme.textMuted?.val as string} />
                        <Text fontSize={11} color="$textMuted">
                          {fmtHora(d.Start_Time)} — {fmtHora(d.End_Time)}
                        </Text>
                      </XStack>
                    </YStack>

                    <YStack alignItems="flex-end" gap={2}>
                      <Text fontSize={14} fontWeight="700" color="$text">
                        {fmtHoras(d.Total_Overtime_Hours)}
                      </Text>
                      {veCosto && costo !== null && (
                        <Text fontSize={11} fontWeight="600" color="$textMuted">
                          {fmtDinero(costo)}
                        </Text>
                      )}
                    </YStack>
                  </XStack>

                  {/* Por qué se queda ESTE empleado. Es del detalle: en un
                      mismo lote cada uno tiene su razón, y es justamente lo
                      que hay que leer antes de firmarle las horas. */}
                  {!!d.Category_Name && (
                    <XStack alignItems="flex-start" gap="$1.5">
                      <MessageSquare size={11} color={theme.textMuted?.val as string} style={{ marginTop: 2 }} />
                      <Text fontSize={11} color="$textSecondary" lineHeight={15} flex={1}>
                        {d.Category_Name}
                      </Text>
                    </XStack>
                  )}

                  {/* Centro de costos del empleado: es de donde sale el dinero,
                      así que es lo que dice si la firma cabe en el presupuesto. */}
                  {!!d.Centro_Costos && (
                    <XStack alignItems="center" gap="$1.5">
                      <Briefcase size={11} color={theme.textMuted?.val as string} />
                      <Text fontSize={11} color="$textMuted" numberOfLines={1} flex={1}>
                        {d.Centro_Costos}
                      </Text>
                    </XStack>
                  )}

                  {/* Decisión de este empleado: dos botones chicos al margen. Los
                      grandes con texto son los de la solicitud completa, al pie de
                      la tarjeta, que es la decisión frecuente; acá se firma la
                      excepción y no tiene por qué competir con ella. */}
                  {firmable && (
                    <XStack gap="$2" justifyContent="flex-end" paddingTop={2}>
                      <Button
                        height={28} width={42} borderRadius={8} padding={0}
                        backgroundColor="$backgroundElevated"
                        borderWidth={1} borderColor="$border"
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityLabel={`Rechazar horas de ${d.Employee_Name}`}
                        onPress={() => onRechazar([d])}
                      >
                        <X size={14} color={theme.error?.val as string} />
                      </Button>

                      <Button
                        height={28} width={42} borderRadius={8} padding={0}
                        backgroundColor="$success"
                        pressStyle={{ opacity: 0.85 }}
                        accessibilityLabel={`Aprobar horas de ${d.Employee_Name}`}
                        onPress={() => onAprobar([d])}
                      >
                        <Check size={14} color="white" />
                      </Button>
                    </XStack>
                  )}
                </YStack>
              )
            })}
          </YStack>
        )}

        {/* La solicitud entera. Se muestra abierta o cerrada: es la decisión
            más frecuente y no debería exigir desplegar primero. */}
        {firmables.length > 0 && (
          <XStack gap="$2" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
            <Button
              flex={1} height={40} borderRadius={10}
              backgroundColor="$backgroundSurface"
              borderWidth={1} borderColor="$border"
              pressStyle={{ opacity: 0.7 }}
              onPress={() => onRechazar(firmables)}
            >
              <XStack alignItems="center" gap="$2">
                <X size={15} color={theme.error?.val as string} />
                <Text fontSize={13} fontWeight="700" color="$error">
                  {firmables.length > 1 ? 'Rechazar todo' : 'Rechazar'}
                </Text>
              </XStack>
            </Button>

            <Button
              flex={1} height={40} borderRadius={10}
              backgroundColor="$success"
              pressStyle={{ opacity: 0.85 }}
              onPress={() => onAprobar(firmables)}
            >
              <XStack alignItems="center" gap="$2">
                <Check size={15} color="white" />
                <Text fontSize={13} fontWeight="700" color="white">
                  {firmables.length > 1 ? 'Aprobar todo' : 'Aprobar'}
                </Text>
              </XStack>
            </Button>
          </XStack>
        )}
      </YStack>
    </Card>
  )
}

function SolicitudCard({
  item,
  resaltada,
  seleccionada,
  firmable = true,
  onSeleccionar,
  onAprobar,
  onRechazar,
}: {
  item: IOvertimeRequestDetail
  /** Llegó por notificación: se marca un momento para poder ubicarla. */
  resaltada?: boolean
  /** Marcada para resolver en lote. */
  seleccionada?: boolean
  /** A esta entidad todavía le toca firmarla. */
  firmable?: boolean
  onSeleccionar: () => void
  onAprobar: () => void
  onRechazar: () => void
}) {
  const theme = useTheme()
  const conceptos = useMemo(() => parseConceptos(item.ConceptsJson), [item.ConceptsJson])

  return (
    <Card
      backgroundColor={resaltada || seleccionada ? '$primaryOpacity2' : '$backgroundElevated'}
      borderRadius={14}
      padding="$3"
      // Seleccionada y resaltada comparten el borde naranja: son dos formas de
      // "esta es la que importa ahora", y distinguirlas con dos colores
      // obligaría a recordar cuál es cuál.
      borderWidth={resaltada || seleccionada ? 2 : 1}
      borderColor={resaltada || seleccionada ? '$primary' : '$border'}
    >
      <YStack gap="$3">
        {/* Quién y cuándo */}
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
          {/* Casilla de selección. Solo en las que esta entidad puede firmar:
              marcar una que no se puede resolver solo llevaría a un lote que
              silenciosamente la deja fuera. */}
          {firmable && (
            <View
              paddingTop={2}
              paddingRight="$1"
              hitSlop={12}
              pressStyle={{ opacity: 0.6 }}
              onPress={onSeleccionar}
            >
              {seleccionada ? (
                <CheckSquare size={20} color={theme.primary?.val as string} />
              ) : (
                <Square size={20} color={theme.textMuted?.val as string} />
              )}
            </View>
          )}

          <YStack flex={1} gap="$1">
            <Text fontSize={15} fontWeight="700" color="$text" numberOfLines={2}>
              {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
            </Text>
            {!!item.Departamento && (
              <Text fontSize={12} color="$textMuted" numberOfLines={1}>
                {item.Departamento}
              </Text>
            )}
          </YStack>

          <XStack
            paddingHorizontal={8}
            paddingVertical={3}
            borderRadius={20}
            alignItems="center"
            gap="$1"
            // Transparente al resaltar, para que el naranja de la tarjeta no
            // quede recortado por los bloques grises de adentro.
            backgroundColor={resaltada ? 'transparent' : '$backgroundSurface'}
          >
            <CalendarDays size={11} color={theme.textMuted?.val as string} />
            <Text fontSize={11} fontWeight="600" color="$textSecondary">
              {fmtFecha(item.Date)}
            </Text>
          </XStack>
        </XStack>

        {/* Las horas: el dato que se está aprobando */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <XStack alignItems="center" gap="$2">
            <Clock size={15} color={theme.textMuted?.val as string} />
            <Text fontSize={14} fontWeight="600" color="$text">
              {fmtHora(item.Start_Time)} — {fmtHora(item.End_Time)}
            </Text>
          </XStack>
          <Text fontSize={20} fontWeight="800" color="$text">
            {fmtHoras(item.Total_Overtime_Hours)}
          </Text>
        </XStack>

        <DistribucionHoras conceptos={conceptos} />

        {/* Quién las pide y por qué */}
        <YStack gap="$1" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
          <XStack alignItems="center" gap="$2">
            <UserRound size={13} color={theme.textMuted?.val as string} />
            <Text fontSize={12} color="$textMuted" numberOfLines={1}>
              Solicita{' '}
              <Text fontSize={12} fontWeight="600" color="$textSecondary">
                {nombreConCodigo(item.Solicitante) || '—'}
              </Text>
            </Text>
          </XStack>

          <XStack justifyContent="space-between" alignItems="center" gap="$2">
            <Text fontSize={12} color="$textMuted" numberOfLines={1} flex={1}>
              {item.Category_Name || 'Sin motivo'}
            </Text>
            <Text fontSize={11} fontWeight="600" color="$textMuted">
              {item.Correlative}
            </Text>
          </XStack>
        </YStack>

        {/* La decisión. Va al pie de la tarjeta, después de todo lo que hay que
            leer para tomarla. */}
        <XStack gap="$2">
          <Button
            flex={1} height={40} borderRadius={10}
            backgroundColor="$backgroundSurface"
            borderWidth={1} borderColor="$border"
            pressStyle={{ opacity: 0.7 }}
            onPress={onRechazar}
          >
            <XStack alignItems="center" gap="$2">
              <X size={15} color={theme.error?.val as string} />
              <Text fontSize={13} fontWeight="700" color="$error">Rechazar</Text>
            </XStack>
          </Button>

          <Button
            flex={1} height={40} borderRadius={10}
            backgroundColor="$success"
            pressStyle={{ opacity: 0.85 }}
            onPress={onAprobar}
          >
            <XStack alignItems="center" gap="$2">
              <Check size={15} color="white" />
              <Text fontSize={13} fontWeight="700" color="white">Aprobar</Text>
            </XStack>
          </Button>
        </XStack>
      </YStack>
    </Card>
  )
}

/**
 * Un día del filtro. Solo se dibujan los que tienen algo pendiente, así que
 * todos llevan a una lista con contenido.
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
