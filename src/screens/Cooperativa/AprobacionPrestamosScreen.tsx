import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl } from 'react-native'
import { YStack, XStack, Text, ScrollView, View, Button, Spinner, styled } from 'tamagui'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import {
  Coins, CalendarDays, User, Clock, CheckCircle2, XCircle,
  Tag, Inbox, RotateCw, Wallet, Briefcase, UserCog,
  Check, X, Users, Square, SquareCheck, IdCard, ChevronDown, Pencil, Percent,
} from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
  ISolicitudPrestamo,
  IEmpleadoInfo,
  ICadenaConfigurada,
  IAprobadorSolicitud,
  ITasaInteres,
  IPrestacionEmpleado,
  ESTADO_SOLICITUD,
} from '../../api/modules/cooperativa/cooperativa.types'
import AppInput from '../../components/commons/AppInput'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { shadows } from '../../theme/shadows'

/**
 * Aprobación de solicitudes de préstamo.
 *
 * La MISMA pantalla la abren dos personas distintas, y el servidor decide qué
 * ve cada una:
 *
 *   Aprobador1  -> todo el historial. Al aprobar elige a quién más mandar.
 *   Aprobador2  -> solo las solicitudes donde lo asignaron.
 *
 * De ahí que no se compruebe el acceso acá: la API filtra según el que tenga
 * quien llama, y esta pantalla pinta lo que le devuelvan. El campo MiEstado
 * dice si a esta persona le toca resolver esta solicitud.
 *
 * Los datos salen de IMCore, NO de Cooperativa. Una solicitud viaja allá solo
 * cuando termina toda la cadena de aprobaciones.
 */

const RotateCwStyled = styled(RotateCw, { color: '$text' })

export const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Fecha Y hora, para saber cuándo se pidió.
 *
 * Va con hora y no solo el día porque el orden importa: entre dos solicitudes
 * del mismo día, quien aprueba necesita saber cuál entró primero. El listado ya
 * las ordena así, y esto es lo que lo hace comprobable.
 */
export const formatFechaHora = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'

  // 24 h y sin am/pm: en una columna de un tercio, "02:35 p. m." se parte en
  // tres líneas. "14:35" entra completo.
  return fecha.toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Si esa fila es la firma del PRIMER aprobador.
 *
 * Se mira `Nivel`, que es el dato bueno. El respaldo por `Create_By` es para
 * cuando el servidor todavía no lo devuelve (falta correr CooInter_19): él crea
 * todas las filas de la cadena, así que la única donde el creador y el aprobador
 * son la misma persona es la suya.
 *
 * Sin ese respaldo, su propia firma se colaba en la lista de candidatos como una
 * fila fija que no se puede desmarcar — y con ella ahí, "no dejó a nadie" nunca
 * se cumplía.
 */
const esFirmaDelPrimero = (f: IAprobadorSolicitud) =>
  f.Nivel === 1 || (f.Nivel == null && !!f.User_Code && f.User_Code === f.Create_By)

/** Monto en lempiras. Cooperativa maneja HNL. */
export const formatMonto = (valor: number | null | undefined): string => {
  if (valor == null) return '-'
  return `L ${valor.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Cada cuánto se le descuenta, en las palabras de su pago.
 *
 * El aprobador necesita esto para juzgar el plazo: "12 quincenas" a alguien que
 * cobra por mes no significa nada.
 */
export const CADA_PAGO: Record<string, string> = {
  S: 'semanal',
  Q: 'quincenal',
  M: 'mensual',
}

/**
 * Cuánto lleva en la empresa, en palabras.
 *
 * La antigüedad importa más que la fecha para decidir un préstamo: "8 meses"
 * dice algo de inmediato, "12/03/2025" hay que restarlo mentalmente. Se muestran
 * las dos, pero esta va primero.
 */
const antiguedad = (desde: string | null): string | null => {
  if (!desde) return null

  const inicio = new Date(desde)
  if (isNaN(inicio.getTime())) return null

  const meses =
    (new Date().getFullYear() - inicio.getFullYear()) * 12 +
    (new Date().getMonth() - inicio.getMonth())

  // Una fecha futura es un dato malo, no una antigüedad negativa.
  if (meses < 0) return null
  if (meses < 1) return 'menos de un mes'
  if (meses < 12) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`

  const anios = Math.floor(meses / 12)
  const resto = meses % 12

  return resto === 0
    ? `${anios} ${anios === 1 ? 'año' : 'años'}`
    : `${anios} ${anios === 1 ? 'año' : 'años'} y ${resto} ${resto === 1 ? 'mes' : 'meses'}`
}

/**
 * De dónde es la persona y desde cuándo.
 *
 * Va en su propio bloque, separado de lo que pidió: son dos preguntas distintas
 * — "¿qué me están pidiendo?" y "¿a quién se lo estoy aprobando?".
 */
/**
 * Qué pasó con cada firma de la cadena: quién aprobó, quién rechazó y quién
 * sigue pendiente.
 *
 * Solo la ve el primer aprobador. Es él quien arma la cadena, así que es el
 * único que necesita seguirle la pista: por qué una solicitud sigue abierta, o
 * quién fue el que la mató.
 *
 * El orden viene del servidor y es el de creación: primero su propia firma,
 * después los que él agregó.
 */
/**
 * Con qué respaldo cuenta el empleado si saliera hoy.
 *
 * Solo la ve quien tenga el acceso 'VerPrestaciones': ver la liquidación
 * completa de una persona es un permiso aparte del de aprobar.
 *
 * Es SOLO para decidir — no se guarda nada — así que va compacta: el total
 * grande, la antigüedad, y el desglose en renglones chicos. Lo que pesa en la
 * decisión es el total contra el monto que pide.
 */
export function ResumenPrestaciones({ filas }: { filas: IPrestacionEmpleado[] }) {
  if (filas.length === 0) return null

  // El total ya viene con el signo puesto por el servidor: acá se suma y ya,
  // sin volver a mirar si el concepto suma o resta.
  const total = filas.reduce((a, f) => a + (f.ValorNeto ?? 0), 0)

  const p = filas[0]
  const anios = p.AnioAntiguedad ?? 0
  const meses = p.MesAntiguedad ?? 0

  return (
    <YStack gap="$2" paddingTop="$3" borderTopWidth={1} borderTopColor="$border">
      <XStack alignItems="center" gap="$1.5">
        <Wallet size={12} color="#94A3B8" />
        <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4} flex={1}>
          PRESTACIONES
        </Text>
        {/* La antigüedad al lado del título: es el porqué de estos números. */}
        <Text fontSize={10} color="$textMuted">
          {anios} {anios === 1 ? 'año' : 'años'}
          {meses > 0 ? ` ${meses} ${meses === 1 ? 'mes' : 'meses'}` : ''}
        </Text>
      </XStack>

      {/* El total primero y grande: es lo que se compara contra el monto que
          pide, y es la única cifra que decide algo. */}
      <XStack
        alignItems="center"
        gap="$2"
        padding="$2.5"
        borderRadius={10}
        backgroundColor="$backgroundSurface"
        borderWidth={1}
        borderColor="$border"
      >
        <Text fontSize={12} color="$textMuted" flex={1}>
          Le corresponderían hoy
        </Text>
        <Text fontSize={16} fontWeight="700" color="$text">
          {formatMonto(total)}
        </Text>
      </XStack>

      {/* El desglose, chico. Está para respaldar el total, no para leerse
          renglón por renglón. */}
      <YStack gap="$1">
        {filas.map(f => (
          <XStack key={`${f.Codigo}-${f.CodigoConcepto}`} alignItems="center" gap="$2">
            <Text fontSize={11} color="$textMuted" flex={1} numberOfLines={1}>
              {/* El nombre viene en MAYÚSCULAS_CON_GUIONES desde planilla. */}
              {(f.Concepto ?? '').replace(/_/g, ' ').toLowerCase()}
            </Text>
            <Text
              fontSize={11}
              // Lo que resta se distingue del resto sin tener que leer el signo.
              color={(f.ValorNeto ?? 0) < 0 ? '$error' : '$text'}
            >
              {formatMonto(f.ValorNeto)}
            </Text>
          </XStack>
        ))}
      </YStack>
    </YStack>
  )
}

export function CadenaFirmas({
  filas,
  puedeEditar,
  onEditar,
}: {
  filas: IAprobadorSolicitud[]
  /**
   * Si se puede cambiar quién firma. Solo con la solicitud en aprobación: una
   * ya cerrada no admite cambios en cómo se decidió.
   */
  puedeEditar: boolean
  onEditar: () => void
}) {
  // El lápiz vive en el encabezado de la sección y no por fila: lo que se edita
  // es la cadena entera — se pone y se quita en el mismo diálogo —, no una
  // persona suelta.
  const Encabezado = (
    <XStack alignItems="center" gap="$1.5">
      <Users size={12} color="#94A3B8" />
      <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4} flex={1}>
        APROBACIONES
      </Text>
      {puedeEditar && (
        <View hitSlop={10} pressStyle={{ opacity: 0.5 }} onPress={onEditar}>
          <Pencil size={14} color="#FF551A" />
        </View>
      )}
    </XStack>
  )

  if (filas.length === 0) {
    return (
      <YStack gap="$1.5" paddingTop="$2.5" borderTopWidth={1} borderTopColor="$border">
        {Encabezado}
        <Text fontSize={12} color="$textMuted">
          Todavía nadie la ha resuelto.
        </Text>
      </YStack>
    )
  }

  return (
    <YStack gap="$2" paddingTop="$2.5" borderTopWidth={1} borderTopColor="$border">
      {Encabezado}

      {filas.map(f => {
        const aprobo = f.Status_Code === ESTADO_SOLICITUD.APROBADO
        const rechazo = f.Status_Code === ESTADO_SOLICITUD.RECHAZADO
        const liberado = f.Status_Code === ESTADO_SOLICITUD.NO_REQUERIDA

        // El color dice el resultado sin leer: verde firmó, rojo mató la
        // solicitud, gris ya no cuenta, ámbar sigue esperando.
        const color = aprobo ? '#22C55E' : rechazo ? '#EF4444' : liberado ? '#94A3B8' : '#F59E0B'

        return (
          <YStack key={f.Id} gap="$1">
            <XStack alignItems="center" gap="$2">
              {aprobo
                ? <CheckCircle2 size={14} color={color} />
                : rechazo
                  ? <XCircle size={14} color={color} />
                  : liberado
                    ? <Users size={14} color={color} />
                    : <Clock size={14} color={color} />}

              <Text fontSize={13} color="$text" flex={1} numberOfLines={1}>
                {f.Aprobador || f.User_Code}
              </Text>

              <YStack alignItems="flex-end">
                <Text fontSize={12} fontWeight="600" color={color}>
                  {f.Status_Name ?? f.Status_Code ?? '-'}
                </Text>
                {/* La fecha solo si resolvió: en la pendiente no hay nada que
                    fechar, y repetir un guion en cada línea es ruido. */}
                {!!f.Resolution_Date && (
                  <Text fontSize={10} color="$textMuted">
                    {formatFechaHora(f.Resolution_Date)}
                  </Text>
                )}
              </YStack>

            </XStack>

            {/* El motivo, debajo de quien rechazó. Es lo que explica por qué
                murió la solicitud, y sin nombre al lado no se sabría de quién
                es. */}
            {!!f.Rejection_Reason && (
              <Text fontSize={12} color="$textMuted" lineHeight={17} paddingLeft={22}>
                {f.Rejection_Reason}
              </Text>
            )}
          </YStack>
        )
      })}
    </YStack>
  )
}

export function FichaEmpleado({ info }: { info: IEmpleadoInfo }) {
  const anios = antiguedad(info.FechaIngreso)
  const jefe = info.Jefe_InmediatoName || info.NameJefe

  return (
    // Misma sección plana que los datos del préstamo: sin caja, separada por
    // una línea. Ver la nota de allá.
    <YStack gap="$2" paddingTop="$2.5" borderTopWidth={1} borderTopColor="$border">
      <XStack alignItems="center" gap="$1.5">
        <IdCard size={12} color="#94A3B8" />
        <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
          DATOS DEL EMPLEADO
        </Text>
      </XStack>

      {/* La unidad de negocio se quitó: el departamento ya ubica a la persona
          y la unidad repetía casi la misma información en una línea más. */}
      {/* La antigüedad ARRIBA: es el dato con el que más se decide un
          préstamo, y antes quedaba al final de todo. */}
      <XStack gap="$2.5">
        <View flex={1}>
          {!!info.FechaIngreso && (
            <Dato
              icono={CalendarDays}
              etiqueta="Antigüedad"
              valor={anios ? anios : formatFecha(info.FechaIngreso)}
            />
          )}
        </View>
        <View flex={1}>
          {!!info.Posicion && (
            <Dato icono={Tag} etiqueta="Puesto" valor={info.Posicion} />
          )}
        </View>
      </XStack>

      {/* El departamento se quitó, igual que antes la unidad de negocio: el
          centro de costos ya ubica a la persona, y las tres decían casi lo
          mismo en tres renglones. */}
      <XStack gap="$2.5">
        <View flex={1}>
          {!!info.Centro_Costos && (
            <Dato icono={Briefcase} etiqueta="Centro de costos" valor={info.Centro_Costos} />
          )}
        </View>
        <View flex={1} />
      </XStack>

      {/* El jefe al final y a todo el ancho: es el nombre más largo del bloque
          y en media columna se partía en dos líneas. SIN línea divisoria: es el
          mismo grupo de datos. */}
      {!!jefe && <Dato icono={UserCog} etiqueta="Jefe inmediato" valor={jefe} />}
    </YStack>
  )
}

/**
 * Las tres pestañas.
 *
 * Se filtran por EstadoParaMi, que el servidor resuelve como LO QUE ESTA PERSONA
 * HIZO y no como el estado de la solicitud: la pantalla es el registro de sus
 * propias acciones.
 *
 * Vale para los dos niveles. Una que el primer aprobador ya aprobó y sigue
 * esperando a los demás está en "Aprobadas" para él, aunque la solicitud siga en
 * "En aprobación" — en "Pendientes" no tendría nada que hacer con ella. Los
 * asignados la ven en "Pendientes", que es donde les toca.
 *
 * PEND y EAPR van juntas en "Pendientes": las dos son solicitudes vivas que
 * quien mira todavía no tocó. EAPR solo aparece ahí para un Aprobador1 que no
 * fue el que la resolvió.
 */
/**
 * Si el PRIMER aprobador resuelve en el diálogo de esta pantalla (viejo) o en
 * DetalleAprobacionScreen (actual).
 *
 * Solo lo afecta a él: al asignado se le sigue mostrando el confirm, que para
 * su caso — sí o no sobre lo ya autorizado — es lo que corresponde.
 *
 * El diálogo con todo adentro se dejó entero por si se pide volver: con esto en
 * true vuelve a usarse, sin tocar nada más. Está tipado como boolean a
 * propósito — con el literal `false`, TypeScript deja de analizar el bloque y
 * los errores solo aparecerían el día que alguien lo reactive.
 */
const APROBAR_EN_DIALOGO: boolean = false

const TABS = [
  { key: 'PEND', label: 'Pendientes', estados: [ESTADO_SOLICITUD.PENDIENTE, ESTADO_SOLICITUD.EN_APROBACION] },
  { key: 'APR', label: 'Aprobadas', estados: [ESTADO_SOLICITUD.APROBADO] },
  { key: 'REJ', label: 'Rechazadas', estados: [ESTADO_SOLICITUD.RECHAZADO] },
] as const

/**
 * El resumen de lo que se está por resolver: un renglón por solicitud, con el
 * empleado y su monto.
 *
 * Es lo único que hace falta en la confirmación. La tarjeta completa ya se vio
 * en la lista; acá lo que importa es repasar QUIÉNES y CUÁNTO antes de firmar,
 * sobre todo en lote.
 */
function ResumenLote({ items }: { items: ISolicitudPrestamo[] }) {
  const total = items.reduce((suma, s) => suma + (s.Monto ?? 0), 0)

  return (
    <YStack
      gap="$1.5"
      padding="$3"
      borderRadius="$3"
      backgroundColor="$backgroundSurface"
      borderWidth={1}
      borderColor="$border"
    >
      {items.map(s => (
        <XStack key={s.Id} alignItems="center" gap="$2">
          <Text fontSize={13} color="$text" flex={1} numberOfLines={1}>
            {s.Solicitante || s.User_Code}
          </Text>
          <Text fontSize={14} fontWeight="700" color="$text">
            {formatMonto(s.Monto)}
          </Text>
        </XStack>
      ))}

      {/* El total solo con más de una: con una sola repetiría el mismo número
          dos veces. Con varias es el dato que no está en ningún renglón. */}
      {items.length > 1 && (
        <XStack
          alignItems="center"
          gap="$2"
          paddingTop="$2"
          marginTop="$1"
          borderTopWidth={1}
          borderTopColor="$border"
        >
          <Text fontSize={13} fontWeight="600" color="$textMuted" flex={1}>
            Total · {items.length} solicitudes
          </Text>
          <Text fontSize={15} fontWeight="700" color="$text">
            {formatMonto(total)}
          </Text>
        </XStack>
      )}
    </YStack>
  )
}

/** Colores e icono por estado. Mismo criterio que el resto del módulo. */
const VISUAL_ESTADO = (code: string | null) => {
  if (code === ESTADO_SOLICITUD.APROBADO) {
    return { color: '#22C55E', token: '$success' as const, Icono: CheckCircle2 }
  }
  if (code === ESTADO_SOLICITUD.RECHAZADO) {
    return { color: '#EF4444', token: '$error' as const, Icono: XCircle }
  }
  // PEND y EAPR comparten aspecto: las dos son "todavia no esta resuelta". El
  // contador de firmas es el que dice en cual de las dos va.
  return { color: '#F59E0B', token: '$warning' as const, Icono: Clock }
}

/** Una etiqueta con su valor. Se repite lo suficiente para valer un componente. */
/**
 * Una etiqueta con su valor, apilados.
 *
 * Antes iban en una línea con el valor alineado a la DERECHA. Eso funciona en
 * una columna, pero en dos deja cada valor pegado al borde de su media columna,
 * lejos de la etiqueta que lo nombra: el bloque se lee como cuatro cosas
 * sueltas en vez de dos pares. Apilados, las columnas quedan a plomo.
 */
export function Dato({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: React.ComponentType<any>
  etiqueta: string
  valor: string
}) {
  return (
    // Sin gap entre la etiqueta y el valor: son UN dato, y separarlos hacía que
    // cada celda ocupara casi el doble de alto del texto que lleva.
    <YStack>
      <XStack gap="$1.5" alignItems="center">
        <Icono size={11} color="#94A3B8" />
        <Text fontSize={10} color="$textMuted">
          {etiqueta}
        </Text>
      </XStack>
      <Text fontSize={13} color="$text" fontWeight="600" lineHeight={18}>
        {valor}
      </Text>
    </YStack>
  )
}

export default function AprobacionPrestamosScreen() {
  const [solicitudes, setSolicitudes] = useState<ISolicitudPrestamo[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  // Arranca en pendientes: es a lo que se entra a esta pantalla.
  const [tab, setTab] = useState<string>('PEND')
  const { showToast } = useShowToast()

  // La solicitud sobre la que se está actuando, y con qué intención. Se guarda
  // la solicitud entera y no solo el Id: el diálogo muestra el monto y a quién
  // se le está aprobando.
  // Los Ids sobre los que se está actuando, y con qué intención. Se guardan
  // los Ids y no las solicitudes: el diálogo arma el resumen buscándolas en la
  // lista, que ya está cargada.
  const [aprobando, setAprobando] = useState<number[] | null>(null)
  const [rechazando, setRechazando] = useState<number[] | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  // La cadena que le toca a cada solicitud del lote, y lo que quedó marcado.
  //
  // Una cadena POR SOLICITUD y no una sola lista: los aprobadores salen de la
  // configuración de la combinación del solicitante — cómo le pagan y de qué
  // área es — así que dos solicitudes del mismo lote pueden ir a gente
  // distinta. Con una lista única se le mandaría a todos los mismos.
  const [cadenas, setCadenas] = useState<ICadenaConfigurada[]>([])
  const [marcadosPorId, setMarcadosPorId] = useState<Record<number, string[]>>({})
  const [cargandoCadenas, setCargandoCadenas] = useState(false)

  // Las solicitudes marcadas para resolver en lote. Vacío = nadie seleccionado,
  // y ahí cada tarjeta muestra sus propios botones.
  const [seleccion, setSeleccion] = useState<number[]>([])

  // Qué tarjetas están desplegadas. Arrancan cerradas: con el empleado, el
  // préstamo y la cadena, una tarjeta abierta llena la pantalla, y del listado
  // lo que hace falta de un golpe es de quién es y cuánto pide.
  const [abiertas, setAbiertas] = useState<number[]>([])

  // Qué pasó con la cadena de cada solicitud: quién aprobó, quién rechazó y
  // quién sigue pendiente. Se trae al abrir la tarjeta y solo para el primer
  // aprobador; ver `desplegar`.
  const [firmas, setFirmas] = useState<Record<number, IAprobadorSolicitud[]>>({})
  const [cargandoFirmas, setCargandoFirmas] = useState<number | null>(null)

  // Las tasas entre las que puede elegir, y la elegida.
  //
  // La lista viene VACÍA si no tiene el acceso 'ElegirTasaInteres' — el
  // servidor lo resuelve — y entonces el selector ni se pinta: el préstamo va
  // con la tasa principal. Esta pantalla no comprueba accesos, solo pinta lo
  // que le devuelvan.
  const [tasas, setTasas] = useState<ITasaInteres[]>([])
  const [tasaElegida, setTasaElegida] = useState<number | null>(null)

  // Las prestaciones del solicitante: con qué respaldo cuenta si saliera hoy.
  //
  // Igual que las tasas, viene vacía si no tiene el acceso 'VerPrestaciones' y
  // entonces la sección ni se pinta. Es solo para decidir; no se guarda nada.
  const [prestaciones, setPrestaciones] = useState<IPrestacionEmpleado[]>([])

  // La edición de la cadena: qué solicitud se está editando, quiénes se pueden
  // elegir y quiénes están marcados.
  //
  // Los candidatos son los CONFIGURADOS para su combinación, más los que ya
  // estén en la cadena aunque la configuración haya cambiado desde entonces —
  // si no, alguien que ya está firmando desaparecería de la lista y no se
  // podría sacar.
  const [editando, setEditando] = useState<number | null>(null)
  const [candidatos, setCandidatos] = useState<
    { code: string; nombre: string; estado: string | null; fijo: boolean }[]
  >([])
  const [marcadosCadena, setMarcadosCadena] = useState<string[]>([])
  const [cargandoEdicion, setCargandoEdicion] = useState(false)
  const [guardandoCadena, setGuardandoCadena] = useState(false)

  // Navegación por notificación: se resalta la solicitud del aviso y se baja
  // hasta ella. `cardY` guarda dónde quedó cada tarjeta para poder hacerlo.
  const route = useRoute()
  const navigation = useNavigation<any>()
  const scrollRef = useRef<any>(null)
  const cardY = useRef<Record<number, number>>({})
  const [resaltada, setResaltada] = useState<number | null>(null)
  const [porEnfocar, setPorEnfocar] = useState<number | null>(null)

  /**
   * Si quien entró es el primer aprobador.
   *
   * Lo dice el servidor en cada solicitud — depende de su acceso, que esta
   * pantalla no conoce — y viene igual en todas: es de la persona, no de la
   * solicitud. Se lee con `some` y no de la primera para no depender de que la
   * lista traiga algo.
   *
   * Decide cuánto se muestra, NO qué se puede hacer: eso lo resuelve la API.
   */
  const esPrimerNivel = solicitudes.some(s => s.EsPrimerNivel)

  const consultar = useCallback(async () => {
    try {
      const response = await cooperativaService.getSolicitudesPrestamo()

      if (response?.Success) {
        setSolicitudes(response.Data ?? [])
      } else {
        setSolicitudes([])
        showToast(
          'error',
          'Error',
          response?.ErrorMessage || 'No se pudieron cargar las solicitudes',
          5000,
          'top',
        )
      }
    } catch (err) {
      setSolicitudes([])
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    }
    // showToast queda fuera: cambia de identidad en cada render y recargaria en
    // bucle.
  }, [])

  // useFocusEffect y no useEffect: el navegador mantiene las pantallas
  // montadas, asi que un efecto de montaje solo corre la primera vez y al
  // volver a entrar se verian solicitudes ya resueltas.
  useFocusEffect(
    useCallback(() => {
      ;(async () => {
        setCargando(true)
        await consultar()
        setCargando(false)
      })()
    }, [consultar]),
  )

  const onRefresh = async () => {
    setRefrescando(true)
    await consultar()
    setRefrescando(false)
  }

  /**
   * Lleva a una solicitud concreta: cambia a su pestaña, la resalta y baja
   * hasta ella.
   *
   * La PESTAÑA es lo que distingue esto de otras pantallas con resaltado: la
   * solicitud del aviso puede estar en cualquiera de las tres, y sin cambiar de
   * pestaña se resaltaría algo que no se ve.
   */
  const enfocarSolicitud = useCallback((id: number, lista: ISolicitudPrestamo[]) => {
    const s = lista.find(x => x.Id === id)
    if (!s) return

    const destino = TABS.find(t => t.estados.includes(s.EstadoParaMi as never))
    if (destino) setTab(destino.key)

    setResaltada(id)

    // Espera al re-render: al cambiar de pestaña la lista se rearma entera y
    // las posiciones de antes ya no sirven.
    setTimeout(() => {
      const y = cardY.current[id]
      if (y != null) scrollRef.current?.scrollTo?.({ y: Math.max(y - 12, 0), animated: true })
    }, 400)

    // El resaltado se apaga solo: es para encontrarla, no un estado.
    setTimeout(() => setResaltada(null), 3000)
  }, [])

  // 1) Toma el id que viene del aviso y limpia el parámetro, para no volver a
  //    enfocar lo mismo cada vez que se entre a la pantalla.
  useEffect(() => {
    const target = Number((route.params as any)?.solicitud ?? 0)
    if (target > 0) {
      setPorEnfocar(target)
      navigation.setParams({ solicitud: undefined } as never)
    }
  }, [route.params, navigation])

  // 2) Lo aplica cuando ya hay datos: si se hiciera junto con el paso 1,
  //    la lista todavía estaría vacía y no habría nada que resaltar.
  useEffect(() => {
    if (!porEnfocar || cargando || solicitudes.length === 0) return

    enfocarSolicitud(porEnfocar, solicitudes)
    setPorEnfocar(null)
  }, [porEnfocar, solicitudes, cargando, enfocarSolicitud])

  /**
   * Abre el diálogo de aprobar.
   *
   * Para el PRIMER aprobador trae además la cadena de cada solicitud, ya
   * marcada con lo que dice la configuración para el área y la planilla del
   * solicitante. Puede desmarcar: la decisión sigue siendo suya.
   *
   * Para un asignado NO se pide nada: él solo aprueba o rechaza lo suyo.
   * Quiénes más firman no es asunto suyo, y el endpoint exige el acceso de
   * primer nivel — pedirlo le daría un "sin permiso" que además no significa
   * nada para él.
   */
  const abrirAprobar = async (ids: number[]) => {
    // Ahora se resuelve en su propia pantalla: con la tasa, las prestaciones,
    // la cadena y los datos del empleado, la decisión ya no cabía en un modal.
    //
    // La solicitud viaja entera: el listado ya la tiene cargada, con el
    // empleado incluido, así que volver a pedirla sería un viaje para lo mismo.
    /* ─────────────────────────────────────────────────────────────────────
       DOS CAMINOS, SEGÚN QUIÉN APRUEBA

       PRIMER APROBADOR → pantalla de detalle. Él decide: tasa, prestaciones y
       quiénes firman después. Eso ya no cabía en un modal.

       ASIGNADO → el confirm de siempre. Para él no hay nada que decidir: su
       firma es sí o no sobre lo que ya se autorizó, y mandarlo a otra pantalla
       sería un paso de más para un solo toque.

       El diálogo con TODO adentro — el que usaba también el primer aprobador —
       se dejó entero por si se pide volver: basta poner APROBAR_EN_DIALOGO en
       true y deja de navegarse.
       ───────────────────────────────────────────────────────────────────── */
    if (!APROBAR_EN_DIALOGO && esPrimerNivel) {
      const s = solicitudes.find(x => x.Id === ids[0])
      if (s) navigation.navigate('detalleAprobacion', { solicitud: s })
      return
    }

    setAprobando(ids)
    setCadenas([])
    setMarcadosPorId({})

    if (!esPrimerNivel) return

    setCargandoCadenas(true)

    // Las prestaciones del solicitante, en paralelo. Si no tiene el acceso, la
    // lista viene vacía y la sección no se pinta.
    setPrestaciones([])
    cooperativaService
      .getPrestaciones(ids)
      .then(r => setPrestaciones(r?.Success ? r.Data ?? [] : []))
      // Sin prestaciones se aprueba igual: es contexto para decidir, no el
      // dato principal.
      .catch(() => setPrestaciones([]))

    // Las tasas, en paralelo con la cadena. Si no puede elegir, la lista viene
    // vacía y no se pinta nada.
    cooperativaService
      .getTasasInteres()
      .then(r => {
        const lista = r?.Success ? r.Data ?? [] : []
        setTasas(lista)

        // Preseleccionada la principal: es con la que iría el préstamo si no
        // tocara nada, así que el selector arranca diciendo la verdad.
        setTasaElegida(
          (lista.find(t => t.TasaPrincipal) ?? lista[0])?.TasaId ?? null,
        )
      })
      .catch(() => {
        // Sin tasas se aprueba igual: va con la principal, que es lo que
        // pasaba antes de que esto existiera.
        setTasas([])
        setTasaElegida(null)
      })

    try {
      const response = await cooperativaService.getCadenasConfiguradas(ids)
      const lista = response?.Success ? response.Data ?? [] : []

      setCadenas(lista)
      setMarcadosPorId(
        Object.fromEntries(
          lista.map(c => [
            c.Id,
            // Los inactivos no se marcan solos: quedan a la vista para que se
            // arregle la configuración, pero mandarle una aprobación a una
            // cuenta dada de baja trabaría la solicitud para siempre.
            c.Aprobadores.filter(a => a.Activo).map(a => a.User_Code ?? ''),
          ]),
        ),
      )

      if (!response?.Success && response?.ErrorMessage)
        showToast('error', 'Error', response.ErrorMessage, 5000, 'top')
    } catch (err) {
      // Sin cadena se puede aprobar igual: termina ahí. Es lo mismo que pasa
      // cuando no se marca a nadie.
      setCadenas([])
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setCargandoCadenas(false)
    }
  }

  /**
   * Abre o cierra una tarjeta y, al abrirla, trae qué pasó con la cadena.
   *
   * SOLO para el primer aprobador: él es quien la armó y quien tiene que poder
   * seguirla. Al asignado no le corresponde ver quiénes más firman.
   *
   * Se pide al abrir y no con el listado: serían N consultas más para pintar
   * una pantalla donde la mayoría de las tarjetas nunca se abren. Y una sola
   * vez por solicitud — lo que ya se trajo queda en `firmas`.
   */
  const desplegar = async (id: number) => {
    const abriendo = !abiertas.includes(id)

    setAbiertas(prev => (abriendo ? [...prev, id] : prev.filter(x => x !== id)))

    if (!abriendo || !esPrimerNivel || firmas[id]) return

    setCargandoFirmas(id)
    try {
      const response = await cooperativaService.getAprobacionesPrestamo(id)

      // Vacío también se guarda: es una respuesta válida — una solicitud recién
      // creada no tiene cadena — y sin guardarlo se volvería a consultar en
      // cada apertura.
      setFirmas(prev => ({ ...prev, [id]: response?.Success ? response.Data ?? [] : [] }))
    } catch {
      // Sin la cadena la tarjeta se muestra igual: es contexto, no el dato
      // principal. No se guarda nada para que se reintente al volver a abrir.
    } finally {
      setCargandoFirmas(null)
    }
  }

  const seleccionar = (id: number) =>
    setSeleccion(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  /**
   * Abre la edición de la cadena de una solicitud.
   *
   * Arma la lista de candidatos con los CONFIGURADOS para su combinación más
   * los que ya estén en la cadena: la configuración pudo cambiar desde que se
   * armó, y quien ya está firmando tiene que poder salir.
   *
   * Los que ya resolvieron van FIJOS, no como casilla: su firma —o su rechazo—
   * es parte de cómo se decidió y no se borra.
   */
  const abrirEdicion = async (id: number) => {
    setEditando(id)
    setCandidatos([])
    setMarcadosCadena([])
    setCargandoEdicion(true)

    try {
      // La cadena se vuelve a pedir si no está cargada, en vez de confiar en lo
      // que trajo el acordeón.
      //
      // NO es un detalle: si acá quedara vacía, el diálogo saldría con todo
      // desmarcado y guardar borraría a los que ya estaban. Con la lista de
      // verdad, lo que se ve es lo que hay.
      const [conf, cadena] = await Promise.all([
        cooperativaService.getCadenasConfiguradas([id]),
        firmas[id]
          ? Promise.resolve(null)
          : cooperativaService.getAprobacionesPrestamo(id),
      ])

      const enCadena =
        firmas[id] ?? (cadena?.Success ? cadena.Data ?? [] : [])

      // Se guarda para que la tarjeta la muestre sin volver a pedirla.
      if (!firmas[id]) setFirmas(prev => ({ ...prev, [id]: enCadena }))

      const configurados = conf?.Success
        ? conf.Data?.find(c => c.Id === id)?.Aprobadores ?? []
        : []

      // Indexado por código para no repetir a quien esté en las dos listas.
      const porCodigo = new Map<
        string,
        { code: string; nombre: string; estado: string | null; fijo: boolean }
      >()

      configurados.forEach(a => {
        const code = a.User_Code ?? ''
        if (code)
          porCodigo.set(code, { code, nombre: a.Nombre || code, estado: null, fijo: false })
      })

      enCadena
        // Todos MENOS la firma del primer aprobador: es la que autorizó el
        // préstamo y no se edita.
        .filter(f => !esFirmaDelPrimero(f))
        .forEach(f => {
          const code = f.User_Code ?? ''
          if (!code) return

          const resuelto = f.Status_Code !== ESTADO_SOLICITUD.PENDIENTE

          porCodigo.set(code, {
            code,
            nombre: f.Aprobador || porCodigo.get(code)?.nombre || code,
            estado: resuelto ? f.Status_Name ?? f.Status_Code : null,
            fijo: resuelto,
          })
        })

      const lista = Array.from(porCodigo.values())
      setCandidatos(lista)

      // Marcados: los que YA están en la cadena — los que dejó al aprobar. No
      // los configurados: se está editando lo que existe, no rearmándolo desde
      // cero.
      //
      // SOLO los pendientes. Los que ya resolvieron van aparte, como filas
      // fijas, y `guardarCadena` los vuelve a agregar al mandar. Si entraran
      // acá, como no se pueden desmarcar, la lista nunca llegaría a cero y el
      // aviso de "así queda aprobada" no aparecería jamás.
      setMarcadosCadena(
        enCadena
          .filter(f => !esFirmaDelPrimero(f) && f.Status_Code === ESTADO_SOLICITUD.PENDIENTE)
          .map(f => f.User_Code ?? '')
          .filter(Boolean),
      )
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setCargandoEdicion(false)
    }
  }

  /**
   * Si al guardar la solicitud queda aprobada del todo: cuando no dejó a nadie.
   *
   * El MÍNIMO no entra en esta cuenta. El mínimo dice cuántas de las firmas
   * pedidas alcanzan para cerrar; si no se pide ninguna, no hay nada que
   * alcanzar y la solicitud se cierra con la del primer aprobador. Meterlo acá
   * solo confundiría: "pide 2 firmas" no impide dejar la cadena vacía.
   */
  const cerrariaAlGuardar =
    !!editando && !cargandoEdicion && marcadosCadena.length === 0

  /**
   * Guarda la cadena editada.
   *
   * Puede CERRAR la solicitud: si con los que quedan ya se cumple el mínimo, el
   * servidor la aprueba y la manda a la cooperativa. Por eso se recarga el
   * listado y no solo la cadena.
   */
  const guardarCadena = async () => {
    if (!editando) return

    setGuardandoCadena(true)
    try {
      // Los fijos van SIEMPRE: no son elegibles, pero forman parte de la cadena
      // y omitirlos sería pedir que se borren.
      const codigos = Array.from(new Set([
        ...marcadosCadena,
        ...candidatos.filter(c => c.fijo).map(c => c.code),
      ]))

      const response = await cooperativaService.actualizarCadena(editando, codigos)

      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo guardar', 6000, 'top')
        return
      }

      showToast('success', 'Listo', response.SuccessMessage || '', 5000, 'top')

      // La cadena guardada quedó vieja. Se olvida solo la de ESTA solicitud:
      // las demás no cambiaron y volver a pedirlas sería un viaje en vano.
      setFirmas(prev => {
        const copia = { ...prev }
        delete copia[editando]
        return copia
      })
      setAbiertas(prev => prev.filter(x => x !== editando))
      setEditando(null)

      await consultar()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setGuardandoCadena(false)
    }
  }

  /** Marca o desmarca a un aprobador, dentro de la cadena de UNA solicitud. */
  const marcar = (id: number, code: string) =>
    setMarcadosPorId(prev => {
      const actuales = prev[id] ?? []

      return {
        ...prev,
        [id]: actuales.includes(code)
          ? actuales.filter(c => c !== code)
          : [...actuales, code],
      }
    })

  /** Cuántas firmas quedaron marcadas en todo el lote. */
  const totalMarcados = Object.values(marcadosPorId).reduce((n, l) => n + l.length, 0)

  /**
   * Manda la resolución de todo el lote. `accion` es 'APR' o 'REJ'.
   *
   * Recibe la lista y no una solicitud: el mismo camino sirve para una sola
   * (los botones de la tarjeta) y para varias (la barra de selección). El
   * servidor resuelve cada una por separado y devuelve el resumen.
   */
  const resolver = async (ids: number[], accion: string) => {
    if (accion === ESTADO_SOLICITUD.RECHAZADO && !motivo.trim()) {
      setErrorMotivo('Escribí el motivo del rechazo')
      return
    }

    setEnviando(true)
    try {
      const response = await cooperativaService.resolverPrestamo({
        Ids: ids,
        Accion: accion,
        Motivo: accion === ESTADO_SOLICITUD.RECHAZADO ? motivo.trim() : undefined,
        // Una cadena por solicitud, y no una lista para todo el lote: cada
        // solicitante tiene la suya según su área y su planilla.
        //
        // Solo el primer nivel las manda: es el único que arma la cadena. El
        // asignado resuelve SU firma y no decide quién sigue, así que mandar
        // algo desde su pantalla no tendría sentido — el servidor lo ignora
        // igual, pero es mejor no mandarlo.
        Cadenas:
          esPrimerNivel && accion === ESTADO_SOLICITUD.APROBADO
            ? ids.map(id => ({ Id: id, Aprobadores: marcadosPorId[id] ?? [] }))
            : undefined,
        // La tasa solo viaja si hay selector, o sea si puede elegirla. El
        // servidor lo vuelve a comprobar: esconder el selector es comodidad,
        // no permiso.
        TasaId:
          accion === ESTADO_SOLICITUD.APROBADO && tasas.length > 0 && tasaElegida
            ? tasaElegida
            : undefined,
      })

      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo resolver', 6000, 'top')
        return
      }

      // El mensaje lo arma el servidor: sabe si quedó registrada en la
      // cooperativa, si faltan firmas, o si murió.
      showToast('success', 'Listo', response.SuccessMessage || '', 5000, 'top')

      setAprobando(null)
      setRechazando(null)
      setMotivo('')
      setCadenas([])
      setMarcadosPorId({})
      setSeleccion([])

      // La cadena que se haya visto quedó vieja: acaba de cambiar. Se cierran
      // las tarjetas y se olvida lo cargado, para que al volver a abrirlas se
      // pida de nuevo. Sin esto, quien apruebe y reabra la tarjeta seguiría
      // viendo su firma como pendiente.
      setAbiertas([])
      setFirmas({})
      await consultar()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setEnviando(false)
    }
  }

  // Cuantas hay en cada pestaña. Se cuenta sobre la lista completa y no sobre
  // la filtrada, para poder mostrar el numero en las tres a la vez.
  const contar = (key: string) => {
    const t = TABS.find(x => x.key === key)
    if (!t) return 0
    return solicitudes.filter(s => t.estados.includes(s.EstadoParaMi as never)).length
  }

  const tabActual = TABS.find(t => t.key === tab) ?? TABS[0]
  const visibles = solicitudes.filter(s => tabActual.estados.includes(s.EstadoParaMi as never))

  // Las que le tocan resolver AHORA. Es lo que de verdad tiene que atender, y
  // no coincide con "pendientes": un Aprobador2 ve solicitudes en curso donde
  // ya firmo.
  const mias = solicitudes.filter(s => s.PuedeResolver).length

  // Solo se pueden seleccionar las que esta persona puede resolver. Marcar una
  // que no le toca solo daria un error al confirmar.
  const seleccionables = visibles.filter(s => s.PuedeResolver)

  // Las seleccionadas que siguen a la vista. Si se cambia de pestaña, lo que
  // quedo marcado en la otra ya no cuenta: confirmar algo que no se ve seria
  // resolver a ciegas.
  const enLote = seleccionables.filter(s => seleccion.includes(s.Id))

  /** Las solicitudes de un lote, para armar el resumen del diálogo. */
  const delLote = (ids: number[]) => solicitudes.filter(s => ids.includes(s.Id))

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitudes de préstamo
      </Text>
    ),
    right: (
      <View onPress={onRefresh} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
        <RotateCwStyled size={18} />
      </View>
    ),
  })

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  return (
    <ScrollView
      ref={scrollRef}
      flex={1}
      backgroundColor="$backgroundPage"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
    >
      {/* Las tres pestañas. Van arriba de todo: eligen qué se está mirando. */}
      <XStack
        gap="$1"
        padding="$1"
        borderRadius="$4"
        backgroundColor="$backgroundSurface"
        borderWidth={1}
        borderColor="$border"
      >
        {TABS.map(t => {
          const activa = t.key === tab
          const cuantas = contar(t.key)

          return (
            <View
              key={t.key}
              flex={1}
              paddingVertical="$2.5"
              borderRadius="$3"
              alignItems="center"
              backgroundColor={activa ? '$primary' : 'transparent'}
              pressStyle={{ opacity: 0.7 }}
              onPress={() => setTab(t.key)}
            >
              <Text
                fontSize={13}
                fontWeight={activa ? '700' : '600'}
                color={activa ? 'white' : '$textMuted'}
              >
                {t.label}{cuantas > 0 ? ` (${cuantas})` : ''}
              </Text>
            </View>
          )
        })}
      </XStack>

      {/* ─────────────────────────────────────────────────────────────────────
          APROBACIÓN MASIVA — DESACTIVADA, NO BORRADA

          Se quitó de la pantalla, no del código: puede volver a pedirse. Para
          reactivarla, descomentar este bloque, el de "Seleccionar todo" de más
          abajo y la casilla de cada tarjeta (buscar el mismo aviso).

          Por qué se desactivó: al aprobar hay que elegir tasa, revisar
          prestaciones y confirmar la cadena, y esas tres cosas son de UNA
          solicitud. En lote habría que repetirlas por cada una dentro del mismo
          diálogo, o aplicar a todas lo decidido para una — que es peor.

          La barra del lote. Aparece solo con algo marcado: sin selección la
          pantalla se lee igual y cada tarjeta tiene sus botones.

          Mismo patrón que la barra de Horas Extra: una sola línea, con el
          conteo y el total a la izquierda y los botones chicos a la derecha.
          ───────────────────────────────────────────────────────────────────── */}
      {false && enLote.length > 0 && (
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
              {enLote.length} seleccionada(s)
            </Text>
            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
              {formatMonto(enLote.reduce((a, x) => a + (x.Monto ?? 0), 0))}
            </Text>
          </YStack>

          <Button
            height={36} borderRadius={10} paddingHorizontal="$3"
            backgroundColor="$backgroundSurface"
            borderWidth={1} borderColor="$border"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => setSeleccion([])}
          >
            <Text fontSize={12} fontWeight="600" color="$textMuted">Quitar</Text>
          </Button>

          {/* Rechazar va solo con el ícono, como en Horas Extra: es la acción
              destructiva y no debe competir en peso con aprobar. */}
          <Button
            height={36} borderRadius={10} paddingHorizontal="$3"
            backgroundColor="$backgroundSurface"
            borderWidth={1} borderColor="$border"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => {
              setRechazando(enLote.map(x => x.Id))
              setMotivo('')
              setErrorMotivo('')
            }}
          >
            <X size={16} color="#EF4444" />
          </Button>

          <Button
            height={36} borderRadius={10} paddingHorizontal="$3"
            backgroundColor="$success"
            pressStyle={{ opacity: 0.85 }}
            onPress={() => abrirAprobar(enLote.map(x => x.Id))}
          >
            <XStack alignItems="center" gap="$1.5">
              <Check size={16} color="white" />
              <Text fontSize={13} fontWeight="700" color="white">Aprobar</Text>
            </XStack>
          </Button>
        </XStack>
      )}

      {/* APROBACIÓN MASIVA — DESACTIVADA. Ver el aviso de la barra del lote.

          Cuántas le tocan resolver, y el atajo para tomarlas todas. Solo
          aparecía si había MÁS DE UNA que pudiera resolver: con una sola, la
          casilla de la tarjeta ya alcanza. */}
      {false && seleccionables.length > 1 && (
        <XStack
          alignItems="center"
          gap="$2"
          paddingHorizontal="$1"
          paddingVertical="$1"
          pressStyle={{ opacity: 0.6 }}
          onPress={() =>
            // Si ya están todas, el mismo toque las suelta. Es el
            // comportamiento que se espera de un "seleccionar todo".
            setSeleccion(
              enLote.length === seleccionables.length ? [] : seleccionables.map(x => x.Id),
            )
          }
        >
          {enLote.length === seleccionables.length
            ? <SquareCheck size={19} color="#FF551A" />
            : <Square size={19} color="#94A3B8" />}

          <Text fontSize={13} fontWeight="600" color="$textMuted" flex={1}>
            {enLote.length === seleccionables.length
              ? 'Quitar la selección'
              : `Seleccionar todo`}
          </Text>
        </XStack>
      )}

      {visibles.length === 0 ? (
        <YStack
          gap="$3"
          padding="$5"
          borderRadius="$4"
          backgroundColor="$backgroundSurface"
          borderWidth={1}
          borderColor="$border"
          alignItems="center"
          marginTop="$4"
        >
          <Inbox size={30} color="#94A3B8" />
          <Text fontSize={15} color="$text" textAlign="center">
            No hay solicitudes {tabActual.label.toLowerCase()}.
          </Text>
          <Text fontSize={13} color="$textMuted" textAlign="center">
            Deslice hacia abajo para volver a consultar.
          </Text>
        </YStack>
      ) : (
        visibles.map(s => {
          const { color, token, Icono } = VISUAL_ESTADO(s.Status_Code)
          const frecuencia = CADA_PAGO[(s.TipoPlanilla ?? '').toUpperCase()]
          const abierta = abiertas.includes(s.Id)

          return (
            <YStack
              key={s.Id}
              // Dónde quedó, para poder bajar hasta ella cuando se llega desde
              // una notificación.
              onLayout={(e: any) => { cardY.current[s.Id] = e.nativeEvent.layout.y }}
              // Apretada a propósito: con gap $3 y padding $4, una tarjeta con
              // tres secciones dejaba más aire que contenido y en el teléfono
              // apenas entraban dos solicitudes por pantalla.
              gap="$2.5"
              padding="$3.5"
              borderRadius="$4"
              // Seleccionada: fondo teñido y borde naranja. Con solo la
              // casilla marcada, en una lista de diez no se distinguía de un
              // vistazo cuáles iban en el lote.
              //
              // El GROSOR no cambia. Antes pasaba de 1 a 2px y todo el
              // contenido se corría un pixel al marcar: la tarjeta daba un
              // saltito y se veía rara. Solo cambia el color.
              backgroundColor={seleccion.includes(s.Id) ? '$primaryOpacity2' : '$backgroundElevated'}
              borderWidth={1}
              // La resaltada por notificación usa el mismo naranja que la
              // seleccionada: son dos formas de decir "esta es". Se apaga sola
              // a los 3 segundos, así que no compite mucho tiempo.
              borderColor={
                resaltada === s.Id || seleccion.includes(s.Id) ? '$primary' : '$border'
              }
              {...shadows.sm}
              // El toque va en la TARJETA, no en el encabezado: se abre desde
              // cualquier punto. Los botones y la casilla que están dentro
              // detienen la propagación con su propio onPress, así que tocar
              // "Aprobar" no despliega además el detalle.
              pressStyle={s.Empleado ? { opacity: 0.85 } : undefined}
              onPress={s.Empleado ? () => desplegar(s.Id) : undefined}
            >
              {/* Encabezado: quién y cuánto. Las dos preguntas que se hacen
                  primero al mirar una solicitud. */}
              <XStack gap="$3" alignItems="flex-start">
                {/* APROBACIÓN MASIVA — DESACTIVADA. Ver el aviso de la barra
                    del lote. La casilla iba solo en las que puede resolver:
                    marcar una que no le toca solo daría un error al confirmar.

                    Con el lote apagado queda el ícono de persona en todas, que
                    es lo que había antes de que existiera la selección. */}
                {false && s.PuedeResolver ? (
                  <View
                    marginTop={1}
                    pressStyle={{ opacity: 0.6 }}
                    hitSlop={8}
                    onPress={() => seleccionar(s.Id)}
                  >
                    {seleccion.includes(s.Id)
                      ? <SquareCheck size={20} color="#FF551A" />
                      : <Square size={20} color="#94A3B8" />}
                  </View>
                ) : (
                  <View marginTop={2}>
                    <User size={18} color="#94A3B8" />
                  </View>
                )}

                <YStack flex={1} gap="$0.5">
                  <Text fontSize={15} fontWeight="700" color="$text">
                    {s.Solicitante || s.User_Code || 'Socio'}
                  </Text>
                  <Text fontSize={11} color="$textMuted">
                    Código {s.COD_PERSONAL || '-'}
                    {frecuencia ? ` · planilla ${frecuencia}` : ''}
                  </Text>
                </YStack>

                {/* El monto y el estado, lo que se lee sin abrir. Sin onPress
                    propio: el de la tarjeta ya cubre esta zona. */}
                <XStack alignItems="center" gap="$2">
                  <YStack alignItems="flex-end" gap="$1">
                    <Text fontSize={17} fontWeight="700" color="$text">
                      {formatMonto(s.Monto)}
                    </Text>

                    {/* El estado y, a su lado, el avance de la cadena. Antes el
                        avance era un renglón propio debajo del encabezado
                        —"1 de 3 aprobaciones"— y se comía un alto entero para
                        dos números. Acá, en '1/3', dice lo mismo sin ocupar
                        línea.

                        Solo para el primer aprobador: al asignado, cuánta gente
                        más mira la solicitud no le cambia nada de lo que tiene
                        que decidir. */}
                    <XStack alignItems="center" gap="$1.5">
                      <Icono size={12} color={color} />
                      <Text fontSize={11} fontWeight="600" color={token}>
                        {s.Status_Name || s.Status_Code}
                      </Text>

                      {s.EsPrimerNivel && !!s.AprobacionesTotal && s.AprobacionesTotal > 0 && (
                        <XStack alignItems="center" gap="$1" marginLeft="$1">
                          <Users size={10} color="#94A3B8" />
                          <Text fontSize={10} fontWeight="600" color="$textMuted">
                            {s.AprobacionesHechas ?? 0}/{s.AprobacionesTotal}
                          </Text>
                        </XStack>
                      )}
                    </XStack>
                  </YStack>

                </XStack>
              </XStack>

              {/* Los datos del préstamo, en su propio bloque y con su título.
                  Antes iban sueltos debajo del encabezado y se mezclaban a la
                  vista con los del empleado: son dos cosas que se leen con
                  intenciones distintas — qué se pide, y a quién. */}
              {/* Sin card propia: una tarjeta dentro de otra tarjeta hace que
                  la solicitud se lea como dos cosas apiladas, y encima el fondo
                  gris se ensuciaba sobre el teñido de la seleccionada.

                  Ahora es una SECCIÓN: una línea que la separa arriba y su
                  etiqueta. Misma agrupación, sin la caja. */}
              <YStack gap="$2" paddingTop="$2.5" borderTopWidth={1} borderTopColor="$border">
                <XStack alignItems="center" gap="$1.5">
                  <Coins size={12} color="#94A3B8" />
                  <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                    DATOS DEL PRÉSTAMO
                  </Text>
                </XStack>

                {/* Tres columnas: lo que pide, en cuánto tiempo y cuándo.
                    Los tres son cortos y así el bloque entra en un renglón.

                    Una celda que no aplica se deja VACÍA en vez de reacomodar:
                    si el contenido saltara de columna, dos tarjetas seguidas no
                    se podrían comparar de un vistazo. */}
                <XStack gap="$2.5">
                  <View flex={1}>
                    <Dato
                      icono={Tag}
                      etiqueta="Tipo"
                      valor={s.TipoSolicitudDesc || `Tipo ${s.TipoSolicitudId}`}
                    />
                  </View>
                  <View flex={1}>
                    <Dato
                      icono={CalendarDays}
                      etiqueta="Plazo"
                      valor={s.PlazoDesc || `Plazo ${s.PlazoId}`}
                    />
                  </View>
                  <View flex={1}>
                    <Dato
                      icono={Clock}
                      etiqueta="Solicitada"
                      valor={formatFechaHora(s.Creation_Date)}
                    />
                  </View>
                </XStack>

                {/* Las deducciones en el mismo grid, solo si las lleva: un
                    préstamo a secas no descuenta de ningún salario extra, y
                    mostrar dos ceros hace pensar que falta un dato. */}
                {(s.Deduccion13vo > 0 || s.Deduccion14vo > 0) && (
                  <XStack gap="$2.5">
                    <View flex={1}>
                      {s.Deduccion13vo > 0 && (
                        <Dato icono={Coins} etiqueta="Del 13.º" valor={formatMonto(s.Deduccion13vo)} />
                      )}
                    </View>
                    <View flex={1}>
                      {s.Deduccion14vo > 0 && (
                        <Dato icono={Coins} etiqueta="Del 14.º" valor={formatMonto(s.Deduccion14vo)} />
                      )}
                    </View>
                    <View flex={1} />
                  </XStack>
                )}

                {/* El motivo, abajo y a todo el ancho. SIN línea divisoria: es
                    parte del mismo grupo, y un separador lo haría leer como
                    otro bloque. */}
                {!!s.Descripcion && (
                  <Dato icono={Wallet} etiqueta="Motivo" valor={s.Descripcion} />
                )}
              </YStack>

              {/* La pista, en palabras. Un chevron solo no dice QUÉ se abre, y
                  quien nunca lo ha tocado no lo va a descubrir. Al abrirse pasa
                  a decir cómo cerrarlo.

                  El texto nombra lo que hay adentro, que depende de quién mira:
                  el primer aprobador ve además la cadena. */}
              {(!!s.Empleado || esPrimerNivel) && (
                <XStack alignItems="center" justifyContent="flex-end" gap="$1.5">
                  {/* Gris y a la derecha: es una ayuda para descubrir el
                      acordeón, no una acción que compita con Aprobar. */}
                  <Text fontSize={12} color="$textMuted">
                    {abierta
                      ? 'Ocultar detalle'
                      : esPrimerNivel
                        ? 'Ver empleado y aprobaciones'
                        : 'Ver datos del empleado'}
                  </Text>
                  <View rotate={abierta ? '180deg' : '0deg'}>
                    <ChevronDown size={14} color="#94A3B8" />
                  </View>
                </XStack>
              )}

              {/* El empleado, plegado. Lo del préstamo se ve siempre — es lo
                  que se está resolviendo — y esto es el contexto de quién lo
                  pide: hace falta al decidir, no al hojear la lista. */}
              {abierta && !!s.Empleado && <FichaEmpleado info={s.Empleado} />}

              {/* Qué pasó con la cadena. SOLO para el primer aprobador: él la
                  armó, y es el único que necesita seguirle la pista para saber
                  por qué una solicitud sigue abierta o quién la mató. */}
              {abierta && esPrimerNivel && (
                cargandoFirmas === s.Id ? (
                  <XStack
                    alignItems="center"
                    gap="$2"
                    paddingTop="$3"
                    borderTopWidth={1}
                    borderTopColor="$border"
                  >
                    <Spinner size="small" color="$primary" />
                    <Text fontSize={12} color="$textMuted">Cargando aprobaciones…</Text>
                  </XStack>
                ) : (
                  <CadenaFirmas
                    filas={firmas[s.Id] ?? []}
                    // Solo mientras siga en aprobación: una ya cerrada no
                    // admite cambios en cómo se decidió.
                    puedeEditar={s.Status_Code === ESTADO_SOLICITUD.EN_APROBACION}
                    onEditar={() => abrirEdicion(s.Id)}
                  />
                )
              )}

              {/* Se cerró sin su firma: alcanzó el mínimo con las de otros, o
                  la rechazaron. Se dice acá porque la tarjeta aparece en
                  "Aprobadas" o "Rechazadas" sin que él haya resuelto nada, y sin
                  esta línea parecería que la firmó. */}
              {s.MiEstado === ESTADO_SOLICITUD.NO_REQUERIDA && (
                <XStack alignItems="center" gap="$2">
                  <Users size={13} color="#94A3B8" />
                  <Text fontSize={12} color="$textMuted" flex={1} lineHeight={17}>
                    Se resolvió sin tu firma: ya no era necesaria.
                  </Text>
                </XStack>
              )}

              {/* Los botones solo si a ESTA persona le toca resolver ESTA
                  solicitud. Lo decide el servidor: depende del acceso de quien
                  mira, que esta pantalla no conoce.

                  NO se mira MiEstado: una solicitud recién creada todavía no
                  tiene fila de aprobador, y el primer nivel igual la resuelve. */}
              {/* Con un lote activo desaparecen: los de la barra de arriba son
                  los que aplican, y dos juegos de botones a la vez confunden
                  sobre cuál actúa sobre qué. */}
              {s.PuedeResolver && enLote.length === 0 && (
                <XStack gap="$2" justifyContent="flex-end" paddingTop="$1">
                  {/* Chicos y alineados a la derecha, con el mismo peso que la
                      barra del lote: dos botones de ancho completo pesaban más
                      que los datos que hay que leer antes de tocarlos.

                      Rechazar va sin relleno de color: es la acción destructiva
                      y no debe competir con aprobar. */}
                  <Button
                    height={36} borderRadius={10} paddingHorizontal="$3"
                    backgroundColor="$backgroundSurface"
                    borderWidth={1} borderColor="$border"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={() => {
                      setRechazando([s.Id])
                      setMotivo('')
                      setErrorMotivo('')
                    }}
                  >
                    <XStack alignItems="center" gap="$1.5">
                      <X size={15} color="#EF4444" />
                      <Text fontSize={13} fontWeight="600" color="$error">Rechazar</Text>
                    </XStack>
                  </Button>

                  <Button
                    height={36} borderRadius={10} paddingHorizontal="$3.5"
                    backgroundColor="$success"
                    pressStyle={{ opacity: 0.85 }}
                    onPress={() => abrirAprobar([s.Id])}
                  >
                    <XStack alignItems="center" gap="$1.5">
                      <Check size={15} color="white" />
                      <Text fontSize={13} fontWeight="700" color="white">Aprobar</Text>
                    </XStack>
                  </Button>
                </XStack>
              )}
            </YStack>
          )
        })
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          APROBAR — EL CONFIRM

          Sigue vivo para el ASIGNADO: su firma es sí o no sobre lo que ya se
          autorizó, y para eso un modal alcanza. Las secciones de tasa,
          prestaciones y cadena que lleva adentro están todas condicionadas a
          `esPrimerNivel`, así que a él le queda el resumen y el mensaje.

          Para el PRIMER aprobador se usa DetalleAprobacionScreen: con la tasa,
          las prestaciones, la cadena y los datos del empleado, la decisión ya
          no cabía acá. Poniendo APROBAR_EN_DIALOGO en true vuelve a usar este.
          ───────────────────────────────────────────────────────────────────── */}
      {(APROBAR_EN_DIALOGO || !esPrimerNivel) && (
      <ConfirmDialog
        open={!!aprobando}
        onOpenChange={abierto => { if (!abierto) setAprobando(null) }}
        title={
          aprobando && aprobando.length > 1
            ? `Aprobar ${aprobando.length} solicitudes`
            : 'Aprobar solicitud'
        }
        message={
          // El asignado no arma cadena: su mensaje no habla de quién sigue,
          // porque no es su decisión ni la conoce.
          !esPrimerNivel
            ? (aprobando && aprobando.length > 1
                ? 'Tu aprobación queda registrada en cada una.'
                : 'Tu aprobación queda registrada.')
            : cargandoCadenas
              ? 'Buscando quiénes tienen que aprobarla…'
              : totalMarcados > 0
                ? `Van a pasar a ${totalMarcados} ${totalMarcados === 1 ? 'firma más' : 'firmas más'}.`
                : 'Sin más aprobadores, quedan aprobadas y se registran en la cooperativa.'
        }
        confirmLabel={esPrimerNivel && totalMarcados > 0 ? 'Aprobar y enviar' : 'Aprobar'}
        confirmColor="#22C55E"
        loading={enviando}
        onConfirm={() => aprobando && resolver(aprobando, ESTADO_SOLICITUD.APROBADO)}
        onCancel={() => setAprobando(null)}
        extra={
          /* Con scroll y tope de alto: para el primer aprobador este diálogo
             puede llevar el resumen, la tasa, las prestaciones y la cadena, y
             sin tope empujaría los botones fuera de la pantalla.

             El ORDEN es el de la decisión: qué se pide → con qué tasa → con qué
             respaldo cuenta → quién lo revisa después. */
          <ScrollView width="100%" maxHeight={340} showsVerticalScrollIndicator={false}>
          <YStack gap="$2.5" width="100%">
            {!!aprobando && <ResumenLote items={delLote(aprobando)} />}

            {/* La tasa de interés. Solo la ve quien puede elegirla: si no
                tiene el acceso, el servidor devuelve la lista vacía y acá no se
                pinta nada — el préstamo va con la principal (18%).

                Va ANTES de la cadena porque es una decisión sobre el préstamo,
                no sobre quién lo revisa. */}
            {esPrimerNivel && tasas.length > 0 && (
              <YStack gap="$2" paddingTop="$3" borderTopWidth={1} borderTopColor="$border">
                <XStack alignItems="center" gap="$1.5">
                  <Percent size={12} color="#94A3B8" />
                  <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                    TASA DE INTERÉS
                  </Text>
                </XStack>

                <XStack gap="$2" flexWrap="wrap">
                  {tasas.map(t => {
                    const activa = tasaElegida === t.TasaId

                    return (
                      <XStack
                        key={t.TasaId}
                        alignItems="center"
                        gap="$2"
                        paddingVertical="$2"
                        paddingHorizontal="$3"
                        borderRadius={10}
                        borderWidth={1}
                        borderColor={activa ? '$primary' : '$border'}
                        backgroundColor={activa ? '$primaryOpacity2' : '$backgroundSurface'}
                        pressStyle={{ opacity: 0.7 }}
                        onPress={() => setTasaElegida(t.TasaId)}
                      >
                        <Text fontSize={14} fontWeight={activa ? '700' : '400'} color="$text">
                          {t.Porcentaje}%
                        </Text>
                        {/* Se dice cuál es la principal: es la que aplica si
                            no se toca nada, y saberlo evita elegir "por si
                            acaso". */}
                        {t.TasaPrincipal && (
                          <Text fontSize={10} color="$textMuted">
                            principal
                          </Text>
                        )}
                      </XStack>
                    )
                  })}
                </XStack>
              </YStack>
            )}

            {/* Con qué respaldo cuenta el empleado. Va DESPUÉS de la tasa y
                antes de la cadena: es el último dato que se mira para decidir
                si el monto tiene sentido, justo antes de confirmar a quiénes se
                manda. */}
            {esPrimerNivel && <ResumenPrestaciones filas={prestaciones} />}

            {/* La cadena de cada solicitud, ya marcada. SOLO para el primer
                aprobador: es el único que la arma.

                El asignado ve el resumen del monto y nada más. Quiénes más
                firman no es asunto suyo — su decisión es sobre lo que pide el
                socio, no sobre el resto de la cadena — y mostrárselo solo agrega
                ruido a algo que para él es aprobar o rechazar.

                Una sección POR SOLICITUD y no una sola lista: los aprobadores
                salen de la configuración de la combinación del solicitante, así
                que dos del mismo lote pueden ir a gente distinta. Con una lista
                única se le mandaría a todos los mismos. */}
            {!esPrimerNivel ? null : cargandoCadenas ? (
              <XStack
                alignItems="center"
                gap="$2"
                paddingTop="$2.5"
                borderTopWidth={1}
                borderTopColor="$border"
              >
                <Spinner size="small" color="$primary" />
                <Text fontSize={12} color="$textMuted">
                  Resolviendo la cadena de aprobación…
                </Text>
              </XStack>
            ) : (
              <YStack
                gap="$2.5"
                paddingTop="$3"
                borderTopWidth={1}
                borderTopColor="$border"
              >
                <XStack alignItems="center" gap="$2">
                  <Users size={14} color="#94A3B8" />
                  <Text fontSize={13} fontWeight="700" color="$text" flex={1}>
                    Quiénes la van a firmar
                  </Text>
                </XStack>

                {/* Una línea, no tres. El diálogo ya trae título, mensaje y el
                    resumen del lote: un párrafo más y lo importante — la lista —
                    queda al final de una pared de texto. */}
                <Text fontSize={12} color="$textMuted" lineHeight={17}>
                  Vienen marcados los configurados para su área y su planilla.
                  Toque para desmarcar a quien no deba firmar.
                </Text>

                {/* Con tope de altura y scroll: la lista es lo único que puede
                    crecer, y sin el tope cinco o seis aprobadores empujaban los
                    botones del diálogo fuera de la pantalla. */}
                <ScrollView
                  width="100%"
                  maxHeight={236}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ gap: 14 }}
                >
                  {cadenas.map(c => {
                    const elegidos = marcadosPorId[c.Id] ?? []

                    return (
                      <YStack key={c.Id} gap="$2">
                        {/* La cabecera de la solicitud.
                            El nombre solo en lote: con una sola solicitud ya está
                            en el resumen de arriba y repetirlo no agrega nada. La
                            combinación sí va siempre — es lo que explica por qué
                            salen estos nombres y no otros. */}
                        <XStack alignItems="center" gap="$2" flexWrap="wrap">
                          {!!aprobando && aprobando.length > 1 && (
                            <Text
                              fontSize={13}
                              fontWeight="700"
                              color="$text"
                              numberOfLines={1}
                              maxWidth="55%"
                            >
                              {c.Solicitante || `#${c.Id}`}
                            </Text>
                          )}

                          {!!c.Tipo && (
                            <XStack
                              paddingVertical="$1"
                              paddingHorizontal="$2"
                              borderRadius={6}
                              backgroundColor="$backgroundSurface"
                              borderWidth={1}
                              borderColor="$border"
                            >
                              <Text fontSize={11} color="$textMuted">
                                {c.NombrePlanilla} · {c.Tipo}
                              </Text>
                            </XStack>
                          )}

                          {/* "Cierra con N" y no "pide N": el mínimo NO es un
                              requisito sobre a cuántos hay que marcar — quitarlos
                              a todos es válido y aprueba de una vez. Es cuántas
                              firmas, de las que se marquen, alcanzan para
                              cerrarla: con 3 marcados y mínimo 1, el primero que
                              firme la aprueba.

                              Solo con gente marcada: sin nadie, no hay nada que
                              cerrar con firmas. */}
                          {c.Configurado
                            && c.AprobacionesMinimas > 0
                            && elegidos.length > 0 && (
                            <Text fontSize={11} color="$textMuted">
                              cierra con {c.AprobacionesMinimas}{' '}
                              {c.AprobacionesMinimas === 1 ? 'firma' : 'firmas'}
                            </Text>
                          )}
                        </XStack>

                        {c.Aprobadores.length === 0 ? (
                          <Text
                            fontSize={12}
                            color={c.Configurado ? '$textMuted' : '$warning'}
                            lineHeight={17}
                          >
                            {c.Aviso || 'Sin aprobadores: al aprobar queda lista.'}
                          </Text>
                        ) : (
                          <>
                            {/* Un renglón por persona, a todo el ancho.
                                Antes iban en dos columnas para ahorrar alto, y
                                eso dejaba los nombres cortados y una zona de
                                toque diminuta. Ahora el alto lo resuelve el
                                scroll de arriba. */}
                            <YStack gap="$2">
                              {c.Aprobadores.map(a => {
                                const code = a.User_Code ?? ''
                                const marcado = elegidos.includes(code)

                                return (
                                  <XStack
                                    key={code}
                                    alignItems="center"
                                    gap="$3"
                                    height={50}
                                    paddingHorizontal="$3"
                                    borderRadius={10}
                                    borderWidth={1}
                                    borderColor={marcado ? '$primary' : '$border'}
                                    backgroundColor={marcado ? '$primaryOpacity2' : '$backgroundSurface'}
                                    pressStyle={{ opacity: 0.7 }}
                                    onPress={() => marcar(c.Id, code)}
                                  >
                                    {/* La casilla, dibujada en vez de un ícono:
                                        24 px se toca sin apuntar, y rellena de
                                        color se lee marcada de un vistazo. */}
                                    <View
                                      width={24}
                                      height={24}
                                      borderRadius={6}
                                      borderWidth={2}
                                      borderColor={marcado ? '$primary' : '$border'}
                                      backgroundColor={marcado ? '$primary' : 'transparent'}
                                      alignItems="center"
                                      justifyContent="center"
                                    >
                                      {marcado && <Check size={15} color="white" strokeWidth={3} />}
                                    </View>

                                    <YStack flex={1} gap="$0.5">
                                      <Text
                                        fontSize={14}
                                        fontWeight={marcado ? '600' : '400'}
                                        // Un aprobador dado de baja después de
                                        // configurarlo: se ve, pero se distingue.
                                        color={a.Activo ? '$text' : '$warning'}
                                        numberOfLines={1}
                                      >
                                        {a.Nombre || code}
                                      </Text>
                                      {/* El usuario debajo: dos personas con el
                                          mismo nombre solo se distinguen por acá. */}
                                      <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                                        {a.Activo ? code : `${code} · cuenta inactiva`}
                                      </Text>
                                    </YStack>
                                  </XStack>
                                )
                              })}
                            </YStack>
                          </>
                        )}
                      </YStack>
                    )
                  })}
                </ScrollView>
              </YStack>
            )}
          </YStack>
          </ScrollView>
        }
      />
      )}

      {/* ── Editar quiénes firman ───────────────────────────────────────── */}
      <ConfirmDialog
        open={!!editando}
        onOpenChange={abierto => { if (!abierto) setEditando(null) }}
        title="Quiénes tienen que firmar"
        message={
          cargandoEdicion
            ? 'Buscando a los configurados…'
            : 'Marque a quienes deban firmar. Al que agregue le avisamos que tiene una por aprobar; al que quite, que ya no hace falta su firma.'
        }
        // El botón dice lo que va a pasar: si al guardar la solicitud se
        // aprueba, "Guardar" a secas escondería la consecuencia.
        confirmLabel={cerrariaAlGuardar ? 'Guardar y aprobar' : 'Guardar'}
        confirmColor="#FF551A"
        loading={guardandoCadena}
        onConfirm={guardarCadena}
        onCancel={() => setEditando(null)}
        extra={
          cargandoEdicion ? (
            <XStack alignItems="center" gap="$2" justifyContent="center" paddingVertical="$2">
              <Spinner size="small" color="$primary" />
            </XStack>
          ) : candidatos.length === 0 ? (
            <Text fontSize={12} color="$textMuted" textAlign="center" lineHeight={17}>
              No hay aprobadores configurados para su área y su planilla.
            </Text>
          ) : (
            <YStack gap="$2.5" width="100%">
              {/* El aviso de la consecuencia, ARRIBA de la lista: abajo del
                  scroll se leería después de decidir, o no se leería. */}
              {cerrariaAlGuardar && (
                <XStack
                  gap="$2"
                  alignItems="flex-start"
                  padding="$2.5"
                  borderRadius="$3"
                  backgroundColor="rgba(34,197,94,0.10)"
                  borderWidth={1}
                  borderColor="$success"
                >
                  <View marginTop={1}>
                    <CheckCircle2 size={14} color="#22C55E" />
                  </View>
                  <Text fontSize={12} color="$text" flex={1} lineHeight={17}>
                    Así queda <Text fontWeight="700">aprobada del todo</Text> y se
                    registra en la cooperativa: no quedan firmas por esperar.
                  </Text>
                </XStack>
              )}

              <ScrollView width="100%" maxHeight={240} showsVerticalScrollIndicator={false}>
                <YStack gap="$2">
                {candidatos.map(c => {
                  const marcado = marcadosCadena.includes(c.code)

                  return (
                    <XStack
                      key={c.code}
                      alignItems="center"
                      gap="$3"
                      height={50}
                      paddingHorizontal="$3"
                      borderRadius={10}
                      borderWidth={1}
                      borderColor={marcado || c.fijo ? '$primary' : '$border'}
                      backgroundColor={marcado || c.fijo ? '$primaryOpacity2' : '$backgroundSurface'}
                      // El que ya resolvió no se toca: su firma es parte de
                      // cómo se decidió.
                      opacity={c.fijo ? 0.7 : 1}
                      pressStyle={c.fijo ? undefined : { opacity: 0.7 }}
                      onPress={
                        c.fijo
                          ? undefined
                          : () =>
                              setMarcadosCadena(prev =>
                                prev.includes(c.code)
                                  ? prev.filter(x => x !== c.code)
                                  : [...prev, c.code],
                              )
                      }
                    >
                      <View
                        width={24}
                        height={24}
                        borderRadius={6}
                        borderWidth={2}
                        borderColor={marcado || c.fijo ? '$primary' : '$border'}
                        backgroundColor={marcado || c.fijo ? '$primary' : 'transparent'}
                        alignItems="center"
                        justifyContent="center"
                      >
                        {(marcado || c.fijo) && <Check size={15} color="white" strokeWidth={3} />}
                      </View>

                      <YStack flex={1} gap="$0.5">
                        <Text fontSize={14} color="$text" numberOfLines={1}>
                          {c.nombre}
                        </Text>
                        <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                          {/* Al fijo se le dice POR QUÉ no se puede desmarcar. */}
                          {c.fijo ? `${c.code} · ya ${c.estado?.toLowerCase()}` : c.code}
                        </Text>
                      </YStack>
                    </XStack>
                  )
                })}
                </YStack>
              </ScrollView>
            </YStack>
          )
        }
      />

      {/* ── Rechazar: acá muere la solicitud ────────────────────────────── */}
      <ConfirmDialog
        open={!!rechazando}
        onOpenChange={abierto => { if (!abierto) setRechazando(null) }}
        title={
          rechazando && rechazando.length > 1
            ? `Rechazar ${rechazando.length} solicitudes`
            : 'Rechazar solicitud'
        }
        message={
          rechazando && rechazando.length > 1
            ? 'Se cierran todas y ninguna sigue a la cooperativa.'
            : 'La solicitud se cierra y no sigue a la cooperativa.'
        }
        confirmLabel="Rechazar"
        confirmColor="#EF4444"
        loading={enviando}
        onConfirm={() => rechazando && resolver(rechazando, ESTADO_SOLICITUD.RECHAZADO)}
        onCancel={() => setRechazando(null)}
        extra={
          <YStack gap="$2.5">
            {!!rechazando && <ResumenLote items={delLote(rechazando)} />}

            {/* El motivo es obligatorio: es lo único que el solicitante va a
                leer para saber qué corregir. */}
            <AppInput
              label="Motivo del rechazo"
              value={motivo}
              onChangeText={(v: string) => {
                setMotivo(v)
                setErrorMotivo('')
              }}
              multiline
              minLines={2}
              maxLines={4}
              placeholder="Se lo vamos a mostrar al solicitante"
              error={errorMotivo}
              // El mismo motivo va a TODAS las del lote. Se avisa porque una
              // razón escrita para una persona puede no tener sentido para otra.
              statusMessage={
                rechazando && rechazando.length > 1
                  ? 'El mismo motivo se le manda a las ' + rechazando.length + ' personas.'
                  : undefined
              }
            />
          </YStack>
        }
      />
    </ScrollView>
  )
}