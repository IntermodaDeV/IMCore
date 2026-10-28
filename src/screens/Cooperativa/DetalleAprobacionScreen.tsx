import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView as RNScrollView } from 'react-native'
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { YStack, XStack, Text, Button, View, Spinner, styled } from 'tamagui'
import {
  ArrowLeft, Check, X, User, Wallet, FileText, ChevronUp, ChevronDown, Percent,
} from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
  IDetalleAprobacion, IPrestacionSocio, IEstadoCuenta,
  ICuentaSocio, IPrestamoSocio, ISolicitudPorAprobar, IOpcionCuota, ITasaEmpresa,
  IFirmaSolicitud, ICuotaPlan, ESTADO_SOLICITUD_COO,
} from '../../api/modules/cooperativa/cooperativa.types'
import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import AppDatePicker from '../../components/commons/AppDatePicker'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { shadows } from '../../theme/shadows'
import ErrorState from '../AdmSys/ErrorState'

/**
 * Detalle de una solicitud, para revisarla antes de resolverla.
 *
 * UNA llamada trae todo: la solicitud, el empleado en planilla, su liquidación
 * y el plan de pagos. El servidor las junta porque si no serían tres estados
 * de carga que pueden contradecirse — y porque el permiso se resuelve una sola
 * vez: si la solicitud no está asignada a quien mira, no se consulta nada.
 *
 * Los botones de aprobar y rechazar todavía NO hacen nada. Están puestos para
 * ver el lugar que ocupan; la resolución es el paso siguiente.
 */

const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const formatMonto = (valor: number | null | undefined): string => {
  if (valor == null) return '-'
  return `L ${Number(valor).toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** "7 años 6 meses" a partir de los tres campos de antigüedad. */
const formatAntiguedad = (p: IPrestacionSocio | undefined): string => {
  if (!p) return '-'
  const partes: string[] = []
  if (p.AnioAntiguedad > 0) partes.push(`${p.AnioAntiguedad} ${p.AnioAntiguedad === 1 ? 'año' : 'años'}`)
  if (p.MesAntiguedad > 0) partes.push(`${p.MesAntiguedad} ${p.MesAntiguedad === 1 ? 'mes' : 'meses'}`)
  if (partes.length === 0 && p.DiaAntiguedad > 0) partes.push(`${p.DiaAntiguedad} días`)
  return partes.join(' ') || '-'
}

/**
 * El color del estado de la solicitud. Los mismos de Mis solicitudes y del
 * listado del aprobador: una Pendiente se ve igual en las tres pantallas.
 */
const COLOR_ESTADO: Record<number, { color: string; token: string }> = {
  0: { color: '#F59E0B', token: '$warning' },    // Pendiente
  1: { color: '#22C55E', token: '$success' },    // Aprobada
  2: { color: '#EF4444', token: '$error' },      // Rechazada
  /* En aprobación: celeste. El token es el color del TEXTO y decía '$text',
     el gris de cualquier texto, así que la palabra se leía apagada al lado de
     las otras. Literal y no `$info` (#3B82F6), que es más azul que celeste. */
  3: { color: '#0EA5E9', token: '#0EA5E9' },     // En aprobación
  4: { color: '#94A3B8', token: '$textMuted' },  // Anulada
}

const ESTADO_NEUTRO = { color: '#94A3B8', token: '$textMuted' }

/**
 * Nombre y primer apellido, nada más.
 *
 * El nombre completo de la cooperativa son cuatro palabras y la etiqueta de
 * una tarjeta tiene unos 100px: entero se corta en cualquier lado. Dos
 * palabras alcanzan para saber quién firmó.
 */
const primerNombre = (completo: string | null | undefined): string => {
  const partes = (completo ?? '').trim().split(/\s+/).filter(Boolean)
  return partes.slice(0, 2).join(' ')
}

/** Las iniciales del socio, para el avatar. */
const iniciales = (nombre: string | null, codigo: string | null): string => {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase()
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (codigo ?? '??').slice(0, 2).toUpperCase()
}

/**
 * El monto para las tarjetas angostas.
 *
 * Es el MISMO formato que el resto, con sus dos decimales. Lo angosto se
 * resuelve con tipografía chica y `adjustsFontSizeToFit`, no recortando
 * centavos: redondear para ganar ancho mostraría un número que no es el que
 * figura en la cuenta del socio.
 */
const formatCorto = formatMonto

/**
 * Un dato del socio, en media fila.
 *
 * Van de a dos por renglón: el bloque es contexto para decidir, no el objetivo
 * de la pantalla, y apilados uno por línea se comía el alto que necesita la
 * posición de abajo.
 */
function Campo({
  etiqueta,
  valor,
  lineas = 1,
}: {
  etiqueta: string
  valor: string | null | undefined
  /** Cuántas líneas puede ocupar. El texto libre necesita más de una. */
  lineas?: number
}) {
  return (
    <YStack flex={1} gap="$0.5">
      <Text fontSize={10} color="$textMuted">
        {etiqueta}
      </Text>
      <Text fontSize={12} fontWeight="600" color="$text" numberOfLines={lineas}>
        {valor || '-'}
      </Text>
    </YStack>
  )
}

/**
 * Una de las cuatro tarjetas de la posición.
 *
 * Las cuatro miden lo mismo —plata del socio— así que se ven iguales y solo
 * cambia el número. El color se usa únicamente donde significa algo: deuda y
 * neto negativo.
 */
function MiniCard({
  etiqueta,
  valor,
  detalle,
  color,
}: {
  etiqueta: string
  valor: string
  detalle?: string
  color?: string
}) {
  return (
    <YStack
      flex={1}
      gap="$0.5"
      paddingVertical="$2.5"
      paddingHorizontal="$1.5"
      borderRadius="$4"
      alignItems="center"
      backgroundColor="$backgroundSurface"
      borderWidth={1}
      borderColor="$border"
    >
      <Text fontSize={9} fontWeight="700" color="$textMuted" numberOfLines={1}>
        {etiqueta.toUpperCase()}
      </Text>
      <Text
        fontSize={13}
        fontWeight="800"
        color={color ?? '$text'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {valor}
      </Text>
      {!!detalle && (
        <Text fontSize={9} color="$textMuted" numberOfLines={1}>
          {detalle}
        </Text>
      )}
    </YStack>
  )
}

/**
 * Cuánto de la liquidación se lleva el préstamo.
 *
 * ── Qué mide ────────────────────────────────────────────────────────────────
 * La barra es CONSUMO, no cobertura: llena es mala señal. Al 55% quiere decir
 * que, si el socio saliera hoy, el préstamo se comería el 55% de lo que le
 * tocaría y le quedaría el resto.
 *
 * Al 100% la liquidación se agota justo. Pasado eso la barra ya no puede
 * crecer, así que el faltante se dice con palabras abajo — una barra sin tope
 * dejaría de poder compararse entre solicitudes.
 *
 * Es al revés de medir "cuántas veces cabe", que era la versión anterior. Esta
 * se lee directo contra algo que existe —la liquidación del socio— y no contra
 * una meta inventada: ya no hay ningún número de convención en esta pantalla.
 *
 * ── Los colores ─────────────────────────────────────────────────────────────
 *   hasta 75%   verde   le queda margen
 *   75 a 99%    ámbar   se lleva casi todo
 *   100% o más  rojo    la liquidación no alcanza
 *
 * El único corte que es un hecho es el 100%: ahí deja de haber respaldo. El
 * 75% es una señal temprana, y por eso cambia el color pero no dice que esté
 * mal.
 *
 * ── Por qué exposición y no el monto pelado ─────────────────────────────────
 * La exposición es lo que pide MÁS lo que ya debe MENOS lo que tiene ahorrado.
 * El ahorro se resta porque la cooperativa puede cobrarse de ahí. Medir contra
 * el préstamo solo diría que consume menos liquidación de la que realmente
 * compromete, y un socio que ya debe parecería igual de sólido que uno que no.
 */
function BarraRespaldo({
  liquidacion,
  exposicion,
  veces,
  cuenta,
}: {
  liquidacion: number
  exposicion: number
  veces: number | null
  cuenta: IEstadoCuenta | null
}) {
  /* >>> NUNCA DIVIDIR CON LO QUE VINO SIN NUMERO <<<
     Un campo que el servidor no mandó llega como undefined, y `undefined / x`
     da NaN: la barra queda sin largo y en pantalla aparece "NaN%".

     Pasó de verdad: al renombrar Exposicion -> DeudaNeta, la API publicada
     seguía mandando el nombre viejo y la pantalla mostraba NaN en todos lados
     en vez de avisar que faltaba el dato.

     Con esto, un campo que falta se comporta igual que un cero —el camino de
     abajo, que lo explica con palabras— en vez de ensuciar la pantalla. */
  const deuda = Number.isFinite(exposicion) ? exposicion : 0
  const respaldo = Number.isFinite(liquidacion) ? liquidacion : 0

  /* NO DEBE NADA: no se muestra nada.

     Un socio sin préstamos no tiene de qué "cubrirse", y decirle que su
     liquidación alcanza suena a que había un riesgo que superó. No lo había.

     Es distinto de deber y tener ahorrado de más —el caso de abajo—, donde sí
     hay deuda y el ahorro la tapa: eso el aprobador necesita saberlo. */
  const debeAlgo = (cuenta?.SaldoPrestamos ?? 0) > 0

  if (!debeAlgo) return null

  // Debe, pero su ahorro ya lo cubre. No se dibuja una barra llena, que se
  // leería como "apenas alcanza".
  if (deuda <= 0) {
    return (
      <YStack gap="$1.5" paddingBottom="$3">
        <Text fontSize={11} fontWeight="700" color="$text">
          Su liquidación cubre lo que debe
        </Text>
        <Text fontSize={11} color="$textMuted" lineHeight={16}>
          Hoy no debe nada neto: tiene ahorrado tanto o más de lo que debe.
        </Text>
      </YStack>
    )
  }

  /* Sin liquidación no hay nada contra qué medir. Una barra al 100% diría
     "se lo come todo", que suena peor de lo que es: lo que pasa es que no
     sabemos cuánto tiene. */
  if (respaldo <= 0) {
    return (
      <YStack gap="$1.5" paddingBottom="$3">
        <Text fontSize={11} fontWeight="700" color="$text">
          Su liquidación cubre lo que debe
        </Text>
        <Text fontSize={11} color="$textMuted" lineHeight={16}>
          Este socio no tiene prestaciones calculadas, así que no se puede
          medir cuánto de su liquidación se llevaría el préstamo.
        </Text>
      </YStack>
    )
  }

  // Qué parte de la liquidación se lleva el préstamo. La barra es CONSUMO:
  // llena es mala señal.
  const consumo = deuda / respaldo
  const proporcion = Math.min(1, consumo)

  const seLaCome = consumo >= 1
  const apretado = consumo >= 0.75
  const color = seLaCome ? '#EF4444' : apretado ? '#F59E0B' : '#22C55E'

  // Lo que le quedaría después de pagar. Negativo = no alcanza.
  const resto = respaldo - deuda

  return (
    <YStack gap="$2" paddingBottom="$3">
      <XStack alignItems="center" gap="$2">
        <Text fontSize={11} fontWeight="700" color="$text" flex={1}>
          Su liquidación cubre lo que debe
        </Text>
        {/* El múltiplo y no el porcentaje: "1.7×" se lee como "le alcanza casi
            dos veces", que es la pregunta. La BARRA sigue siendo consumo —
            cuánto de la liquidación se lleva la deuda — porque un múltiplo no
            tiene tope y una barra sin tope no se puede comparar entre
            solicitudes. Son las dos caras del mismo número. */}
        <Text fontSize={14} fontWeight="800" color={color}>
          {veces != null ? `${veces.toFixed(1)}×` : '-'}
        </Text>
      </XStack>

      <View height={8} borderRadius={999} backgroundColor="$backgroundSurface" overflow="hidden">
        <View
          height={8}
          borderRadius={999}
          backgroundColor={color}
          width={`${proporcion * 100}%`}
        />
      </View>

      {/* De dónde sale la exposición, con los números a la vista. Sin esto el
          porcentaje es algo que el aprobador no puede verificar. */}
      <Text fontSize={10} color="$textMuted" lineHeight={15}>
        {formatMonto(deuda)}
        {cuenta
          ? ` (${formatCorto(cuenta.SaldoPrestamos)} que debe − ${formatCorto(cuenta.SaldoCuentas)} ahorrado)`
          : ''}{' '}
        sobre {formatMonto(respaldo)} de liquidación.
      </Text>

      {/* Lo que de verdad le queda, en plata.
          Pasado el 100% la barra no puede crecer más, así que el faltante solo
          se puede decir con palabras: sin esto, deber el doble de la
          liquidación se vería igual que deberla justa. */}
      {seLaCome ? (
        <Text fontSize={10} color="$error" lineHeight={15}>
          No alcanza: le faltarían {formatMonto(Math.abs(resto))}.
        </Text>
      ) : (
        <Text fontSize={10} color="$textMuted" lineHeight={15}>
          Le quedarían {formatMonto(resto)}.
        </Text>
      )}
    </YStack>
  )
}

/** Cada cuánto le descuentan, según el tipo de plazo de su planilla. */
const CADA_CUANTO: Record<number, string> = {
  0: 'al mes',
  1: 'por quincena',
  2: 'por semana',
}

/** Una fila de detalle: título a la izquierda, monto a la derecha. */
function Fila({
  titulo,
  sub,
  monto,
  pie,
  apagado,
  negativo,
  fuerte,
}: {
  titulo: string
  sub?: string
  monto: string
  pie?: string
  /** Ya no cuenta: un préstamo cancelado. */
  apagado?: boolean
  /** Un descuento. Se pinta porque es lo único que lo distingue de un ingreso. */
  negativo?: boolean
  /** La fila de total. */
  fuerte?: boolean
}) {
  return (
    <XStack
      alignItems="flex-start"
      gap="$3"
      paddingVertical="$2"
      borderBottomWidth={fuerte ? 0 : 1}
      borderTopWidth={fuerte ? 1 : 0}
      borderBottomColor="$border"
      borderTopColor="$border"
      opacity={apagado ? 0.5 : 1}
    >
      <YStack flex={1} gap="$0.5">
        <Text
          fontSize={12}
          fontWeight={fuerte ? '800' : '600'}
          color="$text"
          numberOfLines={1}
        >
          {titulo}
        </Text>
        {!!sub && (
          <Text fontSize={10} color="$textMuted" numberOfLines={1}>
            {sub}
          </Text>
        )}
      </YStack>

      <YStack alignItems="flex-end" gap="$0.5">
        <Text
          fontSize={fuerte ? 13 : 12}
          fontWeight={fuerte ? '800' : '700'}
          color={negativo ? '$error' : '$text'}
        >
          {monto}
        </Text>
        {!!pie && (
          <Text fontSize={10} color="$textMuted">
            {pie}
          </Text>
        )}
      </YStack>
    </XStack>
  )
}

/**
 * Una de las cuatro cuotas que el aprobador puede elegir.
 *
 * Son las tres que calcula el servidor —mínima, sugerida, máxima— más la que
 * el socio pidió. Esa cuarta se muestra aparte y marcada: es la única que no
 * salió de un cálculo sino de una persona, y aprobarle otra sin verla sería
 * cambiarle la cuota sin enterarse.
 */
function BotonCuota({
  etiqueta,
  cuota,
  plazo,
  elegida,
  deshabilitada,
  onPress,
}: {
  etiqueta: string
  cuota: number | null
  plazo: number | null
  elegida: boolean
  deshabilitada?: boolean
  onPress: () => void
}) {
  return (
    /* Cuatro de estas tienen que entrar a lo ancho de un teléfono: unos 80px
       cada una. De ahí el padding mínimo y el adjustsFontSizeToFit, que achica
       el monto solo cuando no entra en vez de cortarlo. */
    <YStack
      flex={1}
      gap="$0.5"
      paddingVertical="$2"
      paddingHorizontal="$1"
      borderRadius="$3"
      alignItems="center"
      backgroundColor="$backgroundElevated"
      borderWidth={elegida ? 2 : 1}
      borderColor={elegida ? '$primary' : '$border'}
      opacity={deshabilitada ? 0.4 : 1}
      pressStyle={deshabilitada ? undefined : { opacity: 0.75 }}
      onPress={deshabilitada ? undefined : onPress}
    >
      <Text
        fontSize={8}
        fontWeight="800"
        letterSpacing={0.2}
        color={elegida ? '$primary' : '$textMuted'}
        numberOfLines={1}
      >
        {etiqueta.toUpperCase()}
      </Text>
      <Text
        fontSize={11}
        fontWeight="800"
        color="$text"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {cuota != null ? formatCorto(cuota) : '-'}
      </Text>
      <Text fontSize={8} color="$textMuted" numberOfLines={1}>
        {plazo != null ? `${plazo} cuotas` : '—'}
      </Text>
    </YStack>
  )
}

/**
 * Una propuesta de monto + cuota, en una fila, para elegirla de un toque.
 *
 * >>> POR QUÉ SE ELIGE Y NO SOLO SE MUESTRA <<<
 * A partir de la segunda firma hay varios números sobre la mesa: lo que pidió
 * el socio y lo que dejó cada aprobador que ya firmó. El que firma ahora tiene
 * que poder volver a cualquiera sin reescribirlo a mano — y sobre todo tiene
 * que ver que son distintos, que es lo que lo obliga a decidir.
 *
 * >>> FILA Y NO TARJETA <<<
 * La cadena puede tener tres, cuatro o más firmantes. En columnas, cada una
 * quedaría en 60px y no entraría ni el nombre; apiladas, agregar uno más solo
 * alarga la lista. Y en fila el nombre y la fecha caben enteros, que es lo que
 * distingue una propuesta de otra cuando los montos se parecen.
 */
function FilaPropuesta({
  etiqueta,
  pie,
  monto,
  cuota,
  cadaCuanto,
  elegida,
  onPress,
}: {
  etiqueta: string
  /** Quién y cuándo. */
  pie?: string
  monto: number | null
  cuota: number | null
  cadaCuanto: string
  elegida: boolean
  /** Sin onPress la fila solo informa: es el caso de "lo que está poniendo". */
  onPress?: () => void
}) {
  return (
    <XStack
      alignItems="center"
      gap="$2.5"
      paddingVertical="$2"
      paddingHorizontal="$2.5"
      borderRadius="$3"
      backgroundColor="$backgroundElevated"
      borderWidth={elegida ? 2 : 1}
      borderColor={elegida ? '$primary' : '$border'}
      pressStyle={onPress ? { opacity: 0.75 } : undefined}
      onPress={onPress}
    >
      {/* El tilde ocupa su lugar SIEMPRE, marcada o no. Si apareciera y
          desapareciera, las filas se correrían a lo ancho al cambiar de
          selección. */}
      <View width={16} alignItems="center">
        {elegida && <Check size={15} color="#FF551A" />}
      </View>

      <YStack flex={1} gap="$0.5">
        <Text
          fontSize={11}
          fontWeight="700"
          color={elegida ? '$primary' : '$text'}
          numberOfLines={1}
        >
          {etiqueta}
        </Text>
        {!!pie && (
          <Text fontSize={9} color="$textMuted" numberOfLines={1}>
            {pie}
          </Text>
        )}
      </YStack>

      {/* Los números a la derecha y alineados entre sí: así se comparan de
          arriba abajo sin leer las etiquetas. */}
      <YStack alignItems="flex-end" gap="$0.5">
        <Text fontSize={12} fontWeight="800" color="$text" numberOfLines={1}>
          {monto != null ? formatMonto(monto) : '-'}
        </Text>
        <Text fontSize={10} color="$textMuted" numberOfLines={1}>
          {cuota != null ? `${formatMonto(cuota)} ${cadaCuanto}`.trim() : '—'}
        </Text>
      </YStack>
    </XStack>
  )
}

/**
 * Un plegable de una línea, para lo que va DENTRO de una tarjeta.
 *
 * AccordionSection no sirve acá: es una tarjeta entera —fondo propio, borde,
 * radio y un chevron en un círculo de 28px— y metida adentro de otra se lee
 * como una caja dentro de una caja, además de comerse un montón de alto.
 *
 * Esto es solo una línea que se toca: el texto en el color de acción, el
 * chevron chico, y una raya arriba que lo separa de lo anterior. Ocupa lo que
 * mide una línea de texto y se entiende igual.
 */
function Plegable({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <YStack paddingTop="$2" borderTopWidth={1} borderTopColor="$border">
      <XStack
        alignItems="center"
        gap="$1.5"
        paddingVertical="$1"
        pressStyle={{ opacity: 0.6 }}
        onPress={() => setAbierto(a => !a)}
      >
        <Text fontSize={11} fontWeight="700" color="$primary" flex={1}>
          {titulo}
        </Text>
        {abierto
          ? <ChevronUp size={14} color="#94A3B8" />
          : <ChevronDown size={14} color="#94A3B8" />}
      </XStack>

      {abierto && <YStack paddingTop="$1">{children}</YStack>}
    </YStack>
  )
}

/** Cuando una pestaña no tiene nada que mostrar. */
function Vacio({ texto }: { texto: string }) {
  return (
    <Text fontSize={11} color="$textMuted" paddingVertical="$4" textAlign="center" lineHeight={16}>
      {texto}
    </Text>
  )
}

/**
 * El detalle, en tres pestañas.
 *
 * Van juntas y no en tres tarjetas porque son tres respuestas a la misma
 * pregunta —qué tiene y qué debe— y el aprobador las compara entre sí. Tres
 * bloques apilados lo obligarían a recordar el de arriba mientras mira el de
 * abajo.
 */
function Pestanas({
  cuentas,
  prestamos,
  prestaciones,
  neto,
}: {
  cuentas: ICuentaSocio[]
  prestamos: IPrestamoSocio[]
  prestaciones: IPrestacionSocio[]
  neto: number
}) {
  const [tab, setTab] = useState<'ahorro' | 'prestamo' | 'prestaciones'>('ahorro')

  const TABS = [
    { clave: 'ahorro', titulo: 'Ahorro' },
    { clave: 'prestamo', titulo: 'Préstamos' },
    { clave: 'prestaciones', titulo: 'Prestaciones' },
  ] as const

  // Sin padding horizontal propio: el de la tarjeta ya lo pone, y los dos
  // juntos dejaban las pestañas muy metidas hacia adentro.
  return (
    <YStack paddingVertical="$1.5" gap="$1.5">
      <XStack
        gap="$1"
        padding="$1"
        borderRadius="$4"
        backgroundColor="$backgroundSurface"
        borderWidth={1}
        borderColor="$border"
      >
        {TABS.map(t => {
          const activa = tab === t.clave
          return (
            <View
              key={t.clave}
              flex={1}
              paddingVertical="$1.5"
              borderRadius="$3"
              alignItems="center"
              backgroundColor={activa ? '$primary' : 'transparent'}
              pressStyle={{ opacity: 0.7 }}
              onPress={() => setTab(t.clave)}
            >
              <Text
                fontSize={11}
                fontWeight={activa ? '700' : '600'}
                color={activa ? 'white' : '$textMuted'}
              >
                {t.titulo}
              </Text>
            </View>
          )
        })}
      </XStack>

      {/* Alto tope y scroll propio: un plan semanal pasa de 50 filas y, sin
          esto, cambiar de pestaña movería media pantalla. */}
      <RNScrollView style={{ maxHeight: 280 }} nestedScrollEnabled showsVerticalScrollIndicator>
        {tab === 'ahorro' &&
          (cuentas.length === 0 ? (
            <Vacio texto="No tiene cuentas de ahorro activas." />
          ) : (
            cuentas.map(c => (
              <Fila
                key={c.CuentaId}
                titulo={c.TipoCuentaNombre || `Cuenta ${c.CuentaId}`}
                /* FechaCreacion y no FechaApertura: la de apertura es la de la
                   migración y es la misma para todos los socios. */
                sub={`Desde ${formatFecha(c.FechaCreacion)}${
                  c.Aporte ? ` · aporta ${formatCorto(c.Aporte)}` : ''
                }`}
                monto={formatMonto(c.SaldoActual)}
              />
            ))
          ))}

        {tab === 'prestamo' &&
          (prestamos.length === 0 ? (
            <Vacio texto="No tiene préstamos registrados." />
          ) : (
            prestamos.map(p => (
              <Fila
                key={p.PrestamoId}
                titulo={`${formatMonto(p.Monto)} · ${p.Plazo} cuotas`}
                sub={`${formatFecha(p.FechaPrestamo)} · ${p.CuotasPagadas} de ${p.CuotasTotal} pagadas`}
                /* Los cancelados se muestran apagados: son historial y no
                   tienen que competir con los vigentes, que son los que pesan
                   en la decisión. */
                monto={p.Cancelado ? 'Cancelado' : formatMonto(p.SaldoPendiente)}
                pie={
                  !p.Cancelado && p.ProximaCuota != null
                    ? `cuota ${formatCorto(p.ProximaCuota)}`
                    : undefined
                }
                apagado={p.Cancelado}
              />
            ))
          ))}

        {tab === 'prestaciones' &&
          (prestaciones.length === 0 ? (
            <Vacio texto="No tiene prestaciones calculadas." />
          ) : (
            <>
              {prestaciones.map(p => (
                <Fila
                  key={p.PrestacionesId}
                  titulo={p.Concepto || `Concepto ${p.CodigoConcepto}`}
                  /* Se muestra ValorNeto, no Valor: el signo ya viene resuelto
                     por el Tipo. Los descuentos a veces están guardados en
                     negativo y a veces no, así que Valor no sirve ni para
                     mostrar ni para sumar. */
                  monto={formatMonto(p.ValorNeto)}
                  negativo={p.ValorNeto < 0}
                />
              ))}

              {/* El total va en la lista y no afuera: así se ve que sale de
                  sumar lo de arriba y no de otro lado. */}
              <Fila titulo="Total" monto={formatMonto(neto)} fuerte />
            </>
          ))}
      </RNScrollView>
    </YStack>
  )
}

/** Solo dígitos y un punto decimal, para que el monto no llegue con basura. */
const soloDecimal = (v: string): string => {
  const limpio = v.replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  return partes.length <= 2 ? limpio : `${partes[0]}.${partes.slice(1).join('')}`
}

/** Hoy en formato ISO corto, para el mínimo del calendario. */
const hoyISO = (): string => new Date().toISOString().slice(0, 10)

/**
 * Lo que se está por aprobar, con lo que el aprobador puede cambiar.
 *
 * ── Qué se puede tocar ──────────────────────────────────────────────────────
 * El monto, la cuota y la tasa. El plazo NO: sale de los otros tres. Pedirlo
 * aparte dejaría armar una combinación que no existe, igual que pasaba en el
 * formulario del socio.
 *
 * ── Las cuatro cuotas ───────────────────────────────────────────────────────
 * Las tres que calcula el servidor —mínima, sugerida, máxima— más LA QUE PIDIÓ
 * EL SOCIO, aparte. Esa cuarta importa: es la única que no salió de un cálculo
 * sino de una persona, y aprobar otra sin tenerla a la vista sería cambiarle
 * la cuota sin darse cuenta.
 *
 * ── Qué pasa al cambiar algo ────────────────────────────────────────────────
 * Se vuelven a pedir las opciones al servidor, con la MISMA función con la que
 * se guardaría. Nada se calcula acá: si la pantalla hiciera su propia cuenta,
 * el plan que ve el aprobador y el que se graba podrían no coincidir.
 */
/**
 * Lo que el aprobador va a firmar, tal como quedó en los campos.
 *
 * Sube al contenedor porque los botones viven en el pie, fuera del scroll, y
 * tienen que mandar ESTOS números. Sin esto habría que duplicar el estado o
 * meter los botones adentro del bloque, que es justo lo que no se quería.
 */
type Propuesta = {
  monto: number | null
  cuota: number | null
  plazo: number | null
  tasaId: number | null
  /**
   * Solo si él es el último firmante: es el que otorga.
   *
   * En los demás va null, y el servidor ni la mira — una firma intermedia no
   * entrega plata, así que no hay fecha de entrega que fijar.
   */
  otorgamiento: string | null
}

function SeccionSolicitud({
  solicitud,
  tasas,
  liquidacion,
  firmas,
  soloLectura,
  puedeCambiarTasa,
  onCambio,
}: {
  solicitud: ISolicitudPorAprobar
  tasas: ITasaEmpresa[]
  liquidacion: number
  /**
   * La cadena completa, para saber qué dejó el que firmó antes.
   *
   * Sin esto el bloque arrancaba en lo que pidió el socio, y a partir de la
   * segunda firma eso ya no es lo que se está decidiendo.
   */
  firmas: IFirmaSolicitud[]
  /**
   * Puede cambiar la tasa.
   *
   * Va con el mismo acceso que la posición del socio ('VerPrestaciones'): si
   * no puede ver sus números, tampoco tiene por qué mover la variable que los
   * cambia todos. Sin el campo, el cálculo sigue saliendo con la tasa de
   * referencia, que es con la que se cotizó la solicitud.
   */
  puedeCambiarTasa?: boolean
  /**
   * Avisa al contenedor cada vez que cambia lo que se firmaría.
   *
   * Tiene que ser estable —useCallback— o el efecto que lo llama se vuelve a
   * disparar en cada render.
   */
  onCambio?: (p: Propuesta) => void
  /**
   * La solicitud ya se resolvió: no hay nada que decidir.
   *
   * Se apaga todo lo que sirve para editar —tasa, monto, cuota de referencia,
   * fecha y las tarjetas de cuota— y en su lugar queda lo que QUEDÓ. Dejar los
   * campos vivos invitaría a cambiar algo que ya no se puede cambiar.
   */
  soloLectura?: boolean
}) {
  const cadaCuanto = CADA_CUANTO[solicitud.TipoPlazo ?? -1] ?? ''

  /** La cuota que el socio eligió al pedir el préstamo. */
  const cuotaSocio = solicitud.CuotaCotizada ?? solicitud.CuotaSolicitada

  /**
   * Lo que dejó el último que firmó A FAVOR, si hubo alguno.
   *
   * >>> ES SOBRE ESTO QUE SE DECIDE, NO SOBRE LO QUE PIDIÓ EL SOCIO <<<
   * Si el primer aprobador bajó el monto de 25,000 a 10,000, el segundo tiene
   * que estar mirando 10,000: aprobar 25,000 sería deshacerle la decisión al
   * anterior sin enterarse.
   *
   * Se toma el de MAYOR Orden entre los que aprobaron: es el más reciente de
   * la cadena. Los rechazos no cuentan — ahí nadie autorizó nada y sus campos
   * de propuesta vienen en null.
   */
  const propuestasPrevias = useMemo(
    () => (firmas ?? [])
      .filter(f => f.Estado === 1 && f.MontoPropuesto != null)
      .sort((a, b) => a.Orden - b.Orden),
    [firmas],
  )


  /* >>> SE ABRE EN LO QUE PIDIÓ EL SOCIO <<<
     No en lo que dejó el aprobador anterior, aunque eso sea lo vigente. La
     pantalla arranca mostrando la solicitud tal como entró, y lo que propuso
     cada firmante está a un toque en las filas de abajo.

     Así el que firma ve primero lo que el socio pidió de verdad y después
     decide si lo mantiene o se queda con lo que ya recortaron: al revés,
     abrir en el recorte lo da por hecho antes de que lo mire. */
  const [monto, setMonto] = useState(
    solicitud.Monto != null ? String(solicitud.Monto) : '',
  )

  // La de referencia: es con la que se cotizó la solicitud, así que la
  // pantalla abre mostrando lo mismo que vio el socio.
  const [tasaId, setTasaId] = useState<number | null>(
    tasas.find(t => t.EsPrincipal)?.TasaId ?? tasas[0]?.TasaId ?? null,
  )

  /* La cuota con la que se piden las opciones.
     La que el socio ELIGIO —CuotaCotizada—, no la que escribió como
     referencia: la solicitada es un número suelto y la cotizada es la tarjeta
     que terminó tocando, o sea lo que de verdad pidió pagar. */
  const [cuotaRef, setCuotaRef] = useState(
    solicitud.CuotaCotizada != null
      ? String(solicitud.CuotaCotizada)
      : solicitud.CuotaSolicitada != null
        ? String(solicitud.CuotaSolicitada)
        : '',
  )

  // Por defecto hoy, y el calendario no deja elegir antes. Todavía NO se
  // guarda: no hay columna donde ponerla.
  const [otorgamiento, setOtorgamiento] = useState<string | null>(hoyISO())

  const [opciones, setOpciones] = useState<IOpcionCuota[]>([])
  const [calculando, setCalculando] = useState(false)
  const [errorOpciones, setErrorOpciones] = useState('')

  /**
   * Con qué números se pidieron las opciones que están en pantalla.
   *
   * >>> EL HUECO QUE TAPA <<<
   * La consulta espera 600 ms antes de salir. En ese rato el monto ya cambió
   * pero las tarjetas siguen siendo las del monto anterior, y `calculando`
   * todavía es false — así que se veían habilitadas y se podían tocar.
   *
   * Tocar una ahí elige una cuota calculada sobre un monto que ya no existe:
   * el total no cuadra y el rango con el que se valida es el viejo. Comparando
   * esta marca contra los números de ahora se sabe si lo que se está viendo
   * corresponde o está por reemplazarse.
   */
  const [opcionesDe, setOpcionesDe] = useState<string | null>(null)
  /* Arranca en la SUGERIDA, no en la del socio.
     La sugerida se arma alrededor de la cuota de referencia, que al abrir es
     justamente la que el socio eligió: o sea que al principio las dos dicen
     casi lo mismo. La diferencia aparece cuando el aprobador mueve el monto o
     la tasa — y ahí lo que corresponde seguir mostrando es el número
     recalculado, no uno que ya no cuadra con lo que está editando. */
  const [clave, setClave] = useState<string>('personalizada')

  const montoNum = Number(monto)
  const montoValido = monto.trim() !== '' && !isNaN(montoNum) && montoNum > 0

  // null mientras esté vacía o sea basura: el servidor la trata como "sin
  // cuota pedida" y devuelve solo la mínima y la máxima.
  const cuotaRefNum = (() => {
    const n = Number(cuotaRef)
    return cuotaRef.trim() !== '' && !isNaN(n) && n > 0 ? n : null
  })()

  /** Los tres números que definen un juego de opciones. */
  const claveOpciones = `${montoNum}|${cuotaRefNum}|${tasaId}`

  /**
   * Se recalcula cuando cambia el monto o la tasa.
   *
   * La cuota que se manda como referencia es la que pidió el socio: así la
   * opción "sugerida" sigue siendo la más cercana a lo que él quería, aunque
   * el aprobador suba o baje el monto.
   */
  useEffect(() => {
    // Resuelta no se recalcula nada: las opciones son para elegir, y acá ya no
    // hay nada que elegir. Además ahorra una llamada por cada vez que se abre
    // una solicitud vieja.
    if (soloLectura || !montoValido) {
      setOpciones([])
      return
    }

    let cancelado = false
    const id = setTimeout(async () => {
      setCalculando(true)
      try {
        /* comoAprobador: el plan se calcula sobre el tramo del SOCIO.
           Sin esto el servidor usaba el código de quien mira, y acá quien
           mira es el firmante: salía el mismo monto y la misma cuota pero
           otra cantidad de cuotas que la que el socio había pedido. */
        const response = await cooperativaService.getOpcionesCuota(
          montoNum,
          cuotaRefNum,
          solicitud.SolicitudId,
          tasaId,
          true,
        )
        if (cancelado) return

        if (response?.Success) {
          setOpciones(response.Data ?? [])
          // Con qué números se pidieron. Ver `recalculando`.
          setOpcionesDe(claveOpciones)
          setErrorOpciones('')
        } else {
          setOpciones([])
          setOpcionesDe(claveOpciones)
          setErrorOpciones(response?.ErrorMessage || 'No se pudieron calcular las cuotas.')
        }
      } catch (err) {
        if (cancelado) return
        setOpciones([])
        setErrorOpciones(handleError(err).message)
      } finally {
        if (!cancelado) setCalculando(false)
      }
    }, 600)

    return () => {
      cancelado = true
      clearTimeout(id)
    }
  }, [montoNum, montoValido, cuotaRefNum, tasaId, solicitud.SolicitudId, soloLectura])

  /**
   * Las propuestas que vale la pena listar.
   *
   * Dos filtros, los dos para que la lista no diga dos veces lo mismo:
   *
   *   - Fuera la que coincide con lo que pidió el socio: esa fila ya está.
   *   - Si dos firmantes propusieron los MISMOS números, queda uno solo —el
   *     más reciente—. Elegir entre dos filas idénticas no es elegir nada.
   */
  const propuestasListadas = useMemo(() => {
    const porValor = new Map<string, IFirmaSolicitud>()

    for (const p of propuestasPrevias) {
      if (p.MontoPropuesto === solicitud.Monto && p.CuotaPropuesta === cuotaSocio) continue
      porValor.set(`${p.MontoPropuesto}|${p.CuotaPropuesta}`, p)
    }

    return [...porValor.values()].sort((a, b) => a.Orden - b.Orden)
  }, [propuestasPrevias, solicitud.Monto, cuotaSocio])

  /**
   * En cuál fila está parado AHORA.
   *
   * Se deriva de los campos en vez de guardarse en un estado: así escribir a
   * mano un número que coincide con una de las propuestas la marca sola, y
   * tocar una fila y después editar el monto suelta la marca sin que haya que
   * acordarse de limpiarla. Un estado aparte se desincroniza en cuanto
   * aparece un camino que nadie previó.
   */
  const fuente: string = (() => {
    if (montoNum === solicitud.Monto && cuotaRefNum === cuotaSocio) return 'socio'

    const calza = propuestasListadas.find(
      p => montoNum === p.MontoPropuesto && cuotaRefNum === p.CuotaPropuesta,
    )

    return calza ? `prev-${calza.SolicitudAprobadorId}` : 'propia'
  })()

  const opcion = (k: string) => opciones.find(o => o.Clave === k && o.Ok !== false) ?? null
  const minima = opcion('minima')
  const sugerida = opcion('personalizada')
  const maxima = opcion('maxima')

  /**
   * ¿La cuota del socio TODAVÍA se puede autorizar?
   *
   * El tramo depende del monto: si el aprobador lo cambia, el rango de cuotas
   * se mueve y la del socio puede quedar afuera. Ahí no es que sea una opción
   * menos buena — es que el servidor la rechazaría.
   *
   * Por eso el botón se apaga en vez de desaparecer: el aprobador tiene que
   * seguir viendo qué había pedido, aunque ya no pueda dárselo.
   *
   * El rango sale de cualquiera de las opciones: las tres lo repiten.
   */
  /**
   * ¿El aprobador tocó algo?
   *
   * Mientras no cambie nada, la "sugerida" ES la del socio —se arma alrededor
   * de la cuota de referencia, que arranca justamente en la suya— y mostrar
   * las dos sería el mismo número repetido, ocupando una cuarta tarjeta para
   * no decir nada.
   *
   * Los valores de origen se congelan en el primer render: tienen que seguir
   * siendo los de la solicitud aunque el aprobador escriba encima.
   */
  const [origen] = useState(() => ({
    monto: solicitud.Monto ?? null,
    cuota: cuotaSocio ?? null,
    tasa: tasas.find(t => t.EsPrincipal)?.TasaId ?? tasas[0]?.TasaId ?? null,
  }))

  const hayCambios =
    (montoValido ? montoNum : null) !== origen.monto ||
    cuotaRefNum !== origen.cuota ||
    tasaId !== origen.tasa

  /**
   * Lo que está en pantalla NO corresponde a los números de ahora.
   *
   * Es true mientras la consulta viaja y también durante los 600 ms de espera
   * previos, que es donde estaba el agujero: ahí `calculando` todavía es false
   * y las tarjetas viejas se podían tocar.
   */
  const recalculando =
    montoValido && (calculando || opcionesDe !== claveOpciones)

  const rango = minima ?? sugerida ?? maxima

  /**
   * ¿Se puede volver a la cuota que eligió el socio?
   *
   * Tres condiciones. Las dos primeras son la misma idea: él eligió esa cuota
   * para UNAS condiciones, y sobre otras es un número suelto.
   *
   *   1. EL MONTO tiene que ser el que pidió.
   *   2. LA TASA tiene que ser la de referencia, con la que se le cotizó. Con
   *      otra, la misma cuota da otro plazo y otro total: el plan que sale no
   *      es el que él aceptó.
   *   3. Y tiene que entrar en el tramo, que es la validación de siempre.
   *
   * Sin las dos primeras se podía tocar "Eligió" después de mover el monto o
   * la tasa: el total de abajo quedaba calculado sobre una combinación que
   * nadie eligió.
   *
   * >>> OJO: EL TRAMO NO DEPENDE DE LA TASA <<<
   * CuotaMinima y CuotaMaxima salen de ParametroPrestamo, que se elige por
   * monto y planilla. Cambiar la tasa NO los mueve, así que la condición 3
   * sola nunca iba a apagar nada al cambiar la tasa.
   */
  const montoEsElPedido = montoValido && montoNum === solicitud.Monto
  const tasaEsLaDeReferencia = tasaId === origen.tasa

  const socioDisponible =
    montoEsElPedido &&
    tasaEsLaDeReferencia &&
    cuotaSocio != null &&
    rango?.CuotaMinima != null &&
    rango?.CuotaMaxima != null &&
    cuotaSocio >= rango.CuotaMinima &&
    cuotaSocio <= rango.CuotaMaxima

  /* >>> NADA ESCRIBE SOLO LA CUOTA DE REFERENCIA <<<
     Hubo acá un efecto que la reemplazaba por la sugerida cuando quedaba fuera
     de rango. Se sacó: el campo es lo que el aprobador escribió y queda como
     referencia, aunque el tramo nuevo ya no lo admita. Que las tarjetas se
     apaguen y el texto de abajo explique por qué es suficiente para que lo
     vea; corregírselo le cambiaba un número que él había puesto. */

  /* Si estaba elegida la del socio y dejó de poder usarse —porque el aprobador
     movió el monto— hay que soltarla. Si no, el botón queda apagado pero
     marcado, y abajo seguiría mostrándose un total que ya no corresponde a
     ninguna opción elegible. */
  useEffect(() => {
    const noSeMuestra = !hayCambios || (opciones.length > 0 && !socioDisponible)

    if (clave === 'solicitada' && noSeMuestra) {
      setClave('personalizada')
    }
  }, [clave, opciones.length, socioDisponible, hayCambios])

  /**
   * La opción que está elegida ahora.
   *
   * "solicitada" no viene del servidor: es la cuota del socio. Para ella se usa
   * la sugerida, que es justamente la que el servidor resolvió a partir de ese
   * número — el plazo y el total son los de esa.
   */
  const elegida = clave === 'solicitada' ? sugerida : opcion(clave)

  // Lo que el préstamo va a costar en total. Es la `Exposicion` que guarda la
  // cooperativa: capital más intereses, no el monto pelado.
  const totalAPagar = elegida?.TotalAPagar ?? null

  const consumo = totalAPagar != null && liquidacion > 0 ? totalAPagar / liquidacion : null

  /**
   * El calendario de la opción elegida: cuándo empieza a pagar y cuándo
   * termina.
   *
   * >>> NO SE CALCULA ACÁ <<<
   * Las fechas no son "cada quince días desde hoy": salen del calendario de
   * planilla de la empresa del socio, que es lo que resuelve
   * dbo.CalculoPrestamo. Proyectarlas en el teléfono daría un calendario
   * parecido y equivocado.
   *
   * Va con la fecha de otorgamiento cuando el que mira es el que cierra: es
   * la misma que va a recibir el servidor al crear el préstamo, así que lo
   * que ve es lo que va a quedar grabado.
   */
  const [plan, setPlan] = useState<ICuotaPlan[]>([])

  /* Con qué números se pidió el plan que está en pantalla. Misma idea que
     `opcionesDe`: la consulta espera 400 ms, y en ese rato las fechas que se
     ven son las del cálculo anterior. Sin esto el cambio aparecía de golpe y
     parecía que la pantalla se había colgado. */
  const [planDe, setPlanDe] = useState<string | null>(null)

  const desdeCuando = solicitud.EsAprobadorFinal ? otorgamiento : null

  const clavePlan = elegida
    ? `${elegida.MontoTotal}|${elegida.Tasa}|${elegida.Plazo}|${elegida.TipoPlazo}|${desdeCuando}`
    : null

  /** Hay una opción elegida pero su plan todavía no llegó. */
  const cargandoPlan = clavePlan != null && planDe !== clavePlan

  useEffect(() => {
    if (!elegida?.Plazo || !elegida?.MontoTotal || !elegida?.Tasa) {
      setPlan([])
      setPlanDe(null)
      return
    }

    let cancelado = false

    const id = setTimeout(async () => {
      try {
        const response = await cooperativaService.getPlanCuotas(
          elegida.MontoTotal!,
          elegida.Tasa!,
          elegida.Plazo!,
          elegida.TipoPlazo ?? solicitud.TipoPlazo ?? 0,
          {
            solicitudId: solicitud.SolicitudId,
            comoAprobador: true,
            desde: solicitud.EsAprobadorFinal ? otorgamiento : null,
          },
        )

        if (!cancelado) {
          setPlan(response?.Success ? response.Data ?? [] : [])
          setPlanDe(clavePlan)
        }
      } catch {
        // El plan es contexto, no la decisión: si no viene, el resto de la
        // pantalla sirve igual y no se muestra el bloque de fechas.
        if (!cancelado) {
          setPlan([])
          setPlanDe(clavePlan)
        }
      }
    }, 400)

    return () => {
      cancelado = true
      clearTimeout(id)
    }
  }, [
    elegida?.MontoTotal, elegida?.Tasa, elegida?.Plazo, elegida?.TipoPlazo,
    solicitud.SolicitudId, solicitud.TipoPlazo, desdeCuando, clavePlan,
  ])

  const primeraCuota = plan.length > 0 ? plan[0] : null
  const ultimaCuota = plan.length > 0 ? plan[plan.length - 1] : null

  /* Lo que se firmaría, hacia arriba.
     La cuota y el plazo salen de la opción ELEGIDA, no de lo que escribió en
     "Cuota de referencia": esa es solo el número con el que se pidió el
     cálculo, y firmarla dejaría guardada una cuota que no corresponde a
     ningún plan. */
  useEffect(() => {
    onCambio?.({
      monto: montoValido ? montoNum : null,
      cuota: elegida?.Cuota ?? null,
      plazo: elegida?.Plazo ?? null,
      tasaId,
      // Solo del que cierra: es el único que ve el campo y el único que
      // otorga. En los demás el servidor ni la mira.
      otorgamiento: solicitud.EsAprobadorFinal ? otorgamiento : null,
    })
  }, [
    montoNum, montoValido, elegida?.Cuota, elegida?.Plazo, tasaId,
    otorgamiento, solicitud.EsAprobadorFinal, onCambio,
  ])

  return (
    <YStack gap="$2.5" paddingVertical="$2">
      {/* ── Lo que pidió, sin tocar ────────────────────────────────────
          Juntas y apretadas: son de solo lectura y el aprobador las lee de un
          vistazo. El aire hace falta abajo, donde hay campos que tocar. */}
      <YStack gap="$2">
        {/* Fecha y tipo en una sola línea: son dos datos cortos y apilados
            gastaban dos renglones para nada. */}
        <XStack gap="$3">
          <Campo etiqueta="Fecha" valor={formatFecha(solicitud.FechaSolicitud)} />
          <Campo etiqueta="Tipo" valor={solicitud.TipoSolicitud || 'Préstamo'} />
        </XStack>

        {/* >>> LO QUE PIDIÓ EL SOCIO, COMO DATO <<<
            Estos tres números también están en los campos de abajo, pero ahí
            el aprobador los va a sobrescribir. Si vivieran solo en los inputs,
            en cuanto tocara el monto perdería de vista cuánto había pedido —y
            esa es justamente la referencia contra la que decide.

            Acá no se tocan nunca: son lo que el socio mandó. */}
        <XStack gap="$3">
          <Campo etiqueta="Monto pedido" valor={formatMonto(solicitud.Monto)} />
          <Campo
            etiqueta="Cuota que eligió"
            valor={
              cuotaSocio != null
                ? `${formatMonto(cuotaSocio)} ${cadaCuanto}`.trim()
                : '-'
            }
          />
        </XStack>

        <XStack gap="$3">
          <Campo
            etiqueta="Cuotas"
            valor={solicitud.Plazo != null ? String(solicitud.Plazo) : '-'}
          />
          {/* La cuota de referencia que escribió al pedirlo. Es otra cosa que
              la que eligió, y verlas juntas dice si se conformó con lo que le
              ofrecieron o si apuntaba a otro número. */}
          {/* <Campo
            etiqueta="Pidió pagar"
            valor={
              solicitud.CuotaSolicitada != null
                ? formatMonto(solicitud.CuotaSolicitada)
                : '-'
            }
          /> */}
        </XStack>

        {/* La descripción abajo y a lo ancho: es texto libre y en media fila
            se corta. */}
        {!!solicitud.Descripcion && (
          <Campo etiqueta="Descripción" valor={solicitud.Descripcion} lineas={3} />
        )}

        {(!!solicitud.Deduccion13vo || !!solicitud.Deduccion14vo) && (
          <XStack gap="$3">
            {!!solicitud.Deduccion13vo && (
              <Campo etiqueta="Deducción 13.º" valor={formatMonto(solicitud.Deduccion13vo)} />
            )}
            {!!solicitud.Deduccion14vo && (
              <Campo etiqueta="Deducción 14.º" valor={formatMonto(solicitud.Deduccion14vo)} />
            )}
          </XStack>
        )}

        {solicitud.EsRefinanciamiento === true && (
          <Campo
            etiqueta="Refinanciamiento"
            valor="Incluye lo que le falta del préstamo anterior"
          />
        )}

      </YStack>

      {/* ── Cómo quedó ───────────────────────────────────────────────
          Cuando ya se resolvió, en el lugar donde iban los campos para decidir
          va lo que se decidió. El espacio no queda vacío y se lee igual de
          arriba abajo: lo que pidió, y debajo en qué terminó. */}
      {soloLectura && <Resolucion solicitud={solicitud} cadaCuanto={cadaCuanto} />}

      {/* ── Lo que puede cambiar ─────────────────────────────────────── */}
      {!soloLectura && (
      <>
      <YStack paddingTop="$2" gap="$2.5" borderTopWidth={1} borderTopColor="$border">
        {/* ── De dónde parte ───────────────────────────────────────────
            Solo a partir de la SEGUNDA firma, y solo si el anterior cambió
            algo: con una sola propuesta sobre la mesa no hay nada que
            elegir, y repetir el mismo número en dos tarjetas sería ruido.

            Va arriba de los campos porque es un atajo para llenarlos: se
            toca una y el monto y la cuota de abajo se cargan solos. */}
        {propuestasListadas.length > 0 && (
          <YStack gap="$1.5">
            <FilaPropuesta
              etiqueta="Lo que pidió el socio"
              pie={formatFecha(solicitud.FechaSolicitud)}
              monto={solicitud.Monto}
              cuota={cuotaSocio}
              cadaCuanto={cadaCuanto}
              elegida={fuente === 'socio'}
              onPress={() => {
                if (solicitud.Monto != null) setMonto(String(solicitud.Monto))
                if (cuotaSocio != null) setCuotaRef(String(cuotaSocio))
              }}
            />

            {/* Una por firmante, en el orden en que firmaron: la cadena se lee
                de arriba abajo igual que pasó. */}
            {propuestasListadas.map(p => (
              <FilaPropuesta
                key={p.SolicitudAprobadorId}
                // El nombre y no "el anterior": con tres o más firmantes,
                // saber QUIÉN lo propuso cambia el peso que uno le da.
                etiqueta={primerNombre(p.Nombre) || p.UsuarioLogin || `Aprobador ${p.Orden}`}
                pie={`firmó ${formatFecha(p.FechaResolucion)}`}
                monto={p.MontoPropuesto}
                cuota={p.CuotaPropuesta}
                cadaCuanto={cadaCuanto}
                elegida={fuente === `prev-${p.SolicitudAprobadorId}`}
                onPress={() => {
                  if (p.MontoPropuesto != null) setMonto(String(p.MontoPropuesto))
                  if (p.CuotaPropuesta != null) setCuotaRef(String(p.CuotaPropuesta))
                }}
              />
            ))}

            {/* La última aparece sola, en cuanto escribe algo que no es
                ninguna de las anteriores. Sin onPress: no es un atajo, es el
                estado en el que ya está. */}
            {fuente === 'propia' && (
              <FilaPropuesta
                etiqueta="Lo que usted está sugiriendo"
                monto={montoValido ? montoNum : null}
                cuota={cuotaRefNum}
                cadaCuanto={cadaCuanto}
                elegida
              />
            )}
          </YStack>
        )}

        {/* La tasa primero: es la que menos se toca y la que cambia TODO lo de
            abajo. Puesta después del monto, uno ajusta el monto, ve la cuota y
            al cambiar la tasa tiene que volver a mirarla. */}
        {tasas.length > 0 && puedeCambiarTasa && (
          <AppSelect
            label="Tasa de interés"
            value={tasaId ?? undefined}
            onValueChange={v => setTasaId(Number(v))}
            options={tasas.map(t => ({
              // Se marca la de referencia: es con la que se cotizó, y cambiarla
              // sin saber cuál era la original es decidir a ciegas.
              label: `${t.Porcentaje}%${t.EsPrincipal ? ' · de referencia' : ''}`,
              value: String(t.TasaId),
            }))}
          />
        )}

        <AppInput
          label="Monto autorizado"
          value={monto}
          onChangeText={(v: string) => setMonto(soloDecimal(v))}
          keyboardType="decimal-pad"
          placeholder="0.00"
          error={!montoValido && monto.trim() !== '' ? 'Escribí un monto mayor que cero' : ''}
        />

        {/* La cuota con la que se recalcula.
            Arranca en la que el socio eligió, así lo primero que el aprobador
            ve es la propuesta de él. Al escribir otra, la opción "sugerida" se
            rearma alrededor de ESE número — y la del socio sigue abajo, para
            poder comparar contra lo que había. */}
        <AppInput
          label="Cuota de referencia"
          value={cuotaRef}
          onChangeText={(v: string) => setCuotaRef(soloDecimal(v))}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />

        {/* La fecha en que se entrega el dinero la define quien cierra:
            solo el último firmante la ve, para los demás no tiene sentido. */}
        {solicitud.EsAprobadorFinal && (
          <AppDatePicker
            label="Fecha de otorgamiento"
            value={otorgamiento}
            onChange={setOtorgamiento}
            minDate={hoyISO()}
          />
        )}
      </YStack>

      {/* ── La cuota ─────────────────────────────────────────────────── */}
      <YStack gap="$1.5">
        <XStack alignItems="center" gap="$2">
          {/* <Percent size={13} color="#94A3B8" /> */}
          <Text fontSize={11} fontWeight="700" color="$text" flex={1}>
            Cuota solicitada
          </Text>
          <Text fontSize={10} color="$textMuted">
            {cadaCuanto}
          </Text>
        </XStack>

        {/* `recalculando` y no `calculando`: también cubre la espera previa a
            la consulta, donde las tarjetas que se ven son las del monto
            anterior. Dejarlas visibles ahí era dejar tocar números viejos. */}
        {recalculando ? (
          <XStack alignItems="center" gap="$2" paddingVertical="$3">
            <Spinner size="small" color="$primary" />
            <Text fontSize={11} color="$textMuted">
              Recalculando...
            </Text>
          </XStack>
        ) : errorOpciones ? (
          <Text fontSize={11} color="$textMuted" paddingVertical="$2" lineHeight={16}>
            {errorOpciones}
          </Text>
        ) : (
          <>
            {/* La que el socio ELIGIÓ, aparte y primero.
                Es CuotaCotizada, no CuotaSolicitada: la solicitada es el
                número que escribió como referencia, y la cotizada es la de la
                tarjeta que terminó tocando — la que de verdad pidió pagar.
                Mostrar la otra le atribuiría una decisión que no tomó. */}
            {/* Las cuatro juntas, en el orden en que crece la cuota: mínima,
                sugerida, la del socio y máxima.

                La del socio va entre la sugerida y la máxima y no al principio
                —como estaba— porque así la fila se lee como una escala: de
                izquierda a derecha se paga más por período y se termina antes.
                Sacada de esa escala, su número no se podía comparar con los
                otros tres de un vistazo. */}
            <XStack gap="$1.5">
              <BotonCuota
                etiqueta="Mínima"
                cuota={minima?.Cuota ?? null}
                plazo={minima?.Plazo ?? null}
                elegida={clave === 'minima'}
                deshabilitada={!minima}
                onPress={() => setClave('minima')}
              />
              <BotonCuota
                etiqueta="Sugerida"
                cuota={sugerida?.Cuota ?? null}
                plazo={sugerida?.Plazo ?? null}
                elegida={clave === 'personalizada'}
                deshabilitada={!sugerida}
                onPress={() => setClave('personalizada')}
              />
              {/* La del socio aparece SOLO cuando el aprobador cambió algo.
                  Sin cambios es el mismo número que la sugerida, y una tarjeta
                  repetida le roba ancho a las otras tres. Apenas toca el
                  monto, la cuota o la tasa, vuelve — que es justo cuando sirve
                  para comparar. */}
              {hayCambios && (
                <BotonCuota
                  etiqueta="Eligió"
                  cuota={cuotaSocio}
                  plazo={solicitud.Plazo ?? null}
                  elegida={clave === 'solicitada'}
                  deshabilitada={!socioDisponible}
                  /* Tocarlo devuelve la cuota de referencia a la del socio, no
                     solo marca el botón: la opción "sugerida" se arma alrededor
                     de ese campo, así que sin esto el botón diría una cuota y
                     el plan de abajo mostraría otra. */
                  onPress={() => {
                    if (cuotaSocio != null) setCuotaRef(String(cuotaSocio))
                    setClave('solicitada')
                  }}
                />
              )}
              <BotonCuota
                etiqueta="Máxima"
                cuota={maxima?.Cuota ?? null}
                plazo={maxima?.Plazo ?? null}
                elegida={clave === 'maxima'}
                deshabilitada={!maxima}
                onPress={() => setClave('maxima')}
              />
            </XStack>


          </>
        )}
      </YStack>
      </>
      )}

      {/* ── Lo que costaría ──────────────────────────────────────────── */}
      {elegida && (
        <YStack
          gap="$1.5"
          padding="$3"
          borderRadius="$4"
          backgroundColor="$backgroundSurface"
        >
          {/* El total no se entiende sin de dónde sale. Antes solo estaban los
              intereses y el total: faltaba el capital, que es la otra mitad de
              la suma — y en un refinanciamiento ese capital NO es lo que el
              socio pidió, porque arrastra el saldo del préstamo anterior. */}
          <Fila
            titulo={
              elegida.EsRefinanciamiento === true
                ? 'Capital (incluye lo anterior)'
                : 'Capital'
            }
            sub={
              elegida.EsRefinanciamiento === true && elegida.SaldoAnterior != null
                ? `${formatCorto(elegida.MontoSolicitado)} nuevo + ${formatCorto(elegida.SaldoAnterior)} que arrastra`
                : undefined
            }
            monto={formatMonto(elegida.MontoTotal)}
          />
          <Fila titulo="Intereses" monto={formatMonto(elegida.InteresTotal)} />

          {/* Solo si el tramo lo cobra. Es plata que sale aparte del plan, así
              que verlo entre el capital y el total evita la pregunta. */}
          {!!elegida.CargoAdministrativo && (
            <Fila
              titulo="Cargo administrativo"
              monto={formatMonto(elegida.CargoAdministrativo)}
            />
          )}

          <Fila
            titulo="Total a pagar"
            sub={elegida.Plazo != null ? `en ${elegida.Plazo} cuotas` : undefined}
            monto={formatMonto(totalAPagar)}
            fuerte
          />

          {/* ── Cuándo lo paga ───────────────────────────────────────────
              El total no dice hasta cuándo queda comprometido, y eso es la
              mitad de la decisión: 10,000 en 11 cuotas y 10,000 en 60 son
              dos préstamos distintos aunque el total se parezca.

              Las fechas NO se calculan acá: salen del calendario de planilla
              de la empresa del socio, que es lo que resuelve el servidor.
              Proyectarlas en el teléfono daría un calendario parecido y
              equivocado. */}
          {(cargandoPlan || (primeraCuota && ultimaCuota)) && (
            <YStack gap="$1.5" paddingTop="$1.5" borderTopWidth={1} borderTopColor="$border">
              {/* El bloque no desaparece mientras recalcula: si se fuera y
                  volviera, el contenido de abajo saltaría en cada tecla. */}
              {cargandoPlan ? (
                <XStack alignItems="center" gap="$2" paddingVertical="$1">
                  <Spinner size="small" color="$primary" />
                  <Text fontSize={10} color="$textMuted">
                    Calculando las fechas de pago...
                  </Text>
                </XStack>
              ) : (
              <XStack gap="$3">
                <Campo
                  etiqueta="Primera cuota"
                  valor={formatFecha(primeraCuota!.FechaPago)}
                />
                <Campo
                  etiqueta="Última cuota"
                  valor={formatFecha(ultimaCuota!.FechaPago)}
                />
              </XStack>
              )}

              {/* Solo para el que cierra: es el único que fija la fecha de
                  entrega, y estas fechas salen de ella. Para los demás el
                  calendario es una proyección desde hoy y decirlo sería
                  prometer algo que todavía nadie definió. */}
              {solicitud.EsAprobadorFinal && !cargandoPlan && (
                <Text fontSize={10} color="$textMuted" lineHeight={15}>
                  Calculadas desde la fecha de otorgamiento. Son las que van a
                  quedar guardadas.
                </Text>
              )}
            </YStack>
          )}

          {/* Cuánto de la liquidación se lleva ESTE préstamo. Es la cuenta que
              la cooperativa guarda como Exposicion sobre RespaldoPrestaciones.

              Va acá y no en la posición de arriba: aquella es su situación de
              hoy, esta es la que cambia con lo que el aprobador decida. */}
          {consumo != null && (
            <YStack gap="$1.5" paddingTop="$1.5">
              <XStack alignItems="center" gap="$2">
                <Text fontSize={10} color="$textMuted" flex={1}>
                  Se lleva de su liquidación
                </Text>
                <Text
                  fontSize={12}
                  fontWeight="800"
                  color={consumo >= 1 ? '$error' : consumo >= 0.75 ? '$warning' : '$success'}
                >
                  {Math.round(consumo * 100)}%
                </Text>
              </XStack>

              <View height={6} borderRadius={999} backgroundColor="$backgroundElevated" overflow="hidden">
                <View
                  height={6}
                  borderRadius={999}
                  width={`${Math.min(1, consumo) * 100}%`}
                  backgroundColor={
                    consumo >= 1 ? '#EF4444' : consumo >= 0.75 ? '#F59E0B' : '#22C55E'
                  }
                />
              </View>
            </YStack>
          )}
        </YStack>
      )}

      {/* ── El plan completo, plegado ──────────────────────────────────
          Abajo de todo y cerrado: son decenas de filas y abiertas empujarían
          los botones fuera de la pantalla. El resumen de arriba alcanza para
          decidir; esto es para el que quiere ver cuota por cuota. */}
      {(cargandoPlan || plan.length > 0) && (
        <Plegable
          /* El título lleva el estado: es lo único que se ve con el plegable
             cerrado, y sin esto el número de cuotas cambiaba de golpe sin
             avisar que había algo recalculándose. */
          titulo={cargandoPlan ? 'Recalculando las cuotas...' : `Ver las ${plan.length} cuotas`}
        >
          {cargandoPlan ? (
            <XStack alignItems="center" gap="$2" paddingVertical="$3">
              <Spinner size="small" color="$primary" />
              <Text fontSize={11} color="$textMuted">
                Recalculando el plan de cuotas...
              </Text>
            </XStack>
          ) : (
          <YStack paddingVertical="$1">
            {/* El encabezado, una sola vez. Sin esto, tres columnas de
                números no dicen cuál es cuál. */}
            <XStack paddingBottom="$1.5" gap="$2">
              <Text fontSize={9} color="$textMuted" width={26}>
                #
              </Text>
              <Text fontSize={9} color="$textMuted" flex={1}>
                Fecha
              </Text>
              <Text fontSize={9} color="$textMuted" width={70} textAlign="right">
                Capital
              </Text>
              <Text fontSize={9} color="$textMuted" width={62} textAlign="right">
                Interés
              </Text>
              <Text fontSize={9} color="$textMuted" width={74} textAlign="right">
                Cuota
              </Text>
            </XStack>

            {plan.map(c => (
              <XStack
                key={c.NumeroCuota}
                gap="$2"
                paddingVertical="$1"
                borderTopWidth={1}
                borderTopColor="$border"
              >
                <Text fontSize={10} color="$textMuted" width={26}>
                  {c.NumeroCuota}
                </Text>
                <Text fontSize={10} color="$text" flex={1}>
                  {formatFecha(c.FechaPago)}
                </Text>
                <Text fontSize={10} color="$textMuted" width={70} textAlign="right">
                  {formatMonto(c.CapitalCuota)}
                </Text>
                <Text fontSize={10} color="$textMuted" width={62} textAlign="right">
                  {formatMonto(c.InteresCuota)}
                </Text>
                <Text fontSize={10} fontWeight="700" color="$text" width={74} textAlign="right">
                  {formatMonto(c.Cuota)}
                </Text>
              </XStack>
            ))}
          </YStack>
          )}
        </Plegable>
      )}

      {/* Mientras no haya dónde guardarla, que no parezca que ya quedó.
          Resuelta no aplica: no hay cambios que guardar. */}
      {!soloLectura && (
        <Text fontSize={10} color="$textMuted" lineHeight={15}>
          Estos cambios todavía no se guardan: la resolución es el paso siguiente.
        </Text>
      )}
    </YStack>
  )
}

/**
 * Cómo terminó una solicitud que ya se resolvió.
 *
 * Reemplaza a los campos editables, no se suma a ellos: una vez aprobada o
 * rechazada no hay nada que decidir, y dejar los inputs vivos sería ofrecer
 * algo que la pantalla no puede cumplir.
 *
 * Solo muestra lo que de verdad quedó guardado. El monto autorizado no se
 * repite acá —ya está arriba como "Monto pedido"— porque mientras la
 * resolución no se grabe, los dos serían el mismo número con dos nombres, y
 * eso diría que alguien autorizó algo que nadie autorizó.
 */
function Resolucion({
  solicitud,
  cadaCuanto,
}: {
  solicitud: ISolicitudPorAprobar
  cadaCuanto: string
}) {
  const aspecto = COLOR_ESTADO[solicitud.Estado ?? -1] ?? ESTADO_NEUTRO
  const aprobada = solicitud.Estado === ESTADO_SOLICITUD_COO.APROBADO

  return (
    <YStack paddingTop="$2" gap="$2.5" borderTopWidth={1} borderTopColor="$border">
      <XStack alignItems="center" gap="$2">
        <View width={8} height={8} borderRadius={999} backgroundColor={aspecto.color} />
        <Text fontSize={12} fontWeight="800" color={aspecto.token}>
          {solicitud.EstadoNombre || (aprobada ? 'Aprobada' : 'Rechazada')}
        </Text>
      </XStack>

      {/* Solo si alguien grabó una cuota distinta de la que eligió el socio.
          Si no hay, no se inventa: la de arriba ya la muestra. */}
      {solicitud.CuotaAutorizada != null && (
        <XStack gap="$3">
          <Campo
            etiqueta="Cuota autorizada"
            valor={`${formatMonto(solicitud.CuotaAutorizada)} ${cadaCuanto}`.trim()}
          />
        </XStack>
      )}

      {/* Lo que hizo ÉL, que no siempre es lo que pasó con la solicitud: pudo
          aprobarla y que otro la rechazara después. */}
      {!!solicitud.MiFechaResolucion && (
        <XStack gap="$3">
          <Campo etiqueta="Tu firma" valor={solicitud.MiEstadoNombre} />
          <Campo etiqueta="Fecha" valor={formatFecha(solicitud.MiFechaResolucion)} />
        </XStack>
      )}

      {!!solicitud.MiMotivoRechazo && (
        <Campo etiqueta="Motivo del rechazo" valor={solicitud.MiMotivoRechazo} lineas={4} />
      )}
    </YStack>
  )
}

/**
 * Una tarjeta con encabezado.
 *
 * El título va DENTRO de la tarjeta, sobre una franja de otro fondo, y no
 * suelto encima: así cada bloque se lee como una pieza y no como una lista de
 * datos con una etiqueta flotando arriba, que era lo que hacía ver todo plano.
 *
 * Un solo fondo distinto — el del encabezado — para no volver a la banda
 * gris/claro/gris que ya habíamos sacado de Mis solicitudes.
 */
function Tarjeta({
  titulo,
  icono: Icono,
  color = '#94A3B8',
  colapsable,
  children,
}: {
  titulo: string
  icono: React.ComponentType<any>
  color?: string
  /**
   * Se abre y se cierra tocando el encabezado.
   *
   * Está acá y no en un AccordionSection aparte para que las tres tarjetas
   * tengan EL MISMO encabezado. Con el acordeón de la app, la de Detalle se
   * veía distinta de las otras dos sin ninguna razón: son el mismo tipo de
   * bloque y una de ellas, además, se puede plegar.
   */
  colapsable?: boolean
  children: React.ReactNode
}) {
  const [abierta, setAbierta] = useState(!colapsable)

  return (
    <YStack
      borderRadius="$5"
      backgroundColor="$backgroundElevated"
      borderWidth={1}
      borderColor="$border"
      overflow="hidden"
      {...shadows.sm}
    >
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$3.5"
        paddingVertical="$2.5"
        backgroundColor="$backgroundSurface"
        borderBottomWidth={abierta ? 1 : 0}
        borderBottomColor="$border"
        pressStyle={colapsable ? { opacity: 0.7 } : undefined}
        onPress={colapsable ? () => setAbierta(a => !a) : undefined}
      >
        <Icono size={14} color={color} />
        <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.3} flex={1}>
          {titulo.toUpperCase()}
        </Text>
        {colapsable && (
          abierta
            ? <ChevronUp size={16} color="#94A3B8" />
            : <ChevronDown size={16} color="#94A3B8" />
        )}
      </XStack>

      {abierta && (
        <YStack paddingHorizontal="$3.5" paddingVertical="$1.5">
          {children}
        </YStack>
      )}
    </YStack>
  )
}

type RutaParams = {
  detalleAprobacion: { solicitudId: number }
}

export default function DetalleAprobacionScreen() {
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RutaParams, 'detalleAprobacion'>>()
  const solicitudId = route.params?.solicitudId

  const [detalle, setDetalle] = useState<IDetalleAprobacion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  usePageHeader({
    left: (
      <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
        <ArrowLeftStyled size={22} />
      </View>
    ),
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitud
      </Text>
    ),
  })

  /** La consulta, sin tocar los indicadores: cada quien pone el suyo. */
  const consultar = useCallback(async () => {
    try {
      const response = await cooperativaService.getDetalleAprobacion(solicitudId)

      if (response?.Success) {
        setDetalle(response.Data ?? null)
        setError('')
      } else {
        setDetalle(null)
        setError(response?.ErrorMessage || 'No se pudo cargar la solicitud.')
      }
    } catch (err) {
      setDetalle(null)
      setError(handleError(err).message)
    }
  }, [solicitudId])

  /** Al entrar y al reintentar desde el error: con esqueleto. */
  const cargar = useCallback(async () => {
    setCargando(true)
    await consultar()
    setCargando(false)
  }, [consultar])

  /**
   * Deslizar para recargar.
   *
   * Hace falta: el ahorro, los préstamos y las prestaciones los mueve la
   * cooperativa desde su sistema, y hasta ahora la única forma de ver un
   * cambio era salir de la pantalla y volver a entrar.
   *
   * Va con su propio indicador y NO con el esqueleto: reemplazar la pantalla
   * entera por el esqueleto haría perder de vista lo que se estaba mirando.
   */
  const [refrescando, setRefrescando] = useState(false)

  const onRefresh = async () => {
    setRefrescando(true)
    await consultar()
    setRefrescando(false)
  }

  // ── Firmar ───────────────────────────────────────────────────────────
  const { showToast } = useShowToast()

  /** Lo que el bloque de la solicitud tiene cargado ahora mismo. */
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)

  /* Estable a propósito: SeccionSolicitud lo llama desde un efecto, y una
     función nueva en cada render lo volvería a disparar sin parar. */
  const alCambiarPropuesta = useCallback((p: Propuesta) => setPropuesta(p), [])

  const [resolviendo, setResolviendo] = useState(false)
  const [confirmar, setConfirmar] = useState<'aprobar' | 'rechazar' | null>(null)
  const [motivo, setMotivo] = useState('')

  /** Sin los tres números no hay qué firmar. */
  const puedeAprobar =
    !!propuesta?.monto && !!propuesta?.cuota && !!propuesta?.plazo

  const resolver = async (aprobar: boolean) => {
    setResolviendo(true)

    try {
      const response = await cooperativaService.resolverAprobacion({
        SolicitudId: solicitudId,
        Aprobar: aprobar,
        MontoAutorizado: aprobar ? propuesta?.monto ?? null : null,
        CuotaAutorizada: aprobar ? propuesta?.cuota ?? null : null,
        PlazoResultante: aprobar ? propuesta?.plazo ?? null : null,
        TasaId: aprobar ? propuesta?.tasaId ?? null : null,
        MotivoRechazo: aprobar ? null : motivo.trim(),
        FechaOtorgamiento: aprobar ? propuesta?.otorgamiento ?? null : null,
      })

      if (!response?.Success) {
        showToast(
          'error',
          'No se pudo firmar',
          response?.ErrorMessage || 'Intentá de nuevo.',
          6000,
          'top',
        )
        setConfirmar(null)
        return
      }

      /* La firma quedó, y eso es lo único que se dice.
         Si el aviso al siguiente no salió, queda en el log del servidor: la
         firma vale igual y contarlo acá solo haría dudar de algo que sí se
         guardó. */
      showToast(
        'success',
        !aprobar
          ? 'Solicitud rechazada'
          : response.Data?.EsUltimaFirma
            ? 'Préstamo otorgado'
            : 'Solicitud aprobada',
        response.Data?.Mensaje || 'Listo.',
        4000,
        'top',
      )

      setConfirmar(null)
      navigation.goBack()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 6000, 'top')
      setConfirmar(null)
    } finally {
      setResolviendo(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      cargar()
    }, [cargar]),
  )

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  if (error || !detalle?.Solicitud) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage">
        <ErrorState message={error || 'No se encontró la solicitud.'} onRetry={cargar} />
      </YStack>
    )
  }

  const s = detalle.Solicitud
  const emp = detalle.Empleado
  const antiguedad = detalle.Prestaciones[0]
  const aspecto = COLOR_ESTADO[s.Estado ?? -1] ?? ESTADO_NEUTRO
  const cuenta = detalle.EstadoCuenta

  /**
   * Ya se resolvió: la pantalla pasa a ser de consulta.
   *
   * Se mira el estado de LA SOLICITUD, no el del firmante: aunque él todavía
   * no haya firmado, si la cadena ya cerró —alguien la rechazó, o juntó las
   * firmas que hacían falta— su voto ya no cambia nada.
   */
  const resuelta =
    s.Estado === ESTADO_SOLICITUD_COO.APROBADO ||
    s.Estado === ESTADO_SOLICITUD_COO.RECHAZADO

  return (
    <YStack flex={1} backgroundColor="$backgroundPage">
      <RNScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. El socio ─────────────────────────────────────────────
            Compacto a propósito: es contexto para decidir, no el objetivo de
            la pantalla. Dos columnas por fila para que entre en poco alto. */}
        <Tarjeta titulo="Información del socio" icono={User} color={aspecto.color}>
          <XStack paddingVertical="$2" gap="$3" alignItems="center">
            <View
              width={40}
              height={40}
              borderRadius={999}
              alignItems="center"
              justifyContent="center"
              backgroundColor={`${aspecto.color}1F`}
            >
              <Text fontSize={14} fontWeight="800" color={aspecto.token}>
                {iniciales(s.SocioNombre, s.SocioCodigo)}
              </Text>
            </View>

            <YStack flex={1} gap="$0.5">
              <Text fontSize={13} fontWeight="700" color="$text" numberOfLines={1}>
                {s.SocioNombre || s.SocioCodigo}
              </Text>
              <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                {s.SocioCodigo}
                {emp?.Posicion ? ` · ${emp.Posicion}` : ''}
              </Text>
            </YStack>
          </XStack>

          {emp ? (
            <YStack paddingBottom="$2" gap="$2">
              <XStack gap="$3">
                <Campo etiqueta="Departamento" valor={emp.Departamento} />
                <Campo etiqueta="Centro de costos" valor={emp.Centro_Costos} />
              </XStack>
              <XStack gap="$3">
                <Campo etiqueta="Unidad" valor={emp.Unidad_Negocios} />
                <Campo etiqueta="Antigüedad" valor={formatAntiguedad(antiguedad)} />
              </XStack>
              <XStack gap="$3">
                <Campo etiqueta="Jefe" valor={emp.Jefe_InmediatoName || emp.NameJefe} />
              </XStack>
            </YStack>
          ) : (
            // Planilla es otra base. Si no respondió se dice: dejar los campos
            // vacíos haría pensar que el empleado no tiene centro de costos.
            <Text fontSize={11} color="$textMuted" paddingBottom="$3" lineHeight={16}>
              No se pudo leer su información de planilla en este momento.
            </Text>
          )}
        </Tarjeta>

        {/* ── 2 y 3. La posición y su detalle ──────────────────────────
            Las dos van juntas detrás del acceso 'VerPrestaciones': son los
            números del socio —ahorro, deuda y liquidación— y no todos los
            firmantes tienen por qué verlos.

            El servidor ni siquiera los manda sin ese acceso, así que acá no se
            está escondiendo nada que haya llegado: no hay qué mostrar. */}
        {detalle.PuedeVerPrestaciones ? (
          <>
        <Tarjeta titulo="Posición del socio" icono={Wallet} color={aspecto.color}>
          <XStack gap="$2" paddingVertical="$2.5" alignItems="stretch">
            <MiniCard
              etiqueta="Ahorro"
              valor={formatCorto(cuenta?.SaldoCuentas)}
              detalle={cuenta ? `${cuenta.TotalCuentas} cuenta${cuenta.TotalCuentas === 1 ? '' : 's'}` : ''}
            />
            <MiniCard
              etiqueta="Préstamo"
              valor={formatCorto(cuenta?.SaldoPrestamos)}
              detalle={cuenta ? `${cuenta.TotalPrestamos} vigente${cuenta.TotalPrestamos === 1 ? '' : 's'}` : ''}
              color={cuenta && cuenta.SaldoPrestamos > 0 ? '#EF4444' : undefined}
            />
            {/* El neto puede ser negativo: debe más de lo que tiene. Se pinta
                para que no se lea como un ahorro más. */}
            <MiniCard
              etiqueta="Neto"
              valor={formatCorto(cuenta?.SaldoNeto)}
              detalle="ahorro − deuda"
              color={cuenta && cuenta.SaldoNeto < 0 ? '#EF4444' : '#22C55E'}
            />
            <MiniCard
              etiqueta="Liquidación"
              valor={formatCorto(detalle.PrestacionesNeto)}
              detalle="si saliera hoy"
            />
          </XStack>

          {!cuenta && (
            <Text fontSize={11} color="$textMuted" paddingBottom="$2.5" lineHeight={16}>
              No se pudo leer su estado de cuenta: el ahorro y los préstamos
              pueden estar incompletos.
            </Text>
          )}

          <BarraRespaldo
            liquidacion={detalle.PrestacionesNeto}
            exposicion={detalle.DeudaNeta}
            veces={detalle.VecesCubierto}
            cuenta={cuenta}
          />

          {/* ── El detalle de esa posición, ADENTRO ──────────────────
              Es lo MISMO que las mini cards de arriba, desglosado: ellas
              son los totales y esto las líneas que los forman. Como
              tarjeta aparte se leían como dos temas distintos.

              Plegado y no abierto: son muchas filas y, de entrada,
              empujarían la solicitud fuera de la pantalla. Va con
              AccordionSection y no con el plegado de Tarjeta porque ahora
              lo que se pliega es una parte de la tarjeta, no la tarjeta. */}
          <Plegable titulo="Ver el detalle">
            <Pestanas
              cuentas={detalle.Cuentas}
              prestamos={detalle.Prestamos}
              prestaciones={detalle.Prestaciones}
              neto={detalle.PrestacionesNeto}
            />
          </Plegable>
        </Tarjeta>
          </>
        ) : (
          <></>)}

        {/* ── 4. La solicitud ──────────────────────────────────────────
            Lo que pidió arriba, sin tocar, y abajo lo que el aprobador puede
            cambiar. Abierta: es donde va a trabajar. */}
        <Tarjeta titulo="Solicitud" icono={FileText} color={aspecto.color}>
          <SeccionSolicitud
            solicitud={s}
            tasas={detalle.Tasas}
            liquidacion={detalle.PrestacionesNeto}
            firmas={detalle.Firmas ?? []}
            puedeCambiarTasa={detalle.PuedeVerPrestaciones}
            soloLectura={resuelta}
            onCambio={alCambiarPropuesta}
          />
        </Tarjeta>

      </RNScrollView>

      {/* ── Los botones ─────────────────────────────────────────────────
          Van fijos al pie y fuera del scroll: con el plan de pagos abierto, al
          final de la página quedarían a varias pantallas de distancia.

          Resuelta no los lleva: el pie desaparece y el contenido gana ese alto.
          Dejarlos apagados ocuparía una franja fija para no ofrecer nada.

          Los dos iguales: mismo ancho, mismo alto, mismo relleno y el mismo
          icono. Lo único que los distingue es el color, que ya dice cuál es
          cuál sin necesidad de darle más peso a uno que a otro. */}
      {!resuelta && (
      <XStack
        gap="$2.5"
        paddingHorizontal="$4"
        paddingTop="$3"
        paddingBottom="$4"
        backgroundColor="$backgroundPage"
        borderTopWidth={1}
        borderTopColor="$border"
      >
        {/* Mismo tamaño y misma forma que Aprobar, pero vacío: el rojo va en
            la orilla, el texto y el icono. Relleno, los dos botones gritaban
            lo mismo desde el pie y el rojo pesaba más de lo que debía. */}
        <Button
          flex={1}
          height={46}
          borderRadius={12}
          backgroundColor="transparent"
          borderWidth={1.5}
          borderColor="#EF4444"
          pressStyle={{ opacity: 0.6, backgroundColor: '#EF44441A' }}
          disabled={resolviendo}
          opacity={resolviendo ? 0.5 : 1}
          icon={<X size={16} color="#EF4444" />}
          onPress={() => {
            setMotivo('')
            setConfirmar('rechazar')
          }}
        >
          <Text color="#EF4444" fontWeight="700" fontSize={13}>
            Rechazar
          </Text>
        </Button>

        <Button
          flex={1}
          height={46}
          borderRadius={12}
          backgroundColor="$primary"
          pressStyle={{ opacity: 0.8 }}
          // Sin los tres números no hay qué firmar: mientras el monto o la
          // cuota no estén resueltos, el botón no ofrece algo que el servidor
          // va a rechazar.
          disabled={!puedeAprobar || resolviendo}
          opacity={!puedeAprobar || resolviendo ? 0.5 : 1}
          icon={resolviendo ? undefined : <Check size={16} color="#FFFFFF" />}
          onPress={() => setConfirmar('aprobar')}
        >
          {resolviendo ? (
            <Spinner size="small" color="white" />
          ) : (
            <Text color="white" fontWeight="700" fontSize={13}>
              Aprobar
            </Text>
          )}
        </Button>
      </XStack>
      )}

      {/* ── Confirmar ────────────────────────────────────────────────────
          Aprobar mueve plata y rechazar cierra la solicitud para todos los
          firmantes: ninguna de las dos debería pasar de un toque. */}
      <ConfirmDialog
        open={confirmar === 'aprobar'}
        onOpenChange={abierto => !abierto && setConfirmar(null)}
        /* El último firmante no firma: OTORGA. Ahí nace el préstamo con su
           plan de cuotas y la solicitud queda cerrada, así que el diálogo
           tiene que decir eso y no "se registrará su firma". */
        title={s.EsAprobadorFinal ? 'Otorgar el préstamo' : 'Aprobar la solicitud'}
        message={
          propuesta?.monto != null && propuesta?.cuota != null
            ? `${s.EsAprobadorFinal ? 'Se otorgan' : 'Se autorizan'} ${formatMonto(propuesta.monto)} en ${propuesta.plazo} cuotas de ${formatMonto(propuesta.cuota)}.`
              + (s.EsAprobadorFinal ? ' Con esto queda creado el préstamo.' : '')
            : 'Se registrará su firma sobre esta solicitud.'
        }
        confirmLabel={s.EsAprobadorFinal ? 'Otorgar' : 'Aprobar'}
        confirmColor="#22C55E"
        loading={resolviendo}
        onConfirm={() => resolver(true)}
        onCancel={() => setConfirmar(null)}
      />

      <ConfirmDialog
        open={confirmar === 'rechazar'}
        onOpenChange={abierto => !abierto && setConfirmar(null)}
        title="Rechazar la solicitud"
        message="El socio va a leer el motivo, así que escribilo completo."
        confirmLabel="Rechazar"
        confirmColor="#EF4444"
        loading={resolviendo}
        // El servidor lo exige igual; acá se pide antes para no hacer el viaje
        // de ida y vuelta solo para que conteste que falta.
        onConfirm={() => motivo.trim() && resolver(false)}
        onCancel={() => setConfirmar(null)}
        extra={
          <AppInput
            label="Motivo"
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Por qué no se puede autorizar"
            multiline
            numberOfLines={3}
          />
        }
      />
    </YStack>
  )
}
