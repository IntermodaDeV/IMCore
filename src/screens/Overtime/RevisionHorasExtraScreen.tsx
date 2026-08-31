import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import { CalendarDays, Check, CheckSquare, ChevronDown, MessageSquareWarning, Square, TrendingDown, TrendingUp, UserRound, X } from 'lucide-react-native'

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
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeReviewImpact,
  IOvertimeReviewToAuth,
  IUserEntity,
} from '../../api/modules/overtime/overtime.types'
import {
  DistribucionHoras,
  fmtFecha,
  fmtFechaHora,
  fmtHora,
  fmtHoras,
  nombreConCodigo,
  parseConceptos,
} from './Overtime.utils'

// Bandeja de autorización de la DIFERENCIA (segundo flujo).
//
// Cuando el reloj registra más horas de las que se habían solicitado, RRHH
// revisa. Si decide no resolverlo por su cuenta, manda la diferencia acá.
//
// Lo que se aprueba en esta pantalla NO son las horas de la solicitud —esas ya
// pasaron por el primer flujo— sino qué hacer con la diferencia:
//   · aprobar  → se le reconocen las horas del MARCAJE
//   · rechazar → se le pagan las horas SOLICITADAS
// Por eso la tarjeta muestra los dos grupos enfrentados: la decisión es elegir
// entre ellos, y sin ver ambos no hay con qué decidir.
//
// El dato vive en InterfazPayWeb, lo publica IMCoreProxy y lo reenvía IMCoreApi
// (api/Overtime/ReviewsToAuth) ya con JWT.

/** Verde si trabajó de más, rojo si de menos, ámbar si no hay marcaje. */
const colorDiferencia = (diff: number | null | undefined, theme: any): string => {
  if (diff === null || diff === undefined) return theme.warning?.val as string
  if (diff > 0) return theme.success?.val as string
  if (diff < 0) return theme.error?.val as string
  return theme.textSecondary?.val as string
}

/**
 * ¿Esta entidad todavía puede firmar esta revisión?
 *
 * La columna de estado de cada entidad viaja en DynamicColumns como
 * `Status_<NombreSinEspacios>`; solo 'Pendiente' habilita la decisión.
 *
 * La bandeja ya viene filtrada por el procedimiento, así que en condiciones
 * normales todo lo visible es firmable. La comprobación existe para el lote: si
 * algo se coló —una lista vieja en pantalla, algo resuelto desde otro lado— es
 * preferible dejarlo fuera del envío que mandarlo y que el SP rechace el lote
 * completo.
 */
const puedeAutorizar = (item: IOvertimeReviewToAuth, nombreEntidad: string): boolean => {
  if (!nombreEntidad) return true

  const columna = `Status_${nombreEntidad.replace(/\s+/g, '')}`
  const estado = String(item?.DynamicColumns?.[columna] ?? '').trim()

  return estado === '' || estado === 'Pendiente'
}

/**
 * Qué horas quedan aplicadas si se resuelve el lote de esta forma.
 *
 * Es el dato que hay que poder leer antes de firmar varias de golpe: aprobar
 * reconoce el MARCAJE y rechazar paga lo SOLICITADO, así que el total cambia
 * según la decisión.
 */
const horasDelLote = (revisiones: IOvertimeReviewToAuth[], aprobar: boolean): number =>
  revisiones.reduce(
    (acc, r) => acc + ((aprobar ? r.Worked_Overtime_Hours : r.Requested_Overtime_Hours) ?? 0),
    0,
  )

const etiquetaDiferencia = (diff: number | null | undefined) => {
  if (diff === null || diff === undefined) return 'Sin marcaje'
  if (diff === 0) return '0h'
  return `${diff > 0 ? '+' : '-'}${fmtHoras(Math.abs(diff))}`
}

/**
 * Una solicitud con las diferencias que le quedan pendientes.
 *
 * La bandeja llega revisión por revisión —un empleado cada una— porque eso es
 * lo que se firma. Para la última entidad eso no alcanza: lo que decide es
 * cuánto se mueve LA SOLICITUD, y con los empleados sueltos hay que sumarlos
 * de cabeza.
 */
interface GrupoRevision {
  requestId: number
  correlativo: string
  fecha: string | null
  solicitante: string
  revisiones: IOvertimeReviewToAuth[]
  horasSolicitadas: number
  horasMarcaje: number
  /** Lo que esas horas ya cuestan, y lo que costarían al reconocer el marcaje. */
  costoActual: number | null
  costoSiAprueba: number | null
}

export default function RevisionHorasExtraScreen() {
  const { defaultCompany } = useAuth()
  const loader = useLoader()
  const theme = useTheme()
  const { showToast } = useShowToast()
  // El modal de rechazo centra su tarjeta; con el teclado abierto queda
  // debajo. Este alto la empuja hacia arriba, igual que en Aprobación de Gastos.
  const keyboardHeight = useKeyboardHeight()

  const [entidades, setEntidades] = useState<IUserEntity[]>([])
  const [entidad, setEntidad] = useState<string>('')
  const [data, setData] = useState<IOvertimeReviewToAuth[]>([])
  const [filtered, setFiltered] = useState<IOvertimeReviewToAuth[]>([])
  const [loading, setLoading] = useState(false)
  // Aparte de `loading`: el gesto de recargar no debe reemplazar la lista por
  // el esqueleto.
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  // Decisión en curso. Aprobar se confirma y ya; rechazar pide el motivo, que
  // el procedimiento exige.
  // Aprobar y rechazar trabajan sobre una LISTA: una tarjeta suelta es un lote
  // de uno. Así el confirm, el envío y el mensaje son un solo camino en vez de
  // dos que hay que mantener parejos.
  const [aprobando, setAprobando] = useState<IOvertimeReviewToAuth[] | null>(null)

  // Impacto de la decisión sobre el presupuesto. Solo llega con contenido en
  // la última etapa del flujo y con el acceso 'CostoHE'.
  const [impacto, setImpacto] = useState<IOvertimeReviewImpact[]>([])

  // Impacto de TODA la bandeja, no del lote que se está por firmar. Es lo que
  // permite poner el costo en cada tarjeta antes de abrir nada.
  const [impactoBandeja, setImpactoBandeja] = useState<IOvertimeReviewImpact[]>([])
  // Solicitudes desplegadas. Arrancan cerradas: la tarjeta cerrada ya dice
  // cuántos empleados, cuántas horas y cuánto se mueve, que es con lo que se
  // decide; el detalle es para cuando algo no cuadra.
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set())
  const [rechazando, setRechazando] = useState<IOvertimeReviewToAuth[] | null>(null)

  // Ids marcados para resolver en lote.
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const companyCode = defaultCompany?.Code ?? ''

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Revisión de Horas Extra
      </Text>
    ),
    right: <NotificationBell size={18} />,
  })

  // Las entidades de este flujo son propias: no son las mismas del proceso de
  // solicitudes, aunque las firme la misma persona.
  const loadEntidades = useCallback(async () => {
    if (!companyCode) return
    try {
      const res = await overtimeService.getReviewEntities(companyCode)
      const lista = res.Success ? res.Data ?? [] : []
      setEntidades(lista)

      setEntidad(prev => {
        const sigueValida = prev && lista.some(e => String(e.Id) === prev)
        return sigueValida ? prev : lista.length ? String(lista[0].Id) : ''
      })
    } catch (err) {
      setError(handleError(err))
    }
  }, [companyCode])

  /**
   * Trae la bandeja de la entidad activa.
   *
   * `silent` es el modo del gesto de recargar: sin loader a pantalla completa
   * ni esqueleto, solo el indicador propio de la lista.
   */
  /**
   * Costo de cada revisión de la bandeja, para poder mostrarlo en la lista.
   *
   * El procedimiento devuelve el desglose POR REVISIÓN dentro de cada área, así
   * que acá no hay que repartir nada: cada renglón trae su propio costo.
   *
   * De mejor esfuerzo: si falla, las tarjetas salen sin monto y todo lo demás
   * funciona igual.
   */
  const pedirImpactoBandeja = useCallback(
    async (filas: IOvertimeReviewToAuth[]) => {
      if (!companyCode || !entidad || filas.length === 0) {
        setImpactoBandeja([])
        return
      }

      try {
        const res = await overtimeService.getReviewImpact(
          companyCode,
          Number(entidad),
          filas.map(r => r.Id),
        )
        setImpactoBandeja(res?.Success && res.Data ? res.Data : [])
      } catch {
        setImpactoBandeja([])
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

      const res = await overtimeService.getReviewsToAuth(companyCode, Number(entidad))

      // Sin esto, un error del backend (Success=false) se vería como bandeja vacía.
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudieron cargar las revisiones')

      const filas = res.Data ?? []
      setData(filas)
      setFiltered(filas)
      pedirImpactoBandeja(filas)

      // Lo que ya no está en la bandeja no se puede seguir teniendo marcado.
      setSeleccionados(prev => {
        const vigentes = new Set(filas.map(r => r.Id))
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
    // `loader` queda fuera a propósito: el provider no memoiza su valor, así que
    // incluirlo cambiaría la identidad de loadData en cada render y el
    // useFocusEffect volvería a consultar sin parar.
  }, [companyCode, entidad, pedirImpactoBandeja])

  /**
   * Registra la decisión sobre la diferencia.
   *
   * Al resolverse, la revisión sale de la bandeja —el backend solo devuelve lo
   * pendiente— así que se quita de la lista en el acto en lugar de recargar
   * todo: la respuesta es inmediata y no se pierde la posición del scroll.
   */
  const enviarDecision = useCallback(
    async (revisiones: IOvertimeReviewToAuth[], aprobar: boolean, comentario: string) => {
      if (revisiones.length === 0) return

      try {
        setEnviando(true)
        loader.show()

        const ids = revisiones.map(r => r.Id)

        // Una sola llamada con toda la lista: el procedimiento la resuelve en
        // una transacción. De a una dejaría lotes a medio aplicar si algo falla
        // en el camino.
        const res = await overtimeService.authorizeReview(companyCode, {
          SystemEntities_Id: Number(entidad),
          Auth: aprobar,
          Comment: comentario,
          Reviews: ids,
        })

        if (!res.Success) {
          showToast('error', 'Error', res.ErrorMessage || 'No se pudo registrar la decisión', 5000, 'top')
          return
        }

        const resueltas = new Set(ids)
        const quitar = (lista: IOvertimeReviewToAuth[]) => lista.filter(r => !resueltas.has(r.Id))
        setData(quitar)
        setFiltered(quitar)

        setSeleccionados(prev => new Set([...prev].filter(id => !resueltas.has(id))))
        setAprobando(null)
        setRechazando(null)
        setMotivo('')

        showToast(
          'success',
          aprobar ? 'Diferencia aprobada' : 'Diferencia rechazada',
          aprobar
            ? `Se reconocen ${fmtHoras(horasDelLote(revisiones, true))} del marcaje`
            : `Se pagan ${fmtHoras(horasDelLote(revisiones, false))} solicitadas`,
          3500,
          'top',
        )
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 5000, 'top')
      } finally {
        setEnviando(false)
        loader.hide()
      }
    },
    [companyCode, entidad, loader, showToast],
  )

  /**
   * Pide el impacto de resolver estas diferencias.
   *
   * De mejor esfuerzo: si falla, el confirm sale sin el bloque. Es información
   * de apoyo para decidir, no un requisito para poder firmar.
   */
  const pedirImpacto = useCallback(
    async (revisiones: IOvertimeReviewToAuth[]) => {
      setImpacto([])
      if (!companyCode || !entidad || revisiones.length === 0) return

      try {
        const res = await overtimeService.getReviewImpact(
          companyCode,
          Number(entidad),
          revisiones.map(r => r.Id),
        )

        // Las dos condiciones: que sea la última firma —antes no se compromete
        // nada— y que el usuario pueda ver montos.
        const filas = res?.Success && res.Data
          ? res.Data.filter(r => r.Es_Ultima_Entidad && r.Ve_Costo)
          : []
        setImpacto(filas)
      } catch {
        setImpacto([])
      }
    },
    [companyCode, entidad],
  )

  /** Abrir el confirm: se muestra ya y el impacto llega después. */
  const abrirAprobacion = useCallback(
    (revisiones: IOvertimeReviewToAuth[]) => {
      setAprobando(revisiones)
      pedirImpacto(revisiones)
    },
    [pedirImpacto],
  )

  const confirmarRechazo = useCallback(() => {
    if (!rechazando || rechazando.length === 0) return

    // El SP lo exige y pide al menos 10 caracteres: mejor decirlo acá que dejar
    // que el error viaje hasta la base y vuelva.
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

  const opcionesEntidad = useMemo(
    () => entidades.map(e => ({ label: e.Name, value: String(e.Id) })),
    [entidades],
  )

  // El nombre de la entidad activa arma el nombre de su columna de estado, y
  // con eso se sabe si le toca firmar cada renglón.
  const nombreEntidad = useMemo(
    () => entidades.find(e => String(e.Id) === entidad)?.Name ?? '',
    [entidades, entidad],
  )

  /**
   * Conteo del pie de los filtros.
   *
   * Se cuenta sobre lo FILTRADO, que es lo que se está viendo, pero cuando el
   * buscador recortó la lista se dice también el total: si no, parecería que la
   * bandeja tiene menos de lo que tiene.
   */
  const resumen = useMemo(() => {
    const empleados = new Set(filtered.map(r => r.Employee_Code)).size

    const texto =
      filtered.length === data.length
        ? `${data.length} registro${data.length === 1 ? '' : 's'} · ${empleados} empleado${empleados === 1 ? '' : 's'}`
        : `${filtered.length} de ${data.length} registros`

    return { empleados, texto }
  }, [filtered, data])

  /**
   * ¿Le toca la última firma?
   *
   * Es la que compromete el dinero, y donde agrupar por solicitud cambia algo:
   * las etapas anteriores ven una cola corta de su propia gente. Lo resuelve el
   * procedimiento del impacto, así que no hace falta reconocer a la entidad por
   * su nombre —que cambiaría con cualquier renombre en AdmSys.
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

  /**
   * Costo de cada revisión, por Id.
   *
   * Sale del desglose que trae cada área: no hay que repartir nada porque el
   * procedimiento ya lo devuelve renglón por renglón.
   */
  const costoPorRevision = useMemo(() => {
    const mapa = new Map<number, { actual: number; siAprueba: number }>()

    impactoBandeja.forEach(area => {
      let filas: any[] = []
      try {
        const parsed = JSON.parse(area.Revisiones_Json ?? '[]')
        filas = Array.isArray(parsed) ? parsed : []
      } catch {
        filas = []
      }

      filas.forEach(f => {
        const id = Number(f?.reviews_Id)
        if (!id) return
        mapa.set(id, {
          actual: Number(f?.costo_Actual ?? 0),
          siAprueba: Number(f?.costo_Si_Aprueba ?? 0),
        })
      })
    })

    return mapa
  }, [impactoBandeja])

  /** La bandeja vista por solicitud, en el orden en que ya venía. */
  const grupos = useMemo<GrupoRevision[]>(() => {
    const porId = new Map<number, GrupoRevision>()

    filtered.forEach(r => {
      let g = porId.get(r.Request_Id)

      if (!g) {
        g = {
          requestId: r.Request_Id,
          correlativo: r.Correlative,
          fecha: r.Date,
          solicitante: r.Solicitante || r.Sent_To_Review_By,
          revisiones: [],
          horasSolicitadas: 0,
          horasMarcaje: 0,
          costoActual: null,
          costoSiAprueba: null,
        }
        porId.set(r.Request_Id, g)
      }

      g.revisiones.push(r)
      g.horasSolicitadas += r.Requested_Overtime_Hours ?? 0
      g.horasMarcaje += r.Worked_Overtime_Hours ?? 0

      const c = costoPorRevision.get(r.Id)
      if (c) {
        g.costoActual = (g.costoActual ?? 0) + c.actual
        g.costoSiAprueba = (g.costoSiAprueba ?? 0) + c.siAprueba
      }
    })

    return [...porId.values()]
  }, [filtered, costoPorRevision])

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
   * Se recorre `data` y no lo filtrado: si el buscador dejó una tarjeta fuera
   * de la vista, sigue contando —está marcada— pero se resuelve contra la
   * lista real de la bandeja.
   */
  const seleccionValida = useMemo(
    () => data.filter(r => seleccionados.has(r.Id) && puedeAutorizar(r, nombreEntidad)),
    [data, seleccionados, nombreEntidad],
  )

  // Marcadas que quedan fuera del envío, para que el conteo no sorprenda.
  const bloqueadas = seleccionados.size - seleccionValida.length

  const seleccionarTodas = useCallback(() => {
    // Solo las visibles y firmables: "todas" sobre una lista filtrada tiene que
    // significar las que se están viendo.
    const marcables = filtered.filter(r => puedeAutorizar(r, nombreEntidad)).map(r => r.Id)
    const todasMarcadas = marcables.length > 0 && marcables.every(id => seleccionados.has(id))

    setSeleccionados(prev => {
      const copia = new Set(prev)
      marcables.forEach(id => (todasMarcadas ? copia.delete(id) : copia.add(id)))
      return copia
    })
  }, [filtered, nombreEntidad, seleccionados])

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  const sinEntidades = !!companyCode && entidades.length === 0

  return (
    // Fragmento en la raíz: el Modal y el AlertDialog van FUERA del View de
    // Tamagui. Anidados dentro, el overlay del diálogo queda por debajo del
    // contenedor y los toques no llegan. Es la misma disposición que usan
    // DetalleGastoScreen y PaseAprobacionesScreen, que sí responden.
    <>
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$2">
        {/* Se muestra aunque haya una sola entidad. Escondiéndolo, quien
            tiene una sola cree que la pantalla no le deja cambiarla; así al
            menos ve cuál es y que no hay otra. */}
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
          searchKeys={['Employee_Name', 'Employee_Code', 'Correlative', 'Sent_To_Review_By', 'Comment']}
          onResults={setFiltered}
          placeholder="Buscar por empleado, correlativo o quien la envió"
        />

        {/* Barra de lote. Muestra las horas que quedarían aplicadas CON CADA
            decisión, no una sola cifra: acá aprobar y rechazar no son sí o no,
            son dos totales distintos —el marcaje o lo solicitado— y sin ver
            ambos no hay con qué decidir. */}
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
                {fmtHoras(horasDelLote(seleccionValida, false))} →{' '}
                {fmtHoras(horasDelLote(seleccionValida, true))}
                {bloqueadas > 0 ? ` · ${bloqueadas} sin acción` : ''}
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
              onPress={() => setAprobando(seleccionValida)}
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
            {filtered.length > 0 ? (
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

      {/* La lista se monta siempre, incluso vacía, para que el gesto de
          recargar exista también cuando no hay nada pendiente. */}
      <FlatList
        // Para la última entidad la unidad de decisión es la SOLICITUD; para
        // las anteriores sigue siendo la diferencia de su gente.
        data={(esUltimaEntidad ? grupos : filtered) as any[]}
        keyExtractor={(item: any) => String(esUltimaEntidad ? item.requestId : item.Id)}
        contentContainerStyle={
          filtered.length === 0
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
              message="No participás en el flujo de revisión de horas extra de esta empresa."
            />
          ) : (
            <EmptyState
              title="Nada pendiente"
              message="No hay diferencias de horas esperando tu autorización."
            />
          )
        }
        renderItem={({ item }: any) =>
          esUltimaEntidad ? (
            <RevisionGrupoCard
              grupo={item}
              abierta={expandidas.has(item.requestId)}
              veCosto={veCosto}
              seleccionados={seleccionados}
              esFirmable={r => puedeAutorizar(r, nombreEntidad)}
              costoDe={r => costoPorRevision.get(r.Id) ?? null}
              onAlternar={() => alternarGrupo(item.requestId)}
              onSeleccionar={id => alternarSeleccion(id)}
              onAprobar={revisiones => abrirAprobacion(revisiones)}
              onRechazar={revisiones => {
                setMotivo('')
                setMotivoError('')
                setRechazando(revisiones)
              }}
            />
          ) : (
            <RevisionCard
              item={item}
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

      {/* Aprobar: el confirm dice explícitamente qué horas quedan, porque es lo
          que cambia y no se deduce del botón. */}
      <ConfirmDialog
        open={!!aprobando}
        onOpenChange={abierto => { if (!abierto) { setAprobando(null); setImpacto([]) } }}
        title="Aprobar diferencia"
        message={
          !aprobando
            ? ''
            : aprobando.length === 1
              // Sin marcaje, aprobar significa reconocer CERO. Decir 'se le
              // reconocerán — del marcaje' dejaba la consecuencia a la
              // imaginación, y es la que importa: se le quitan las horas.
              ? aprobando[0].Worked_Overtime_Hours === null ||
                aprobando[0].Worked_Overtime_Hours === undefined
                ? `${nombreConCodigo(aprobando[0].Employee_Name, aprobando[0].Employee_Code)} no marcó, ` +
                  `así que no se le reconocerá ninguna hora extra: pierde las ` +
                  `${fmtHoras(aprobando[0].Requested_Overtime_Hours)} solicitadas.`
                : `Se le reconocerán ${fmtHoras(aprobando[0].Worked_Overtime_Hours)} del marcaje a ` +
                  `${nombreConCodigo(aprobando[0].Employee_Name, aprobando[0].Employee_Code)}, ` +
                  `en lugar de las ${fmtHoras(aprobando[0].Requested_Overtime_Hours)} solicitadas.`
              : `A ${aprobando.length} empleados se les reconocerán las horas del MARCAJE: ` +
                `${fmtHoras(horasDelLote(aprobando, true))} en lugar de las ` +
                `${fmtHoras(horasDelLote(aprobando, false))} solicitadas.`
        }
        confirmLabel={aprobando && aprobando.length > 1 ? `Aprobar ${aprobando.length}` : 'Aprobar'}
        confirmColor="#22C55E"
        loading={enviando}
        onConfirm={() => aprobando && enviarDecision(aprobando, true, '')}
        onCancel={() => { setAprobando(null); setImpacto([]) }}
        extra={impacto.length > 0 ? <ImpactoRevision filas={impacto} aprueba /> : undefined}
      />

      {/* Rechazar: el motivo es obligatorio, así que no alcanza un confirm */}
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
                  Rechazar diferencia
                </Text>
                <Text fontSize={13} color="$textMuted" marginBottom="$3">
                  {rechazando
                    ? rechazando.length === 1
                      ? `Se le pagarán las ${fmtHoras(rechazando[0].Requested_Overtime_Hours)} solicitadas. Indica por qué.`
                      : `A ${rechazando.length} empleados se les pagarán solo las horas SOLICITADAS: ` +
                        `${fmtHoras(horasDelLote(rechazando, false))} en lugar de las ` +
                        `${fmtHoras(horasDelLote(rechazando, true))} del marcaje. Indica por qué.`
                    : ''}
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
              placeholder="Ej: El marcaje no corresponde a trabajo autorizado..."
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

/**
 * Uno de los dos grupos de horas que se están comparando.
 *
 * Van con el mismo formato y el mismo alto para que se puedan leer en paralelo:
 * la decisión es elegir entre ellos, y cualquier asimetría visual empuja a
 * mirar uno más que el otro.
 */
function GrupoHoras({
  titulo,
  color,
  inicio,
  fin,
  total,
  conceptos,
  sinDato,
}: {
  titulo: string
  color: string
  inicio: string | null
  fin: string | null
  total: number | null
  conceptos: ReturnType<typeof parseConceptos>
  sinDato?: boolean
}) {
  return (
    <YStack
      flex={1}
      gap="$2"
      padding="$2.5"
      borderRadius={10}
      borderWidth={1}
      borderColor="$border"
      style={{ backgroundColor: `${color}14` }}
    >
      <Text fontSize={10} fontWeight="800" letterSpacing={0.4} style={{ color }}>
        {titulo.toUpperCase()}
      </Text>

      <Text fontSize={13} fontWeight="600" color="$text">
        {sinDato ? 'Sin marcaje' : `${fmtHora(inicio)} — ${fmtHora(fin)}`}
      </Text>

      <Text fontSize={18} fontWeight="800" color="$text">
        {sinDato ? '—' : fmtHoras(total)}
      </Text>

      <DistribucionHoras conceptos={conceptos} compacta />
    </YStack>
  )
}

/**
 * Una solicitud con las diferencias que le quedan pendientes.
 *
 * Cerrada dice lo que hace falta para decidir: cuántos empleados, cómo se
 * mueven las horas y —con el acceso— cuánto se mueve la plata. Abierta muestra
 * renglón por renglón, porque la decisión también puede ser parcial y para eso
 * hay que poder mirar a cada uno.
 *
 * El salto en dinero se muestra con su signo: reconocer el marcaje puede
 * costar más o menos que lo solicitado, y esa dirección es la mitad de la
 * decisión.
 */
function RevisionGrupoCard({
  grupo,
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
  grupo: GrupoRevision
  abierta?: boolean
  /** El usuario tiene el acceso para ver montos. */
  veCosto: boolean
  seleccionados: Set<number>
  esFirmable: (r: IOvertimeReviewToAuth) => boolean
  costoDe: (r: IOvertimeReviewToAuth) => { actual: number; siAprueba: number } | null
  onAlternar: () => void
  onSeleccionar: (id: number) => void
  onAprobar: (revisiones: IOvertimeReviewToAuth[]) => void
  onRechazar: (revisiones: IOvertimeReviewToAuth[]) => void
}) {
  const theme = useTheme()
  const firmables = grupo.revisiones.filter(esFirmable)

  const delta = (grupo.costoSiAprueba ?? 0) - (grupo.costoActual ?? 0)
  const hayCosto = veCosto && grupo.costoActual !== null

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={14}
      padding="$3"
      borderWidth={1}
      borderColor="$border"
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
                backgroundColor="$backgroundSurface"
              >
                <CalendarDays size={11} color={theme.textMuted?.val as string} />
                <Text fontSize={11} fontWeight="600" color="$textSecondary">
                  {fmtFecha(grupo.fecha)}
                </Text>
              </XStack>
            </XStack>
          </YStack>

          <YStack alignItems="flex-end" gap={2}>
            {/* De dónde a dónde se mueven las horas: es la decisión entera */}
            <Text fontSize={14} fontWeight="800" color="$text">
              {fmtHoras(grupo.horasSolicitadas)} → {fmtHoras(grupo.horasMarcaje)}
            </Text>
            {hayCosto && (
              <Text
                fontSize={13}
                fontWeight="700"
                color={Math.abs(delta) < 0.005 ? '$textMuted' : delta > 0 ? '#B45309' : '#166534'}
              >
                {Math.abs(delta) < 0.005
                  ? 'sin cambio'
                  : `${delta > 0 ? '+' : '−'}${fmtDinero(Math.abs(delta))}`}
              </Text>
            )}
            <Text fontSize={10} color="$textMuted">
              {grupo.revisiones.length} empleado{grupo.revisiones.length === 1 ? '' : 's'}
            </Text>
          </YStack>

          <View rotate={abierta ? '180deg' : '0deg'} paddingTop={2}>
            <ChevronDown size={18} color={theme.textMuted?.val as string} />
          </View>
        </XStack>

        {/* Los empleados */}
        {abierta && (
          <YStack gap="$2" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
            {grupo.revisiones.map(r => {
              const firmable = esFirmable(r)
              const costo = costoDe(r)
              const saltoFila = costo ? costo.siAprueba - costo.actual : 0

              return (
                <YStack
                  key={r.Id}
                  backgroundColor={seleccionados.has(r.Id) ? '$primaryOpacity2' : '$backgroundSurface'}
                  borderRadius={10}
                  padding="$2.5"
                  gap="$1.5"
                >
                  <XStack alignItems="flex-start" gap="$2">
                    {firmable && (
                      <View hitSlop={12} paddingTop={2} pressStyle={{ opacity: 0.6 }} onPress={() => onSeleccionar(r.Id)}>
                        {seleccionados.has(r.Id) ? (
                          <CheckSquare size={18} color={theme.primary?.val as string} />
                        ) : (
                          <Square size={18} color={theme.textMuted?.val as string} />
                        )}
                      </View>
                    )}

                    <YStack flex={1} gap={2}>
                      <Text fontSize={13} fontWeight="600" color="$text" numberOfLines={2}>
                        {nombreConCodigo(r.Employee_Name, r.Employee_Code)}
                      </Text>
                      <Text fontSize={11} color="$textMuted">
                        {fmtHoras(r.Requested_Overtime_Hours)} solicitadas · {fmtHoras(r.Worked_Overtime_Hours)} de marcaje
                      </Text>
                    </YStack>

                    <YStack alignItems="flex-end" gap={2}>
                      <Text fontSize={14} fontWeight="700" color="$text">
                        {fmtHoras(r.Worked_Overtime_Hours)}
                      </Text>
                      {veCosto && costo && (
                        <Text
                          fontSize={11}
                          fontWeight="600"
                          color={Math.abs(saltoFila) < 0.005 ? '$textMuted' : saltoFila > 0 ? '#B45309' : '#166534'}
                        >
                          {Math.abs(saltoFila) < 0.005
                            ? 'sin cambio'
                            : `${saltoFila > 0 ? '+' : '−'}${fmtDinero(Math.abs(saltoFila))}`}
                        </Text>
                      )}
                    </YStack>
                  </XStack>

                  {/* Los DOS montos, no solo el salto: uno dice lo que ya se
                      había aprobado y el otro lo que pide la revisión. Con el
                      salto solo no se sabe sobre qué base está calculado, y es
                      justamente lo que hay que poder auditar. */}
                  {veCosto && costo && (
                    <XStack gap="$2">
                      <YStack flex={1} gap={1}>
                        <Text fontSize={9} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                          YA APROBADO
                        </Text>
                        <Text fontSize={12} fontWeight="700" color="$textSecondary">
                          {fmtDinero(costo.actual)}
                        </Text>
                      </YStack>

                      <YStack flex={1} gap={1}>
                        <Text fontSize={9} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                          PIDE LA REVISIÓN
                        </Text>
                        <Text fontSize={12} fontWeight="800" color="$text">
                          {fmtDinero(costo.siAprueba)}
                        </Text>
                      </YStack>
                    </XStack>
                  )}

                  {/* Por qué la mandaron a revisar */}
                  {!!r.Comment && (
                    <Text fontSize={11} color="$textSecondary" lineHeight={15}>
                      {r.Comment}
                    </Text>
                  )}

                  {/* Chicos y alineados a la derecha, no dos barras a lo
                      ancho: la decisión de la solicitud entera vive al pie de
                      la tarjeta, y estos son la excepción —resolver a uno
                      aparte—. Con el mismo peso visual competían con ella. */}
                  {firmable && (
                    <XStack gap="$2" justifyContent="flex-end" paddingTop={2}>
                      <Button
                        height={28} borderRadius={8} paddingHorizontal="$2.5"
                        backgroundColor="$backgroundElevated"
                        borderWidth={1} borderColor="$border"
                        pressStyle={{ opacity: 0.7 }}
                        onPress={() => onRechazar([r])}
                      >
                        <XStack alignItems="center" gap="$1">
                          <X size={12} color={theme.error?.val as string} />
                          <Text fontSize={11} fontWeight="700" color="$error">Rechazar</Text>
                        </XStack>
                      </Button>

                      <Button
                        height={28} borderRadius={8} paddingHorizontal="$2.5"
                        backgroundColor="$success"
                        pressStyle={{ opacity: 0.85 }}
                        onPress={() => onAprobar([r])}
                      >
                        <XStack alignItems="center" gap="$1">
                          <Check size={12} color="white" />
                          <Text fontSize={11} fontWeight="700" color="white">Aprobar</Text>
                        </XStack>
                      </Button>
                    </XStack>
                  )}
                </YStack>
              )
            })}
          </YStack>
        )}

        {/* La solicitud entera. Visible abierta o cerrada: es la decisión más
            frecuente y no debería exigir desplegar primero. */}
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

function RevisionCard({
  item,
  seleccionada,
  firmable = true,
  onSeleccionar,
  onAprobar,
  onRechazar,
}: {
  item: IOvertimeReviewToAuth
  /** Marcada para resolver en lote. */
  seleccionada?: boolean
  /** A esta entidad todavía le toca firmarla. */
  firmable?: boolean
  onSeleccionar: () => void
  onAprobar: () => void
  onRechazar: () => void
}) {
  const theme = useTheme()

  const solicitados = useMemo(
    () => parseConceptos(item.Requested_Concepts_Json),
    [item.Requested_Concepts_Json],
  )
  const trabajados = useMemo(
    () => parseConceptos(item.Worked_Concepts_Json),
    [item.Worked_Concepts_Json],
  )

  const sinMarcaje = item.Worked_Overtime_Hours === null || item.Worked_Overtime_Hours === undefined
  const colorDiff = colorDiferencia(item.Hours_Difference, theme)
  const IconoDiff = (item.Hours_Difference ?? 0) < 0 ? TrendingDown : TrendingUp

  return (
    <Card
      backgroundColor={seleccionada ? '$primaryOpacity2' : '$backgroundElevated'}
      borderRadius={14}
      padding="$3"
      borderWidth={seleccionada ? 2 : 1}
      borderColor={seleccionada ? '$primary' : '$border'}
    >
      <YStack gap="$3">
        {/* Quién y cuándo */}
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
          {/* Casilla de selección. Solo en las que esta entidad puede firmar:
              marcar una que después se descarta en silencio es peor que no
              poder marcarla. */}
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
            backgroundColor="$backgroundSurface"
          >
            <CalendarDays size={11} color={theme.textMuted?.val as string} />
            <Text fontSize={11} fontWeight="600" color="$textSecondary">
              {fmtFecha(item.Date)}
            </Text>
          </XStack>
        </XStack>

        {/* Los dos referentes de la decisión, enfrentados */}
        <XStack gap="$2" alignItems="stretch">
          <GrupoHoras
            titulo="Solicitado"
            color="#3B82F6"
            inicio={item.Start_Time}
            fin={item.End_Time}
            total={item.Requested_Overtime_Hours}
            conceptos={solicitados}
          />
          <GrupoHoras
            titulo="Marcaje"
            color="#F59E0B"
            inicio={item.Clock_In}
            fin={item.Clock_Out}
            total={item.Worked_Overtime_Hours}
            conceptos={trabajados}
            sinDato={sinMarcaje}
          />
        </XStack>

        {/* La diferencia: el número sobre el que se decide */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius={10}
          backgroundColor="$backgroundSurface"
        >
          <XStack alignItems="center" gap="$2">
            <IconoDiff size={15} color={colorDiff} />
            <Text fontSize={12} fontWeight="700" color="$textSecondary">
              Diferencia
            </Text>
          </XStack>
          <Text fontSize={18} fontWeight="800" style={{ color: colorDiff }}>
            {etiquetaDiferencia(item.Hours_Difference)}
          </Text>
        </XStack>

        {/* Por qué llegó acá: sin esto la decisión se toma a ciegas */}
        <YStack gap="$1" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
          <XStack alignItems="center" gap="$2">
            <MessageSquareWarning size={13} color={theme.textMuted?.val as string} />
            <Text fontSize={11} color="$textMuted" flex={1} numberOfLines={1}>
              {nombreConCodigo(item.Sent_To_Review_By)} · {fmtFechaHora(item.Sent_To_Review_Date)}
            </Text>
          </XStack>

          <Text fontSize={12} color="$textSecondary">
            {item.Comment || 'Sin justificación registrada.'}
          </Text>

          <XStack justifyContent="space-between" alignItems="center" gap="$2" marginTop="$1">
            <Text fontSize={11} color="$textMuted" numberOfLines={1} flex={1}>
              {item.Category_Name || 'Sin motivo'}
            </Text>
            <Text fontSize={11} fontWeight="600" color="$textMuted">
              {item.Correlative}
            </Text>
          </XStack>
        </YStack>

        {/* La decisión, al pie: después de todo lo que hay que leer para tomarla */}
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
 * Qué le pasa al presupuesto según lo que se firme.
 *
 * Mientras la revisión está abierta el presupuesto YA tiene contadas las horas
 * solicitadas: el detalle se costea por lo pedido hasta que alguien resuelve la
 * diferencia. Por eso rechazar no lo mueve —no es que no cueste, es que ya está
 * contado— y aprobar lo mueve en (marcaje − solicitado).
 *
 * Se muestran los dos números aunque solo uno vaya a pasar: el salto entre
 * ellos ES la decisión, y con uno solo no hay contra qué compararlo.
 */
function ImpactoRevision({ filas, aprueba }: { filas: IOvertimeReviewImpact[]; aprueba: boolean }) {
  const total = filas.find(r => r.Es_Total)
  const areas = filas.filter(r => !r.Es_Total)

  return (
    <YStack gap="$2" width="100%">
      {total && <TotalRevision fila={total} aprueba={aprueba} />}

      {areas.map(r => {
        const actual = r.Costo_Actual ?? 0
        const siAprueba = r.Costo_Si_Aprueba ?? 0
        const delta = siAprueba - actual

        return (
          <YStack
            key={r.Area_Codigo}
            width="100%"
            backgroundColor="$backgroundSurface"
            borderRadius={10}
            padding="$2.5"
            gap="$1.5"
          >
            <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
              <YStack flex={1} minWidth={0}>
                <Text fontSize={12} fontWeight="700" color="$text" numberOfLines={1}>
                  {r.Area_Nombre || r.Area_Codigo}
                </Text>
                <Text fontSize={10} color="$textMuted">
                  {fmtHoras(r.Horas_Solicitadas)} solicitadas · {fmtHoras(r.Horas_Marcaje)} de marcaje
                </Text>
              </YStack>

              {aprueba && Math.abs(delta) > 0.005 ? (
                <Text fontSize={13} fontWeight="800" color={delta > 0 ? '#B45309' : '#166534'}>
                  {delta > 0 ? '+' : '−'}{fmtDinero(Math.abs(delta))}
                </Text>
              ) : (
                <Text fontSize={11} color="$textMuted">sin cambio</Text>
              )}
            </XStack>

            <XStack justifyContent="space-between" gap="$2">
              <Text fontSize={11} color="$textMuted">Ya contado</Text>
              <Text fontSize={12} fontWeight="600" color="$textSecondary">{fmtDinero(actual)}</Text>
            </XStack>
            <XStack justifyContent="space-between" gap="$2">
              <Text fontSize={11} color="$textMuted">Si se aprueba</Text>
              <Text fontSize={12} fontWeight="700" color="$text">{fmtDinero(siAprueba)}</Text>
            </XStack>
          </YStack>
        )
      })}
    </YStack>
  )
}

/** El presupuesto completo del que firma, en el escenario que corresponda. */
function TotalRevision({ fila, aprueba }: { fila: IOvertimeReviewImpact; aprueba: boolean }) {
  const presupuesto = fila.Presupuesto ?? 0
  const despues = (aprueba ? fila.Consumido_Si_Aprueba : fila.Consumido_Si_Rechaza) ?? 0
  const disponible = presupuesto - despues
  const excedido = disponible < 0

  return (
    <YStack
      width="100%"
      backgroundColor={excedido ? '#FEF2F2' : '#F0FDF4'}
      borderWidth={1}
      borderColor={excedido ? '#FECACA' : '#BBF7D0'}
      borderRadius={10}
      padding="$2.5"
      gap="$1.5"
    >
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <Text fontSize={10} fontWeight="700" color={excedido ? '#991B1B' : '#166534'} letterSpacing={0.4}>
          TU PRESUPUESTO
        </Text>
        <Text fontSize={11} fontWeight="700" color={excedido ? '#991B1B' : '#166534'}>
          {excedido ? `Excedido en ${fmtDinero(Math.abs(disponible))}` : `Quedarían ${fmtDinero(disponible)}`}
        </Text>
      </XStack>

      <XStack gap="$2">
        {[
          { label: 'ASIGNADO', valor: fila.Presupuesto, fuerte: false },
          { label: 'GASTADO HOY', valor: fila.Consumido, fuerte: false },
          { label: aprueba ? 'SI APRUEBAS' : 'SI RECHAZAS', valor: despues, fuerte: true },
        ].map(c => (
          <YStack key={c.label} flex={1} gap={1}>
            <Text fontSize={9} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
              {c.label}
            </Text>
            <Text fontSize={c.fuerte ? 15 : 13} fontWeight={c.fuerte ? '800' : '700'} color="$text">
              {fmtDinero(c.valor)}
            </Text>
          </YStack>
        ))}
      </XStack>
    </YStack>
  )
}

/** 'L 1,234'. Redondeado: los centavos no cambian ninguna decisión acá. */
const fmtDinero = (valor: number | null | undefined): string => {
  const n = Number(valor ?? 0)
  if (!isFinite(n)) return 'L 0'
  return `L ${Math.round(n).toLocaleString('es-HN')}`
}
