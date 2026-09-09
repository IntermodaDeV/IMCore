import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet, TextInput } from 'react-native'
import dayjs from 'dayjs'
import { YStack, XStack, Text, Card, View, Button, Spinner, useTheme } from 'tamagui'
import { CalendarDays, Check, MessageSquareWarning, TrendingDown, TrendingUp, X } from 'lucide-react-native'

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
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import {
  IOvertimeReviewImpact,
  IOvertimeReviewToAuth,
  IReviewRealHours,
  IUserEntity,
} from '../../api/modules/overtime/overtime.types'
import {
  fmtFecha,
  fmtFechaHora,
  fmtHora,
  fmtHoras,
  nombreConCodigo,
} from './Overtime.utils'

// Bandeja de autorización de la DIFERENCIA (segundo flujo).
//
// Cuando el reloj registra más horas de las que se habían solicitado, RRHH
// revisa. Si decide no resolverlo por su cuenta, manda la diferencia acá.
//
// Lo que se aprueba en esta pantalla NO son las horas de la solicitud —esas ya
// pasaron por el primer flujo— sino qué hacer con la diferencia. Y hay TRES
// horarios en juego, no dos:
//
//   · Solicitado — lo que se autorizó en la solicitud.
//   · Marcaje    — lo que dice el reloj.
//   · Real       — lo que la primera entidad revisó que de verdad pasó.
//
// El tercero es el que suele ser cierto: el empleado marcó a las 22:15 pero se
// fue a las 21:30.
//
// La acción es RESOLVER, no aprobar o rechazar: cualquier etapa que firme
// determina el horario —cualquiera de los tres, o uno escrito a mano— y no
// reconocer la diferencia es una de las salidas de ese cuadro. Rechazar quiere
// decir lo mismo en todas: se pagan las horas solicitadas y la revisión se
// cierra.
//
// La segunda solo interviene cuando la primera RECONOCE bastantes más horas de
// las que se habían solicitado —no cuando el marcaje trae mucha diferencia—,
// porque el marcaje es un dato en bruto y quien revisa está justamente para
// decir cuánto de eso es cierto. Cuántas horas de más se toleran lo dice
// Tolerancia_Segunda_Firma, que llega del backend.
//
// Por eso la tarjeta muestra los horarios enfrentados: la decisión es elegir
// entre ellos, y sin verlos no hay con qué decidir.
//
// Y una tarjeta por EMPLEADO, para todas las entidades. Se agrupaban por
// solicitud cuando la última firma era un sí/no sobre el lote entero; ahora
// hay que determinar a qué hora se fue cada persona, y eso no se puede tomar
// de a montón.
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
 * Las horas que quedarían con cada decisión, para UNA revisión.
 *
 * No son las mismas en las dos etapas y por eso hace falta saber en cuál se
 * está: la primera elige entre lo solicitado y el reloj, la segunda entre el
 * reloj y el horario que revisó su colega.
 */
const horasSiFirma = (r: IOvertimeReviewToAuth, primera: boolean): number =>
  (primera ? r.Worked_Overtime_Hours : r.Real_Overtime_Hours ?? r.Worked_Overtime_Hours) ?? 0

/**
 * Rechazar quiere decir lo mismo en todas las etapas: no se reconoce nada más
 * que lo que ya se había autorizado. No vale el reloj, que nadie aprobó.
 */
const horasSiRechaza = (r: IOvertimeReviewToAuth): number =>
  r.Requested_Overtime_Hours ?? 0

/**
 * Qué horas quedan aplicadas si se resuelve el lote de esta forma.
 *
 * Es el dato que hay que poder leer antes de firmar varias de golpe: el total
 * cambia según la decisión, y en lote no se revisa un horario por empleado.
 */
const horasDelLote = (
  revisiones: IOvertimeReviewToAuth[],
  aprobar: boolean,
  primera: boolean,
): number =>
  revisiones.reduce(
    (acc, r) => acc + (aprobar ? horasSiFirma(r, primera) : horasSiRechaza(r)),
    0,
  )

// ── El horario real, para determinarlo desde el teléfono ────────────────────
//
// Se escriben las dos horas, igual que en la web: los dos puntos se ponen
// solos, así que en el teclado numérico solo hay que teclear cuatro dígitos.
// Y las cuatro alternativas de arriba llenan los campos con un toque, que es
// lo que resuelve la mayoría de los casos sin escribir nada.

/** Minutos desde medianoche de un datetime. */
const minutosDe = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const d = dayjs(iso)
  return d.isValid() ? d.hour() * 60 + d.minute() : null
}

const etiquetaMinutos = (minutos: number): string => {
  const m = ((minutos % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * 'HH:mm' escrito a minutos, o null si todavía no es una hora.
 *
 * Se valida el TEXTO y no se guarda un booleano aparte: mientras se escribe
 * hay estados intermedios ('2', '21:') que no son una hora, y con una bandera
 * suelta el total seguía mostrando el valor anterior como si fuera bueno.
 */
const minutosDeTexto = (texto: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto ?? '').trim())
  if (!m) return null

  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null

  return h * 60 + min
}

/**
 * Horas entre dos horas del día.
 *
 * Igual es CERO y no un día entero: significa 'solo trabajó su jornada', que es
 * una resolución válida. Solo se envuelve cuando el fin es anterior, que es la
 * forma de decir que terminó al día siguiente.
 */
const horasEntre = (minutosInicio: number, minutosFin: number): number => {
  let minutos = minutosFin - minutosInicio
  if (minutos < 0) minutos += 1440

  return +(minutos / 60).toFixed(2)
}

/** Los dos puntos se ponen solos: en un teclado numérico el ':' no está a mano. */
const formatearHora = (texto: string): string => {
  const digitos = texto.replace(/\D/g, '').slice(0, 4)
  return digitos.length > 2 ? `${digitos.slice(0, 2)}:${digitos.slice(2)}` : digitos
}

/**
 * El nombre corto de una entidad, para nombrar la etapa anterior.
 *
 * Las columnas dinámicas llegan como `Status_<NombreSinEspacios>`, así que del
 * nombre solo sobrevive el pegote. Se deshace por los cambios de minúscula a
 * mayúscula y se descarta la primera palabra, que es el verbo del flujo
 * —'Autoriza', 'Revisa'— y se repite en todas sin distinguir ninguna:
 *
 *   'AutorizaJefe' → 'Jefe'   ·   'AutorizaGerente' → 'Gerente'
 *
 * Es el mismo criterio que usa la web, para que la misma etapa no se llame de
 * dos formas según desde dónde se mire.
 */
const etiquetaEntidad = (nombre: string): string => {
  const palabras = String(nombre ?? '')
    // El corte va entre una minúscula (o dígito) y la mayúscula que sigue; así
    // 'RRHH' no se parte en cuatro.
    .replace(/([a-zà-öø-ÿ0-9])([A-ZÀ-ÖØ-Þ])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)

  if (palabras.length <= 1) return palabras[0] ?? ''

  return palabras.slice(1).join(' ')
}

/** Las columnas de estado de la fila, en el orden del flujo. */
const clavesEstado = (item: IOvertimeReviewToAuth): string[] =>
  Object.keys(item?.DynamicColumns ?? {}).filter(k => k.startsWith('Status_'))

/**
 * Cómo se llama la etapa que firma DESPUÉS de esta.
 *
 * Solo se usa para avisar que el horario queda a la espera de alguien; que
 * exista o no ese alguien lo decide `escala`.
 */
const etapaSiguienteLabel = (item: IOvertimeReviewToAuth, nombreEntidad: string): string => {
  const claves = clavesEstado(item)
  const propia = claves.indexOf(`Status_${String(nombreEntidad ?? '').replace(/\s+/g, '')}`)

  if (propia < 0 || propia >= claves.length - 1) return 'la siguiente etapa'

  return etiquetaEntidad(claves[propia + 1].replace(/^Status_/, ''))
}

/**
 * Cómo se llama la etapa que firmó ANTES de esta, para nombrar su horario.
 *
 * Sale del ORDEN de las columnas `Status_` de la fila, que es el del flujo:
 * es el mismo dato con el que la web arma su etiqueta.
 */
const etapaAnteriorLabel = (item: IOvertimeReviewToAuth, nombreEntidad: string): string => {
  const claves = clavesEstado(item)
  const propia = claves.indexOf(`Status_${String(nombreEntidad ?? '').replace(/\s+/g, '')}`)

  if (propia <= 0) return 'Ya revisado'

  return etiquetaEntidad(claves[propia - 1].replace(/^Status_/, ''))
}

/**
 * ¿Reconocer estas horas obliga a la firma de la siguiente etapa?
 *
 * Lo que escala no es el marcaje sino lo que la primera entidad RECONOCE: el
 * marcaje es un dato en bruto —quien se olvidó de marcar la salida aparece con
 * cuatro horas de más— y quien revisa está para decir cuánto de eso es cierto.
 *
 * Es de un solo lado: reconocer menos de lo solicitado no necesita permiso de
 * nadie, porque no compromete presupuesto que no estuviera ya aprobado.
 *
 * Acá es solo el aviso; quien decide de verdad es el backend, con este mismo
 * umbral, que viaja en la fila justamente para no tener dos copias.
 */
const escala = (r: IOvertimeReviewToAuth, horas: number, hayEtapaSiguiente: boolean): boolean =>
  hayEtapaSiguiente &&
  horas - (r.Requested_Overtime_Hours ?? 0) > (r.Tolerancia_Segunda_Firma ?? 0)

/**
 * La hora de fin como fecha completa, para mandarla al backend.
 *
 * Si la hora elegida es ANTERIOR al inicio de la hora extra, la jornada cruzó
 * la medianoche y el fin es del día siguiente: sin eso, quedarse hasta la 1am
 * se guardaría como haberse ido 20 horas antes de entrar.
 */
const fechaConHora = (
  fecha: string | null,
  inicio: string | null,
  minutosFin: number,
): string | null => {
  if (!fecha) return null

  const desde = minutosDe(inicio)
  const base = dayjs(fecha)
  if (!base.isValid()) return null

  const dia = desde !== null && minutosFin < desde ? base.add(1, 'day') : base
  return `${dia.format('YYYY-MM-DD')}T${etiquetaMinutos(minutosFin)}:00`
}

const etiquetaDiferencia = (diff: number | null | undefined) => {
  if (diff === null || diff === undefined) return 'Sin marcaje'
  if (diff === 0) return '0h'
  return `${diff > 0 ? '+' : '-'}${fmtHoras(Math.abs(diff))}`
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

  // Decisión en curso. Resolver abre el cuadro del horario; no reconocer la
  // diferencia pide el motivo, que el procedimiento exige.
  //
  // El envío sigue trabajando sobre una LISTA aunque acá siempre sea de uno:
  // es el mismo contrato del backend, y con una firma distinta habría que
  // mantener dos caminos parejos para nada.

  // Impacto de la decisión sobre el presupuesto. Solo llega con contenido en
  // la última etapa del flujo y con el acceso 'CostoHE'.
  const [impacto, setImpacto] = useState<IOvertimeReviewImpact[]>([])

  /**
   * El impacto se esta consultando.
   *
   * El cuadro se abre YA y el impacto llega despues —esperarlo dejaria el toque
   * sin respuesta— pero mientras no llega hay que decirlo. Sin esto, el cuadro
   * se veia sin el bloque del presupuesto, igual que cuando el usuario no tiene
   * acceso al costo o la firma todavia no resuelve nada: se podia firmar
   * creyendo que no habia nada que mirar.
   */
  const [cargandoImpacto, setCargandoImpacto] = useState(false)

  // Impacto de TODA la bandeja, no del lote que se está por firmar. Es lo que
  // permite poner el costo en cada tarjeta antes de abrir nada.
  const [impactoBandeja, setImpactoBandeja] = useState<IOvertimeReviewImpact[]>([])

  // Revisión del horario real, antes del confirm. Solo aparece para la primera
  // entidad y sobre una revisión sola: en lote no hay un horario por empleado.
  const [revisando, setRevisando] = useState<IOvertimeReviewToAuth | null>(null)

  // El horario que se está determinando, tal como se escribe. Los dos se
  // pueden editar —igual que en la web—: quien revisa a veces corrige también
  // la hora de entrada.
  const [horaIni, setHoraIni] = useState('')
  const [horaFin, setHoraFin] = useState('')

  // El comentario del cuadro. Es opcional para resolver y obligatorio para
  // rechazar, como en la web: un solo campo para las dos salidas.
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const companyCode = defaultCompany?.Code ?? ''

  /**
   * ¿Se está firmando con la PRIMERA entidad del flujo?
   *
   * Es la única que revisa a qué hora se fue de verdad el empleado; las
   * posteriores no lo revisan a él sino a esa decisión, y su respuesta es sí o
   * no. Lo resuelve el servidor y no la pantalla, que solo recibe las entidades
   * del usuario y no tiene con qué saber cuál es la primera del proceso.
   *
   * Sin la marca se asume que sí: es el caso de siempre —un flujo de una sola
   * etapa— y deja el comportamiento anterior.
   */
  const esPrimeraEntidad = useMemo(
    () => entidades.find(e => String(e.Id) === entidad)?.Es_Primera ?? true,
    [entidades, entidad],
  )

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
   * ¿Le toca la ÚLTIMA firma?
   *
   * Es la que resuelve la revisión y compromete el dinero. Sale de la entidad
   * seleccionada y no del impacto: el impacto es una consulta aparte que puede
   * tardar o fallar, y con la agrupación colgando de ella la bandeja se
   * dibujaba plana y ya no se reacomodaba. Cómo está armado el flujo es algo
   * que se sabe apenas se eligen las entidades.
   *
   * Va acá arriba porque las dos consultas del impacto la miran ANTES de pedir:
   * en las etapas anteriores esa consulta no tiene nada que contestar.
   */
  const esUltimaEntidad = useMemo(
    () => entidades.find(e => String(e.Id) === entidad)?.Es_Ultima === true,
    [entidades, entidad],
  )

  /**
   * El usuario puede ver MONTOS.
   *
   * Sale del impacto de la bandeja porque el acceso 'CostoHE' lo resuelve la
   * base: la pantalla no tiene la lista de accesos, y pedirla aparte sería otra
   * consulta para saber algo que ya viene en esta.
   */
  const veCosto = useMemo(
    () => impactoBandeja.some(r => r.Es_Ultima_Entidad && r.Ve_Costo),
    [impactoBandeja],
  )

  /**
   * Tiene sentido consultar el impacto sobre el presupuesto.
   *
   * Son las MISMAS dos condiciones con las que se filtra el resultado: que la
   * firma resuelva la revisión y que el usuario pueda ver montos. Si alguna no
   * se cumple, el bloque no se va a mostrar pase lo que pase.
   *
   * Vive en una sola bandera porque la miran DOS lugares —el efecto que
   * enciende el indicador de carga y la consulta misma— y tenerla repetida fue
   * exactamente el error: el efecto encendía el 'consultando el presupuesto' y
   * la consulta salía antes de apagarlo, así que el mensaje quedaba para
   * siempre en las etapas que no son la última.
   */
  const puedePedirImpacto = esUltimaEntidad && veCosto

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
      // NO SE PIDE en las etapas anteriores a la última. El procedimiento es el
      // más caro del módulo y para una etapa que no resuelve la revisión
      // devuelve las columnas de monto en NULL: trabajo completo para un
      // resultado que la pantalla no puede mostrar.
      if (!companyCode || !entidad || filas.length === 0 || !esUltimaEntidad) {
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
    [companyCode, entidad, esUltimaEntidad],
  )

  /**
   * Trae la bandeja de la entidad activa.
   *
   * `silent` es el modo del gesto de recargar: sin loader a pantalla completa
   * ni esqueleto, solo el indicador propio de la lista.
   */
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
    async (
      revisiones: IOvertimeReviewToAuth[],
      aprobar: boolean,
      comentario: string,
      realHours: IReviewRealHours[] = [],
    ) => {
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
          // Vacío en el lote y al rechazar: ahí no hay un horario que revisar.
          Real_Hours: realHours,
        })

        if (!res.Success) {
          showToast('error', 'Error', res.ErrorMessage || 'No se pudo registrar la decisión', 5000, 'top')
          return
        }

        const resueltas = new Set(ids)
        const quitar = (lista: IOvertimeReviewToAuth[]) => lista.filter(r => !resueltas.has(r.Id))
        setData(quitar)
        setFiltered(quitar)

        setMotivo('')

        // Las horas que quedaron salen del horario que se acaba de revisar
        // cuando lo hay: es lo que se firmó, no lo que decía la fila.
        const horasFirmadas = realHours.length > 0
          ? realHours.reduce((acc, h) => acc + (h.Real_Overtime_Hours ?? 0), 0)
          : horasDelLote(revisiones, true, esPrimeraEntidad)

        showToast(
          'success',
          aprobar ? 'Diferencia aprobada' : 'Diferencia rechazada',
          aprobar
            ? `Se reconocen ${fmtHoras(horasFirmadas)}`
            : `Se pagan ${fmtHoras(horasDelLote(revisiones, false, esPrimeraEntidad))} solicitadas`,
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
    [companyCode, entidad, esPrimeraEntidad, loader, showToast],
  )

  /**
   * Pide el impacto de resolver estas diferencias.
   *
   * De mejor esfuerzo: si falla, el confirm sale sin el bloque. Es información
   * de apoyo para decidir, no un requisito para poder firmar.
   */
  const pedirImpacto = useCallback(
    async (revisiones: IOvertimeReviewToAuth[], realHours: IReviewRealHours[] = []) => {
      setImpacto([])
      if (!companyCode || !entidad || revisiones.length === 0) return

      if (!puedePedirImpacto) return

      setCargandoImpacto(true)

      try {
        const res = await overtimeService.getReviewImpact(
          companyCode,
          Number(entidad),
          revisiones.map(r => r.Id),
          // El horario que se acaba de revisar y todavía no se guardó. Sin él,
          // el escenario 'si apruebas' costearía el marcaje mientras se firma
          // otra cosa.
          realHours,
        )

        // Las dos condiciones: que la firma RESUELVA la revisión —si se queda
        // esperando otra etapa no compromete nada todavía— y que el usuario
        // pueda ver montos. Las dos las decide el backend.
        const filas = res?.Success && res.Data
          ? res.Data.filter(r => r.Es_Ultima_Entidad && r.Ve_Costo)
          : []
        setImpacto(filas)
      } catch {
        setImpacto([])
      } finally {
        setCargandoImpacto(false)
      }
    },
    [companyCode, entidad, puedePedirImpacto],
  )

  /**
   * Abre el cuadro donde se resuelve una diferencia.
   *
   * Siempre de a una, en cualquier etapa: resolver es determinar a qué hora se
   * fue ESE empleado, y eso no se puede hacer para varios a la vez.
   */
  const abrirResolucion = useCallback((r: IOvertimeReviewToAuth) => {
    // Arranca en lo que dejó la etapa anterior si ya pasó por una —para eso
    // subió la revisión, y aceptarlo tiene que ser un toque—; si no, en el
    // marcaje, que es lo más probable que sea correcto; y si tampoco marcó,
    // en lo solicitado.
    const ini = minutosDe(r.Real_Start_Time) ?? minutosDe(r.Start_Time) ?? 0
    const fin = minutosDe(r.Real_End_Time)
             ?? minutosDe(r.Clock_Out)
             ?? minutosDe(r.End_Time)
             ?? ini

    setHoraIni(etiquetaMinutos(ini))
    setHoraFin(etiquetaMinutos(fin))
    setMotivo('')
    setMotivoError('')
    setRevisando(r)
  }, [])

  /**
   * Pasa del horario revisado al confirm.
   *
   * El modal del horario se cierra y el que decide es el de siempre: revisar la
   * hora no es firmar, y meter las dos cosas en un solo paso haría que ajustar
   * un cuarto de hora quedara a un toque de aplicar la decisión.
   */
  // El horario escrito, en minutos. null mientras no sea una hora.
  const minIni = minutosDeTexto(horaIni)
  const minFin = minutosDeTexto(horaFin)

  /** Las horas que se van a reconocer, o null si el horario está a medias. */
  const horasElegidas = minIni === null || minFin === null
    ? null
    : horasEntre(minIni, minFin)

  /** El horario escrito, listo para el backend. */
  const horarioPayload = useCallback((): IReviewRealHours[] | null => {
    if (!revisando || minIni === null || minFin === null || horasElegidas === null) return null

    const inicio = fechaConHora(revisando.Date, null, minIni)
    // El fin se corre un día cuando es anterior al inicio: así quedarse hasta
    // la 1am no se guarda como haberse ido 20 horas antes de entrar.
    const fin = fechaConHora(revisando.Date, etiquetaMinutos(minIni), minFin)
    if (!inicio || !fin) return null

    return [{
      Reviews_Id: revisando.Id,
      Real_Start_Time: inicio,
      Real_End_Time: fin,
      Real_Overtime_Hours: horasElegidas,
    }]
  }, [revisando, minIni, minFin, horasElegidas])

  /**
   * Resolver: se reconoce el horario que está escrito.
   *
   * Todo en el MISMO cuadro, como en la web. El confirm que había encima no
   * agregaba nada —repetía las mismas tarjetas de arriba— y era un toque de
   * más para volver a leer lo mismo.
   */
  const confirmarHorario = useCallback(() => {
    const payload = horarioPayload()
    if (!revisando || !payload) return

    const revision = revisando
    setRevisando(null)
    enviarDecision([revision], true, motivo.trim(), payload)
  }, [revisando, horarioPayload, motivo, enviarDecision])

  /**
   * Rechazar: no se reconoce la diferencia, se pagan las horas solicitadas.
   *
   * Sale del mismo cuadro y con el mismo campo de comentario, que acá sí es
   * obligatorio: el procedimiento pide al menos 10 caracteres, y decirlo antes
   * evita que el error viaje hasta la base y vuelva.
   */
  const confirmarRechazo = useCallback(() => {
    if (!revisando) return

    const texto = motivo.trim()
    if (texto.length < 10) {
      setMotivoError('Indica el motivo del rechazo (al menos 10 caracteres)')
      return
    }

    const revision = revisando
    setRevisando(null)
    enviarDecision([revision], false, texto)
  }, [revisando, motivo, enviarDecision])

  // El impacto se pide cuando la mano se detiene, no en cada tecla: es una
  // consulta, y escribir una hora dispararía una por dígito.
  useEffect(() => {
    const payload = horarioPayload()

    // La MISMA condición que la consulta, y acá está la razón de que sea una
    // sola bandera: este efecto encendía el indicador antes de llamar, y la
    // consulta salía por su guarda sin llegar al `finally` que lo apaga. En las
    // etapas que no son la última el 'consultando el presupuesto' quedaba
    // puesto para siempre, esperando algo que nunca se pidió.
    if (!payload || !revisando || !puedePedirImpacto) {
      setImpacto([])
      setCargandoImpacto(false)
      return
    }

    // El indicador se enciende YA, no cuando arranca la consulta. Los 450 ms de
    // espera son parte del tiempo que el usuario percibe, y durante ellos el
    // número que está en pantalla ya no corresponde al horario que acaba de
    // escribir: dejarlo a la vista sin avisar es peor que taparlo.
    setCargandoImpacto(true)

    const t = setTimeout(() => pedirImpacto([revisando], payload), 450)

    return () => clearTimeout(t)
  }, [revisando, horarioPayload, pedirImpacto, puedePedirImpacto])

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
   * Qué se espera de quien está en esta pantalla, en una línea.
   *
   * Lo que se decide acá no se deduce de las tarjetas: se ven dos bloques de
   * horas y dos botones, y de ahí no sale ni qué queda registrado ni si la
   * firma cierra el trámite. En la primera etapa se ESCRIBE un horario y en las
   * siguientes se responde sí o no sobre el que escribió otro, que son dos
   * trabajos distintos con los mismos botones.
   */


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

        {/* Cuánto hay. Sin 'seleccionar todas': en este flujo no hay revisión
            masiva —cada empleado tiene su propio horario que determinar— y la
            casilla prometía un lote que no existe. */}
        {data.length > 0 && (
          <XStack alignItems="center" justifyContent="flex-end" gap="$2" paddingVertical="$1">
            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
              {resumen.texto}
            </Text>
          </XStack>
        )}
      </YStack>

      {/* La lista se monta siempre, incluso vacía, para que el gesto de
          recargar exista también cuando no hay nada pendiente. */}
      <FlatList
        // Una tarjeta por EMPLEADO, para todas las entidades. Acá la decisión
        // es qué horario se le reconoce a cada uno, y eso no se puede tomar
        // por solicitud.
        data={filtered}
        keyExtractor={item => String(item.Id)}
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
        renderItem={({ item }) => (
          <RevisionCard
            item={item}
            firmable={puedeAutorizar(item, nombreEntidad)}
            veCosto={veCosto}
            costo={costoPorRevision.get(item.Id) ?? null}
            onResolver={() => abrirResolucion(item)}
          />
        )}
      />

    </View>

      {/* El cuadro donde se resuelve una diferencia: se elige el horario y se
          firma. Es el mismo de la web, sección por sección —quién, las cuatro
          alternativas, el horario que queda, los avisos, qué hace cada botón,
          el comentario y el presupuesto—: la misma decisión no puede verse de
          dos formas según desde dónde se tome.

          Tres salidas y no dos: Resolver reconoce el horario escrito, Rechazar
          no reconoce nada más que lo solicitado —y exige el motivo—, Cancelar
          no hace nada. */}
      <Modal
        visible={!!revisando}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRevisando(null)}
      >
        <ScrollView
          style={styles.backdrop}
          contentContainerStyle={[styles.backdropContent, { paddingBottom: 24 + keyboardHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          {revisando && (
            <View style={[styles.modalCard, { backgroundColor: theme.backgroundElevated?.val as string }]}>

              {/* De quién es la hora que se está por decidir. El nombre va con
                  su propio peso y no metido en una línea de datos: es lo
                  primero que hay que reconocer al abrir el cuadro, sobre todo
                  cuando se resuelven varias seguidas. Y con el solicitante,
                  que es a quien hay que preguntarle si algo no cuadra. */}
              <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
                <YStack flex={1} minWidth={0}>
                  <Text fontSize={12} fontWeight="700" color="$textMuted" marginBottom={2}>
                    Resolver diferencia
                  </Text>
                  <Text fontSize={15} fontWeight="800" color="$text" numberOfLines={2}>
                    {nombreConCodigo(revisando.Employee_Name, revisando.Employee_Code)}
                  </Text>
                  <Text fontSize={11} color="$textMuted" numberOfLines={2}>
                    {revisando.Correlative} · {fmtFecha(revisando.Date)} · solicitó{' '}
                    {nombreConCodigo(revisando.Solicitante) || '—'}
                  </Text>
                </YStack>

                <View
                  padding="$2" marginTop={-8} marginRight={-8} borderRadius={999}
                  pressStyle={{ opacity: 0.6 }}
                  onPress={() => setRevisando(null)}
                >
                  <X size={20} color={theme.textMuted?.val as string} />
                </View>
              </XStack>

              {/* Las alternativas. Tocar una carga sus horas abajo; ninguna
                  firma por su cuenta, para que elegir mal no cueste una
                  decisión. */}
              <OpcionesHorario
                item={revisando}
                etiquetaRevisado={etapaAnteriorLabel(revisando, nombreEntidad)}
                onElegir={(ini, fin) => { setHoraIni(ini); setHoraFin(fin) }}
              />

              {/* Lo que va a quedar. Se toma de arriba o se escribe. */}
              <XStack gap="$2" alignItems="flex-end" marginTop="$2">
                <CampoHora label="Inicio" valor={horaIni} valido={minIni !== null} onCambio={setHoraIni} />
                <CampoHora label="Fin" valor={horaFin} valido={minFin !== null} onCambio={setHoraFin} />

                <YStack minWidth={72} alignItems="flex-end">
                  <Text fontSize={9} fontWeight="700" color="#166534" letterSpacing={0.3}>
                    SE PAGAN
                  </Text>
                  <Text fontSize={16} fontWeight="800" color="$text">
                    {horasElegidas === null ? '—' : fmtHoras(horasElegidas)}
                  </Text>
                </YStack>
              </XStack>

              {/* Los avisos. Se recalculan con lo que se escribe: si salieran
                  fijos, dirían lo contrario en cuanto se ajuste el horario. */}
              <YStack gap={2} paddingTop={4}>
                {horasElegidas === null && (
                  <Text fontSize={11} fontWeight="600" color="$error">
                    Escribí las horas en formato HH:mm.
                  </Text>
                )}

                {/* Reconocer más de lo que dice el reloj se puede, pero no en
                    silencio: es lo que después hay que poder explicar. */}
                {horasElegidas !== null && !!revisando.Clock_Out &&
                  horasElegidas > (revisando.Worked_Overtime_Hours ?? 0) + 0.001 && (
                  <Text fontSize={11} color="#B45309">
                    Es más de lo que dice el reloj.
                  </Text>
                )}

                {horasElegidas !== null && escala(revisando, horasElegidas, !esUltimaEntidad) && (
                  <Text fontSize={11} color="#B45309" lineHeight={15}>
                    Más de {fmtHoras(revisando.Tolerancia_Segunda_Firma)} sobre lo solicitado:
                    queda a la espera de {etapaSiguienteLabel(revisando, nombreEntidad)}.
                  </Text>
                )}
              </YStack>

              {/* Qué hace cada botón. Las tres salidas cambian cosas distintas
                  y ninguna se deduce de su nombre. */}
              <YStack
                marginTop="$2" padding="$2" borderRadius={8} gap={2}
                borderWidth={1} borderColor="#E2E8F0" backgroundColor="#F8FAFC"
              >
                <Text fontSize={11} lineHeight={16} color="#475569">
                  <Text fontSize={11} fontWeight="800" color="#166534">Resolver</Text>
                  {' · se le reconocen las horas de arriba.'}
                </Text>
                <Text fontSize={11} lineHeight={16} color="#475569">
                  <Text fontSize={11} fontWeight="800" color="#B91C1C">Rechazar</Text>
                  {' · no se reconoce la diferencia: se le pagan las '}
                  <Text fontSize={11} fontWeight="800" color="#475569">
                    {fmtHoras(revisando.Requested_Overtime_Hours)}
                  </Text>
                  {` solicitadas (${fmtHora(revisando.Start_Time)} — ${fmtHora(revisando.End_Time)}) y la revisión se cierra.`}
                </Text>
                <Text fontSize={11} lineHeight={16} color="#475569">
                  <Text fontSize={11} fontWeight="800" color="#475569">Cancelar</Text>
                  {' · no cambia nada, la revisión queda pendiente.'}
                </Text>
              </YStack>

              {/* Un solo campo para las dos salidas: opcional al resolver,
                  obligatorio al rechazar. */}
              <YStack marginTop="$2">
                <AppInput
                  label="Comentario"
                  multiline
                  minLines={2}
                  placeholder="Obligatorio si rechaza"
                  value={motivo}
                  onChangeText={(v: string) => { setMotivo(v); setMotivoError('') }}
                  error={motivoError}
                  style={{ height: 64 }}
                />
              </YStack>

              {/* El presupuesto, para quien tenga el acceso. Solo el total:
                  con el desglose por área el cuadro se volvía un informe y la
                  hora —que es la decisión— quedaba abajo del pliegue. */}
              {/* Primero 'estoy buscando' y después el resultado: el bloque
                  dice que hay un dato del presupuesto en camino, así que no se
                  firma creyendo que no había nada que mirar. */}
              {cargandoImpacto ? (
                <ImpactoResolverCargando />
              ) : impacto.length > 0 ? (
                <ImpactoResolver filas={impacto} />
              ) : null}

              {/* Rechazar va aparte y en secundario porque es la excepción: lo
                  normal es tomar uno de los horarios de arriba. */}
              <Button
                height={34} borderRadius={9} marginTop="$3"
                backgroundColor="$backgroundSurface"
                borderWidth={1} borderColor="#FECACA"
                pressStyle={{ opacity: 0.7 }}
                disabled={enviando}
                onPress={confirmarRechazo}
              >
                <Text fontSize={12} fontWeight="700" color="$error">
                  Rechazar · pagar lo solicitado
                </Text>
              </Button>

              <XStack gap="$2" marginTop="$2">
                <Button
                  flex={1} height={40} borderRadius={10}
                  backgroundColor="$backgroundSurface"
                  borderWidth={1} borderColor="$border"
                  pressStyle={{ opacity: 0.7 }}
                  onPress={() => setRevisando(null)}
                >
                  <Text color="$text" fontWeight="600">Cancelar</Text>
                </Button>
                <Button
                  flex={1} height={40} borderRadius={10}
                  backgroundColor={horasElegidas === null ? '$border' : '$primary'}
                  pressStyle={{ opacity: 0.85 }}
                  disabled={horasElegidas === null || enviando}
                  onPress={confirmarHorario}
                >
                  <Text color={horasElegidas === null ? '$textMuted' : 'white'} fontWeight="700">
                    Resolver
                  </Text>
                </Button>
              </XStack>
            </View>
          )}
        </ScrollView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdropContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  modalCard: { borderRadius: 16, padding: 16 },
})

/**
 * Uno de los horarios que se están comparando.
 *
 * Los tres van con el mismo formato y el mismo alto para que se puedan leer en
 * paralelo: la decisión es elegir entre ellos, y cualquier asimetría visual
 * empuja a mirar uno más que el otro.
 *
 * Sin el reparto por banda: cuánto cae en 25% y cuánto en 50% no cambia qué
 * horario es el correcto —eso se decide por la hora— y llenaba la tarjeta de
 * números que había que saltarse para llegar a la decisión.
 */
function Horario({
  titulo,
  color,
  inicio,
  fin,
  total,
  sinDato,
}: {
  titulo: string
  color: string
  inicio: string | null
  fin: string | null
  total: number | null
  sinDato?: boolean
}) {
  return (
    <YStack
      flex={1}
      minWidth={0}
      gap={1}
      paddingHorizontal="$2"
      paddingVertical={6}
      borderRadius={8}
      borderWidth={1}
      borderColor="$border"
      style={{ backgroundColor: `${color}14` }}
    >
      <Text fontSize={9} fontWeight="800" letterSpacing={0.3} style={{ color }} numberOfLines={1}>
        {titulo.toUpperCase()}
      </Text>

      <Text fontSize={11} color="$textSecondary" numberOfLines={1}>
        {sinDato ? 'sin marcaje' : `${fmtHora(inicio)}—${fmtHora(fin)}`}
      </Text>

      <Text fontSize={14} fontWeight="800" color="$text" numberOfLines={1}>
        {sinDato ? '—' : fmtHoras(total)}
      </Text>
    </YStack>
  )
}

/**
 * Las cuatro alternativas de horario, en una rejilla de dos por dos.
 *
 * Todas del mismo tamaño y con el mismo formato: son alternativas, y una más
 * grande que otra sugiere una recomendación que el sistema no tiene por qué
 * hacer. La de la etapa anterior solo aparece cuando existe.
 *
 * Tocar una NO firma: carga su hora en el campo de abajo, que es donde se
 * puede ajustar. Así elegir mal no cuesta una decisión.
 */
function OpcionesHorario({
  item,
  etiquetaRevisado,
  onElegir,
}: {
  item: IOvertimeReviewToAuth
  /** Cómo se llama la etapa que dejó el horario revisado. */
  etiquetaRevisado: string
  onElegir: (inicio: string, fin: string) => void
}) {
  const iniPedido = etiquetaMinutos(minutosDe(item.Start_Time) ?? 0)

  const hhmm = (iso: string | null | undefined): string => {
    const m = minutosDe(iso)
    return m === null ? '' : etiquetaMinutos(m)
  }

  const opciones = [
    item.End_Time && {
      titulo: 'Solicitado',
      color: '#2563EB',
      inicio: iniPedido,
      fin: hhmm(item.End_Time),
      total: fmtHoras(item.Requested_Overtime_Hours),
    },
    item.Clock_Out && {
      titulo: 'Marcaje',
      color: '#D97706',
      inicio: iniPedido,
      fin: hhmm(item.Clock_Out),
      total: item.Worked_Overtime_Hours === null || item.Worked_Overtime_Hours === undefined
        ? 'Sin marcaje'
        : fmtHoras(item.Worked_Overtime_Hours),
    },
    item.Real_End_Time && {
      titulo: etiquetaRevisado,
      color: '#16A34A',
      inicio: hhmm(item.Real_Start_Time) || iniPedido,
      fin: hhmm(item.Real_End_Time),
      total: fmtHoras(item.Real_Overtime_Hours),
    },
    {
      titulo: 'Sin extra',
      color: '#475569',
      inicio: iniPedido,
      fin: iniPedido,
      total: '0h',
    },
  ].filter(Boolean) as {
    titulo: string
    color: string
    inicio: string
    fin: string
    total: string
  }[]

  return (
    <XStack flexWrap="wrap" gap={6} marginTop="$3">
      {opciones.map(o => (
        <YStack
          key={o.titulo}
          width="48.5%"
          gap={1}
          paddingHorizontal="$2"
          paddingVertical={6}
          borderRadius={8}
          borderWidth={1}
          borderColor={`${o.color}33`}
          style={{ backgroundColor: `${o.color}0F` }}
          pressStyle={{ opacity: 0.6 }}
          onPress={() => onElegir(o.inicio, o.fin)}
        >
          <Text
            fontSize={9} fontWeight="700" letterSpacing={0.4}
            textTransform="uppercase" style={{ color: o.color }} numberOfLines={1}
          >
            {o.titulo}
          </Text>
          <Text fontSize={13} fontWeight="700" color="#1F2937" numberOfLines={1}>
            {o.inicio} — {o.fin}
          </Text>
          <Text fontSize={10} color="#64748B" numberOfLines={1}>
            {o.total}
          </Text>
        </YStack>
      ))}
    </XStack>
  )
}

/**
 * Un campo de hora, igual a los de la web.
 *
 * Los dos puntos se ponen solos: en un teclado numérico el ':' no está a mano,
 * y pedirlo convertiría 'escribir la hora' en un acertijo.
 */
function CampoHora({
  label,
  valor,
  valido,
  onCambio,
}: {
  label: string
  valor: string
  valido: boolean
  onCambio: (texto: string) => void
}) {
  const theme = useTheme()

  return (
    <YStack flex={1} minWidth={0} gap={2}>
      <Text fontSize={10} color="#64748B">{label}</Text>
      <YStack
        height={36} borderRadius={6} borderWidth={1}
        borderColor={valido ? '#CBD5E1' : (theme.error?.val as string)}
        backgroundColor="#FFFFFF" justifyContent="center"
      >
        <TextInput
          value={valor}
          onChangeText={t => onCambio(formatearHora(t))}
          keyboardType="number-pad"
          maxLength={5}
          placeholder="HH:mm"
          placeholderTextColor="#94A3B8"
          selectTextOnFocus
          style={{
            width: '100%',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: '700',
            color: (valido ? '#1F2937' : theme.error?.val) as string,
            padding: 0,
          }}
        />
      </YStack>
    </YStack>
  )
}

/**
 * Una diferencia esperando que esta entidad le determine el horario.
 *
 * Una por EMPLEADO y para todas las entidades, incluida la última. Se
 * agrupaban por solicitud cuando la firma era un sí/no sobre el lote entero;
 * ahora la decisión es a qué hora se fue cada persona, y eso no se puede
 * tomar de a montón.
 *
 * Lleva lo que hace falta para decidir y nada más: quién es y de dónde, los
 * horarios en juego, la diferencia, quién la mandó y por qué. Lo que costaba
 * solo aparece para quien tiene el acceso.
 */
function RevisionCard({
  item,
  firmable = true,
  veCosto,
  costo,
  onResolver,
}: {
  item: IOvertimeReviewToAuth
  /** A esta entidad todavía le toca firmarla. */
  firmable?: boolean
  /** El usuario tiene el acceso para ver montos. */
  veCosto?: boolean
  /** Lo que ya cuesta y lo que costaría con el horario revisado. */
  costo?: { actual: number; siAprueba: number } | null
  onResolver: () => void
}) {
  const theme = useTheme()

  const sinMarcaje = item.Worked_Overtime_Hours === null || item.Worked_Overtime_Hours === undefined
  const colorDiff = colorDiferencia(item.Hours_Difference, theme)
  const IconoDiff = (item.Hours_Difference ?? 0) < 0 ? TrendingDown : TrendingUp

  // El horario que dejó la etapa anterior. Solo existe si ya pasó por una, y
  // cuando existe es la propuesta sobre la que se está firmando.
  const hayRevisado = item.Real_End_Time !== null && item.Real_End_Time !== undefined

  const delta = (costo?.siAprueba ?? 0) - (costo?.actual ?? 0)
  const hayCosto = !!veCosto && !!costo

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={12}
      padding="$2.5"
      borderWidth={1}
      borderColor="$border"
    >
      <YStack gap="$2">
        {/* Quién es, de dónde y de cuándo. Los tres en dos renglones: son
            identificación, no decisión. */}
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
          <YStack flex={1} minWidth={0}>
            <Text fontSize={14} fontWeight="700" color="$text" numberOfLines={1}>
              {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
            </Text>
            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
              {[item.Departamento, item.Posicion].filter(Boolean).join(' · ') || 'Sin área'}
            </Text>
          </YStack>

          <XStack
            paddingHorizontal={7}
            paddingVertical={2}
            borderRadius={16}
            alignItems="center"
            gap={4}
            backgroundColor="$backgroundSurface"
          >
            <CalendarDays size={10} color={theme.textMuted?.val as string} />
            <Text fontSize={10} fontWeight="600" color="$textSecondary">
              {fmtFecha(item.Date)}
            </Text>
          </XStack>
        </XStack>

        {/* Los horarios en juego, enfrentados. El tercero solo cuando existe. */}
        <XStack gap={6} alignItems="stretch">
          <Horario
            titulo="Solicitado"
            color="#3B82F6"
            inicio={item.Start_Time}
            fin={item.End_Time}
            total={item.Requested_Overtime_Hours}
          />
          <Horario
            titulo="Marcaje"
            color="#F59E0B"
            inicio={item.Clock_In}
            fin={item.Clock_Out}
            total={item.Worked_Overtime_Hours}
            sinDato={sinMarcaje}
          />
          {hayRevisado && (
            <Horario
              titulo="Revisado"
              color="#16A34A"
              inicio={item.Real_Start_Time ?? item.Start_Time}
              fin={item.Real_End_Time}
              total={item.Real_Overtime_Hours}
            />
          )}
        </XStack>

        {/* La diferencia y —con el acceso— lo que mueve, en un solo renglón. */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal="$2.5"
          paddingVertical={6}
          borderRadius={8}
          backgroundColor="$backgroundSurface"
          gap="$2"
        >
          <XStack alignItems="center" gap={5} minWidth={0}>
            <IconoDiff size={13} color={colorDiff} />
            <Text fontSize={11} fontWeight="700" color="$textSecondary">
              Diferencia
            </Text>
            <Text fontSize={14} fontWeight="800" style={{ color: colorDiff }}>
              {etiquetaDiferencia(item.Hours_Difference)}
            </Text>
          </XStack>

          {hayCosto && (
            <Text fontSize={11} fontWeight="700" color="$textSecondary" numberOfLines={1}>
              {fmtDinero(costo!.actual)}
              {Math.abs(delta) > 0.005 && (
                <Text fontSize={11} fontWeight="800" color={delta > 0 ? '#B45309' : '#166534'}>
                  {` → ${fmtDinero(costo!.siAprueba)}`}
                </Text>
              )}
            </Text>
          )}
        </XStack>

        {/* Por qué llegó acá: sin esto la decisión se toma a ciegas. El
            correlativo y quién solicitó van juntos —son la solicitud de la que
            salió— y el motivo al lado, que es del renglón. */}
        <YStack gap={3} borderTopWidth={1} borderTopColor="$border" paddingTop={6}>
          <XStack justifyContent="space-between" alignItems="center" gap="$2">
            <Text fontSize={10} color="$textMuted" numberOfLines={1} flex={1}>
              {item.Correlative} · solicitó {nombreConCodigo(item.Solicitante)}
            </Text>
            <Text fontSize={10} color="$textMuted" numberOfLines={1}>
              {item.Category_Name || 'Sin motivo'}
            </Text>
          </XStack>

          <XStack alignItems="center" gap={5}>
            <MessageSquareWarning size={11} color={theme.textMuted?.val as string} />
            <Text fontSize={10} color="$textMuted" flex={1} numberOfLines={1}>
              a revisión por {nombreConCodigo(item.Sent_To_Review_By)} · {fmtFechaHora(item.Sent_To_Review_Date)}
            </Text>
          </XStack>

          <Text fontSize={11} color="$textSecondary">
            {item.Comment || 'Sin justificación registrada.'}
          </Text>
        </YStack>

        {/* UNA sola acción, y no 'aprobar / rechazar'. Quien firma no dice sí o
            no: elige a qué hora se fue el empleado entre los horarios de
            arriba —o escribe otra—, y no reconocer nada es una de las salidas
            de ese cuadro, no la mitad de la decisión. */}
        {firmable && (
          <Button
            height={36} borderRadius={9}
            backgroundColor="$primary"
            pressStyle={{ opacity: 0.85 }}
            onPress={onResolver}
          >
            <XStack alignItems="center" gap={6}>
              <Check size={14} color="white" />
              <Text fontSize={12} fontWeight="700" color="white">Resolver</Text>
            </XStack>
          </Button>
        )}
      </YStack>
    </Card>
  )
}


/**
 * Qué le pasa al presupuesto si se resuelve con la hora que está puesta.
 *
 * Tres números y ninguno más: cuánto hay, cuánto cuesta esto y con cuánto se
 * queda. El desglose por área contestaba una pregunta que nadie hace mientras
 * decide a qué hora se fue un empleado.
 *
 * Solo llega con contenido cuando la firma RESUELVE la revisión y el usuario
 * tiene el acceso a montos: las dos condiciones las decide el backend.
 */
/**
 * El presupuesto se está consultando.
 *
 * Con la FORMA del bloque que viene —tres renglones— y no un spinner suelto:
 * así el cuadro ya tiene su alto y los botones de abajo no se corren cuando
 * llegan los números. Un botón que se mueve justo cuando el dedo baja es como
 * se firma lo que no se quería firmar.
 */
function ImpactoResolverCargando() {
  return (
    <YStack
      marginTop="$2"
      borderRadius={10}
      padding="$2.5"
      gap={6}
      borderWidth={1}
      borderColor="#E2E8F0"
      backgroundColor="#F8FAFC"
    >
      <XStack alignItems="center" gap="$2">
        <Spinner size="small" color="#94A3B8" />
        <Text fontSize={10} fontWeight="700" color="#64748B" letterSpacing={0.4}>
          CONSULTANDO EL PRESUPUESTO
        </Text>
      </XStack>

      {[0, 1, 2].map(i => (
        <XStack key={i} justifyContent="space-between" alignItems="center" gap="$2">
          <View height={8} width={i === 2 ? '30%' : '45%'} borderRadius={3} backgroundColor="#CBD5E1" />
          <View height={i === 2 ? 13 : 9} width="25%" borderRadius={3} backgroundColor="#CBD5E1" />
        </XStack>
      ))}
    </YStack>
  )
}

function ImpactoResolver({ filas }: { filas: IOvertimeReviewImpact[] }) {
  const total = filas.find(r => r.Es_Total)
  if (!total) return null

  const presupuesto = total.Presupuesto ?? 0
  const despues = total.Consumido_Si_Aprueba ?? 0
  const cuesta = despues - (total.Consumido ?? 0)
  const queda = presupuesto - despues
  const excedido = queda < 0

  return (
    <YStack
      marginTop="$2"
      borderRadius={10}
      padding="$2.5"
      gap={4}
      borderWidth={1}
      borderColor={excedido ? '#FECACA' : '#E2E8F0'}
      backgroundColor={excedido ? '#FEF2F2' : '#F8FAFC'}
    >
      {[
        { label: 'Presupuesto de la semana', valor: fmtDinero(presupuesto), fuerte: false },
        { label: 'Cuesta resolver esto', valor: fmtDinero(cuesta), fuerte: false },
        {
          label: excedido ? 'Se excede en' : 'Quedarían',
          valor: fmtDinero(Math.abs(queda)),
          fuerte: true,
        },
      ].map(l => (
        <XStack key={l.label} justifyContent="space-between" alignItems="center" gap="$2">
          <Text fontSize={11} color={excedido && l.fuerte ? '#991B1B' : '#64748B'}>
            {l.label}
          </Text>
          <Text
            fontSize={l.fuerte ? 14 : 12}
            fontWeight={l.fuerte ? '800' : '600'}
            color={excedido && l.fuerte ? '#991B1B' : '#1F2937'}
          >
            {l.valor}
          </Text>
        </XStack>
      ))}
    </YStack>
  )
}

/** 'L 1,234'. Redondeado: los centavos no cambian ninguna decisión acá. */
const fmtDinero = (valor: number | null | undefined): string => {
  const n = Number(valor ?? 0)
  if (!isFinite(n)) return 'L 0'
  return `L ${Math.round(n).toLocaleString('es-HN')}`
}
