import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { YStack, XStack, Text, ScrollView, View, Button, styled } from 'tamagui'
import {
  ArrowLeft, CheckCircle2, Clock, Wallet, ChevronUp, ChevronDown,
} from 'lucide-react-native'

import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { ICuotaPrestamo } from '../../api/modules/cooperativa/cooperativa.types'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'

/**
 * Detalle de un préstamo aprobado: su plan de cuotas.
 *
 * Responde lo que el socio quiere saber de un préstamo: cuánto le van a
 * descontar, cada cuándo, y hasta cuándo.
 *
 * SE LLEGA POR DOS CAMINOS, Y CADA UNO TRAE UN NÚMERO DISTINTO:
 *
 *  · Desde "Mis solicitudes", con `solicitudId` — el número que él ve en su
 *    lista.
 *  · Desde el histórico, con `prestamoId`, porque esos préstamos no nacieron
 *    de una solicitud y no hay SolicitudId que mandar.
 *
 * Es la misma pantalla y no dos: lo que se muestra es idéntico, y tener dos
 * copias garantizaría que se desalineen. Lo único que cambia es a qué endpoint
 * se le pide.
 *
 * En los dos casos el servidor comprueba con su código de planilla — que sale
 * del token — que el préstamo sea suyo.
 */
const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

type RutaParams = {
  detallePrestamo: { solicitudId?: number; prestamoId?: number }
}

const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Monto en lempiras. Cooperativa maneja HNL. */
const formatMonto = (valor: number | null | undefined): string => {
  if (valor == null) return '-'
  return `L ${Number(valor).toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * El aspecto del préstamo según cómo esté. El mismo de "Mis préstamos": un
 * cancelado va en gris y no en rojo, porque terminó de pagarse — en el resto
 * del módulo el rojo significa rechazado.
 */
const ASPECTO_PRESTAMO = {
  vigente:   { color: '#22C55E', token: '$success',   texto: 'Vigente' },
  cancelado: { color: '#94A3B8', token: '$textMuted', texto: 'Cancelado' },
} as const

/**
 * Una tarjeta con encabezado, la misma de las otras pantallas del módulo.
 *
 * El título va DENTRO, sobre una franja de otro fondo, para que cada bloque se
 * lea como una pieza y no como una lista con una etiqueta flotando encima.
 */
function Tarjeta({
  titulo,
  icono: Icono,
  color = '#94A3B8',
  destacada,
  children,
}: {
  titulo: string
  icono: React.ComponentType<any>
  color?: string
  /** La tarjeta principal: borde y encabezado toman el color. */
  destacada?: boolean
  children: React.ReactNode
}) {
  return (
    <YStack
      borderRadius="$5"
      backgroundColor="$backgroundElevated"
      borderWidth={destacada ? 1.5 : 1}
      borderColor={destacada ? `${color}66` : '$border'}
      overflow="hidden"
      {...(destacada ? shadows.md : shadows.sm)}
    >
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$3.5"
        paddingVertical="$2.5"
        backgroundColor={destacada ? `${color}1A` : '$backgroundSurface'}
        borderBottomWidth={1}
        borderBottomColor={destacada ? `${color}33` : '$border'}
      >
        <Icono size={14} color={color} />
        <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.3} flex={1}>
          {titulo.toUpperCase()}
        </Text>
      </XStack>

      <YStack paddingHorizontal="$3.5" paddingVertical="$2.5">
        {children}
      </YStack>
    </YStack>
  )
}

/**
 * Un plegable de una línea, para lo que va DENTRO de una tarjeta.
 *
 * El mismo del resto del módulo. AccordionSection no sirve acá: es una tarjeta
 * entera —fondo propio, borde y un chevron en un círculo— y metida adentro de
 * otra se lee como una caja dentro de una caja. Esto ocupa lo que mide una
 * línea de texto.
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

/** Un dato: etiqueta chica arriba, valor abajo. */
function Dato({
  etiqueta,
  valor,
  fuerte,
  color,
}: {
  etiqueta: string
  valor: string
  /** Uno de los dos números que el socio vino a buscar. */
  fuerte?: boolean
  color?: string
}) {
  return (
    <YStack flex={1} gap="$0.5">
      <Text fontSize={10} color="$textMuted">{etiqueta}</Text>
      <Text
        fontSize={fuerte ? 18 : 12}
        color={color ?? '$text'}
        fontWeight={fuerte ? '800' : '600'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {valor}
      </Text>
    </YStack>
  )
}

export default function DetallePrestamoScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<RouteProp<RutaParams, 'detallePrestamo'>>()
  const solicitudId = route.params?.solicitudId ?? 0
  const prestamoId = route.params?.prestamoId ?? 0

  const { showToast } = useShowToast()

  const [cuotas, setCuotas] = useState<ICuotaPrestamo[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  usePageHeader({
    left: (
      <View onPress={() => navigation.goBack()} hitSlop={8} pressStyle={{ opacity: 0.6 }}>
        <ArrowLeftStyled size={22} />
      </View>
    ),
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Detalle del préstamo
      </Text>
    ),
  })

  const consultar = useCallback(async () => {
    try {
      // El PrestamoId manda cuando viene: es directo. El SolicitudId es el
      // camino de "Mis solicitudes", donde el préstamo todavía no se nombra.
      const response = prestamoId > 0
        ? await cooperativaService.getPrestamoDetallePorId(prestamoId)
        : await cooperativaService.getPrestamoDetalle(solicitudId)

      setCuotas(response?.Success ? response.Data ?? [] : [])
    } catch (err) {
      setCuotas([])
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    }
    // showToast queda fuera: cambia de identidad en cada render y recargaría en
    // bucle.
  }, [solicitudId, prestamoId])

  useEffect(() => {
    ;(async () => {
      setCargando(true)
      await consultar()
      setCargando(false)
    })()
  }, [consultar])

  const onRefresh = async () => {
    setRefrescando(true)
    await consultar()
    setRefrescando(false)
  }

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  if (cuotas.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4" gap="$2.5" alignItems="center">
        <Wallet size={26} color="#94A3B8" />
        {/* Dos textos según de dónde vino: por préstamo el registro ya existe
            y lo que falta es su plan; por solicitud puede que ni préstamo
            haya. Decir "esta solicitud" en el histórico confundiría. */}
        <Text fontSize={14} color="$text" textAlign="center">
          {prestamoId > 0
            ? 'Este préstamo no tiene un plan de cuotas cargado.'
            : 'Esta solicitud todavía no tiene un préstamo con plan de cuotas.'}
        </Text>
        <Text fontSize={12} color="$textMuted" textAlign="center" lineHeight={17}>
          {prestamoId > 0
            ? 'Consulte con la cooperativa para ver el detalle de sus pagos.'
            : 'Aparece aquí en cuanto la cooperativa lo registre.'}
        </Text>
        <Button height={38} borderRadius={9} marginTop="$1.5" onPress={() => navigation.goBack()}>
          <Text fontSize={13} fontWeight="700" color="$text">Volver</Text>
        </Button>
      </YStack>
    )
  }

  // El encabezado sale de la primera fila: el servidor lo repite en todas.
  const p = cuotas[0]

  const pagadas = cuotas.filter(c => c.Pagada).length
  const avance = pagadas / cuotas.length

  /**
   * La primera cuota que todavía no se paga.
   *
   * De ahí salen las tres cosas que el socio pregunta primero: cuándo es el
   * próximo descuento, de cuánto, y cuánto le queda debiendo — `SaldoAnterior`
   * de esa cuota es justamente el saldo con el que llega a ella.
   */
  const proxima = cuotas.find(c => !c.Pagada) ?? null

  const cancelado = proxima == null
  const aspecto = cancelado ? ASPECTO_PRESTAMO.cancelado : ASPECTO_PRESTAMO.vigente

  /**
   * El monto de la cuota.
   *
   * >>> NO ES p.Cuota <<<
   * dbo.Prestamo.Cuota es un INT y vale lo mismo que Plazo: la CANTIDAD de
   * cuotas. El monto vive en PrestamoDetalle.TotalCuota. Acá decía `p.Cuota` y
   * mostraba el número de cuotas donde debía ir plata.
   */
  const montoCuota = p.TotalCuota

  const ultima = cuotas[cuotas.length - 1]

  return (
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 8 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
    >
      {/* ── Lo que falta. Es a lo que se entra. ──────────────────────────
          Antes la tarjeta abría con el monto original y la fecha de
          aprobación, que son historia. Lo que el socio pregunta es cuánto
          debe y cuándo le toca el próximo descuento. */}
      <Tarjeta titulo="Resumen" icono={Wallet} color={aspecto.color} destacada>
        {cancelado ? (
          <XStack alignItems="center" gap="$2" paddingVertical="$2">
            <CheckCircle2 size={18} color="#22C55E" />
            <Text fontSize={13} color="$text" flex={1} lineHeight={18}>
              Lo terminó de pagar. Las {cuotas.length} cuotas están saldadas.
            </Text>
          </XStack>
        ) : (
          <XStack gap="$3" paddingVertical="$1.5">
            {/* SaldoAnterior de la próxima cuota: es el saldo con el que llega
                a ella, o sea lo que debe hoy. */}
            <Dato
              etiqueta="Le queda debiendo"
              valor={formatMonto(proxima?.SaldoAnterior)}
              fuerte
            />
            <Dato
              etiqueta="Próximo pago"
              valor={formatFecha(proxima?.FechaCuota ?? null)}
              fuerte
            />
          </XStack>
        )}

        {/* El avance. Va en las dos ramas: en el cancelado confirma que llegó
            al final, y es la misma barra de "Mis préstamos". */}
        <YStack gap="$1" paddingTop="$2" borderTopWidth={1} borderTopColor="$border">
          <XStack alignItems="center" gap="$2">
            <Text fontSize={10} color="$textMuted" flex={1}>
              {pagadas} de {cuotas.length} cuotas pagadas
            </Text>
            <Text fontSize={10} fontWeight="700" color={aspecto.token}>
              {Math.round(avance * 100)}%
            </Text>
          </XStack>
          <View height={5} borderRadius={999} backgroundColor="$backgroundSurface" overflow="hidden">
            <View
              height={5}
              borderRadius={999}
              backgroundColor={aspecto.color}
              width={`${Math.round(avance * 100)}%`}
            />
          </View>
        </YStack>
        {/* ── Las condiciones con las que se otorgó ────────────────────
            Dentro del mismo resumen y no en otra tarjeta: son del mismo
            préstamo, y partirlas obligaba a bajar para saber de cuánto
            era. Lo de arriba es cómo va; esto es cómo empezó. */}
        <XStack gap="$3" paddingTop="$2.5" borderTopWidth={1} borderTopColor="$border">
          <Dato etiqueta="Monto" valor={formatMonto(p.Monto)} />
          <Dato etiqueta="Cuota" valor={formatMonto(montoCuota)} />
          <Dato etiqueta="Cuotas" valor={String(cuotas.length)} />
        </XStack>

        <XStack gap="$3" paddingTop="$2.5" paddingBottom="$1">
          {/* La fecha del préstamo es la de su aprobación: se registra en la
              cooperativa recién cuando termina de firmarse. */}
          <Dato etiqueta="Otorgado el" valor={formatFecha(p.FechaPrestamo)} />
          <Dato etiqueta="Primera cuota" valor={formatFecha(p.FechaCuota)} />
          <Dato etiqueta="Última cuota" valor={formatFecha(ultima.FechaCuota)} />
        </XStack>

        {/* ── El plan, cuota por cuota ─────────────────────────────────
            Plegado: son decenas de renglones y abiertos empujan todo lo
            demás fuera de la pantalla. El resumen de arriba alcanza para
            saber cómo va; esto es para el que quiere ver cada pago. */}
        <Plegable titulo={`Ver las ${cuotas.length} cuotas`}>
        {/* Los encabezados de columna, para no repetir la etiqueta en cada
            renglón: con 120 cuotas eso sería una pared de texto.

            Los anchos van en flex y no en pixeles: fijos, un saldo de siete
            cifras no entraba en pantallas angostas. */}
        <XStack alignItems="center" gap="$1.5" paddingBottom="$1.5">
          <Text fontSize={9} color="$textMuted" width={34}>N.º</Text>
          <Text fontSize={9} color="$textMuted" flex={1}>FECHA</Text>
          <Text fontSize={9} color="$textMuted" flex={1} textAlign="right">CUOTA</Text>
          <Text fontSize={9} color="$textMuted" flex={1.2} textAlign="right">SALDO</Text>
        </XStack>

        {/* Sin desglose de capital e interés: la cuota es lo que se le
            descuenta y el saldo lo que le queda debiendo. Tampoco va el
            capital solo — restándolo de la cuota queda a la vista el interés
            que justamente no se quiere mostrar. */}
        {cuotas.map(c => {
          /* La próxima a pagar, marcada. En un plan de 120 renglones es lo
             único que el socio busca, y hasta ahora se veía igual que las
             otras 119. */
          const esProxima = c.NumeroCuota === proxima?.NumeroCuota

          return (
            <XStack
              key={c.NumeroCuota}
              alignItems="center"
              gap="$1.5"
              paddingVertical="$1.5"
              paddingHorizontal={esProxima ? '$1.5' : 0}
              marginHorizontal={esProxima ? '$-1.5' : 0}
              borderRadius={esProxima ? '$2' : 0}
              backgroundColor={esProxima ? '#FF551A14' : 'transparent'}
              borderTopWidth={1}
              borderTopColor="$border"
              // Las pagadas se apagan: lo que importa es lo que falta.
              opacity={c.Pagada ? 0.5 : 1}
            >
              <XStack width={34} alignItems="center" gap="$1">
                {/* El check dice de un vistazo cuáles ya se pagaron, sin tener
                    que comparar montos. */}
                {c.Pagada
                  ? <CheckCircle2 size={11} color="#22C55E" />
                  : <Clock size={11} color={esProxima ? '#FF551A' : '#94A3B8'} />}
                <Text fontSize={10} color="$textMuted">{c.NumeroCuota}</Text>
              </XStack>

              <Text
                fontSize={11}
                fontWeight={esProxima ? '700' : '400'}
                color={esProxima ? '$primary' : '$text'}
                flex={1}
              >
                {formatFecha(c.FechaCuota)}
              </Text>

              <Text
                fontSize={11}
                fontWeight="600"
                color="$text"
                flex={1}
                textAlign="right"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {formatMonto(c.TotalCuota)}
              </Text>

              {/* El saldo que deja esa cuota: es lo que le permite ver cómo va
                  bajando la deuda. */}
              <Text
                fontSize={11}
                color="$textMuted"
                flex={1.2}
                textAlign="right"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {formatMonto(c.SaldoActual)}
              </Text>
            </XStack>
          )
        })}
        </Plegable>
      </Tarjeta>
    </ScrollView>
  )
}
