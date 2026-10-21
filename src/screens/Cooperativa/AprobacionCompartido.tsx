/**
 * Piezas compartidas de la aprobación de préstamos.
 *
 * Salieron de AprobacionPrestamosScreen cuando esa pantalla se rehizo contra
 * los procedimientos de Cooperativa. Vivían dentro de ella y DetalleAprobacion
 * las importaba de ahí: una pantalla importando componentes de otra se rompe
 * en cuanto la primera cambia, que es justo lo que pasó.
 *
 * OJO: todavía hablan el lenguaje del esquema viejo de IMCore (ISolicitudPrestamo,
 * IEmpleadoInfo, prestaciones). Se conservan tal cual para no perderlas mientras
 * se rehace el detalle; al rehacerlo hay que revisar una por una.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl } from 'react-native'
import { YStack, XStack, Text, ScrollView, View, Button, Spinner, styled } from 'tamagui'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import {
  Coins, CalendarDays, User, Clock, CheckCircle2, XCircle,
  Tag, Inbox, RotateCw, Wallet, Briefcase, UserCog,
  Check, X, Users, Square, SquareCheck, IdCard, ChevronDown, Pencil, Percent,
  RefreshCcw,
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
/**
 * El desglose de un refinanciamiento, para quien aprueba.
 *
 * Sin esto, la solicitud llega como un préstamo de 65,000 y no se distingue de
 * uno nuevo por ese monto. Son cosas distintas: acá 45,000 son deuda que ya
 * existe y solo cambia de préstamo, y lo que realmente se está prestando de
 * nuevo son 20,000.
 *
 * Los números son la FOTO del día que lo pidió, no el saldo de hoy: es sobre
 * eso que se decide, y si se moviera con cada pago, dos aprobadores mirando la
 * misma solicitud verían montos distintos.
 *
 * Devuelve null cuando la solicitud no es un refinanciamiento, así quien la usa
 * no tiene que envolverla en una condición.
 */
export function DesgloseRefinanciamiento({ s }: { s: ISolicitudPrestamo }) {
  if (!s.EsRefinanciamiento) return null

  const saldo = s.SaldoAnterior ?? 0
  const adicional = s.MontoAdicional ?? 0
  const meses = s.PrestamoAnteriorMeses

  const antiguedadTexto = (() => {
    if (meses == null || meses < 0) return null
    if (meses === 0) return 'menos de un mes'
    const anios = Math.floor(meses / 12)
    const resto = meses % 12
    const partes: string[] = []
    if (anios > 0) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`)
    if (resto > 0) partes.push(`${resto} ${resto === 1 ? 'mes' : 'meses'}`)
    return partes.join(' ')
  })()

  return (
    <YStack
      gap="$2"
      padding="$3"
      borderRadius="$3"
      backgroundColor="$backgroundSurface"
      borderWidth={1}
      borderColor="$primary"
    >
      <XStack alignItems="center" gap="$1.5">
        <RefreshCcw size={12} color="#FF551A" />
        <Text fontSize={10} fontWeight="800" color="$primary" letterSpacing={0.4}>
          REFINANCIAMIENTO
        </Text>
      </XStack>

      {/* Capital pendiente MÁS el interés de la próxima cuota. Va junto en una
          línea y no desglosado: quien aprueba decide sobre el dinero nuevo, y
          el arrastre le interesa como un solo número. */}
      <XStack alignItems="center" gap="$2">
        <Text fontSize={12} color="$textMuted" flex={1}>Deuda que se traslada</Text>
        <Text fontSize={13} color="$text" fontWeight="600">{formatMonto(saldo)}</Text>
      </XStack>

      {/* Lo que de verdad se está prestando de nuevo. Es el número sobre el que
          se decide, y por eso va marcado. */}
      <XStack alignItems="center" gap="$2">
        <Text fontSize={12} color="$textMuted" flex={1}>Dinero nuevo que pide</Text>
        <Text fontSize={13} color="$primary" fontWeight="800">{formatMonto(adicional)}</Text>
      </XStack>

      <XStack
        alignItems="center"
        gap="$2"
        paddingTop="$2"
        borderTopWidth={1}
        borderTopColor="$border"
      >
        <Text fontSize={12} fontWeight="700" color="$text" flex={1}>Préstamo nuevo</Text>
        <Text fontSize={14} fontWeight="700" color="$text">{formatMonto(s.Monto)}</Text>
      </XStack>

      {/* Cómo venía pagando el anterior: es lo que dice si conviene o no. */}
      {(!!antiguedadTexto || !!s.PrestamoAnteriorCuotasTotal) && (
        <Text fontSize={11} color="$textMuted" lineHeight={16}>
          {antiguedadTexto ? `Llevaba ${antiguedadTexto} con el anterior` : ''}
          {antiguedadTexto && s.PrestamoAnteriorCuotasTotal ? ' · ' : ''}
          {s.PrestamoAnteriorCuotasTotal
            ? `${s.PrestamoAnteriorCuotasPagadas ?? 0} de ${s.PrestamoAnteriorCuotasTotal} cuotas pagadas`
            : ''}
          {s.PrestamoAnteriorMonto != null
            ? ` · era de ${formatMonto(s.PrestamoAnteriorMonto)}`
            : ''}
        </Text>
      )}
    </YStack>
  )
}

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

