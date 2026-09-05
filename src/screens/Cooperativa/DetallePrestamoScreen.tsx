import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { YStack, XStack, Text, ScrollView, View, Button, styled } from 'tamagui'
import {
  ArrowLeft, CalendarCheck, CalendarDays, CheckCircle2, Clock, Coins, Wallet,
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

/** Un dato del encabezado: etiqueta chica arriba, valor abajo. */
function Dato({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: React.ComponentType<any>
  etiqueta: string
  valor: string
}) {
  return (
    <YStack>
      <XStack gap="$1.5" alignItems="center">
        <Icono size={11} color="#94A3B8" />
        <Text fontSize={10} color="$textMuted">{etiqueta}</Text>
      </XStack>
      <Text fontSize={13} color="$text" fontWeight="600" lineHeight={18}>
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
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$5" gap="$3" alignItems="center">
        <Wallet size={30} color="#94A3B8" />
        {/* Dos textos según de dónde vino: por préstamo el registro ya existe
            y lo que falta es su plan; por solicitud puede que ni préstamo
            haya. Decir "esta solicitud" en el histórico confundiría. */}
        <Text fontSize={15} color="$text" textAlign="center">
          {prestamoId > 0
            ? 'Este préstamo no tiene un plan de cuotas cargado.'
            : 'Esta solicitud todavía no tiene un préstamo con plan de cuotas.'}
        </Text>
        <Text fontSize={13} color="$textMuted" textAlign="center" lineHeight={19}>
          {prestamoId > 0
            ? 'Consulte con la cooperativa para ver el detalle de sus pagos.'
            : 'Aparece aquí en cuanto la cooperativa lo registre.'}
        </Text>
        <Button height={42} borderRadius={10} marginTop="$2" onPress={() => navigation.goBack()}>
          <Text fontSize={14} fontWeight="700" color="$text">Volver</Text>
        </Button>
      </YStack>
    )
  }

  // El encabezado sale de la primera fila: el servidor lo repite en todas.
  const p = cuotas[0]

  const pagadas = cuotas.filter(c => c.Pagada).length

  return (
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
    >
      {/* ── El préstamo. Lo que se pidió y con qué condiciones. ────────── */}
      <YStack
        gap="$3"
        padding="$4"
        borderRadius="$4"
        backgroundColor="$backgroundElevated"
        borderWidth={1}
        borderColor="$border"
        {...shadows.sm}
      >
        <YStack gap="$1">
          <Text fontSize={13} color="$textMuted">Préstamo #{p.PrestamoId}</Text>
          <Text fontSize={26} fontWeight="700" color="$text">
            {formatMonto(p.Monto)}
          </Text>
        </YStack>

        <XStack gap="$2.5" paddingTop="$2.5" borderTopWidth={1} borderTopColor="$border">
          <View flex={1}>
            <Dato icono={Coins} etiqueta="Cuota" valor={formatMonto(p.Cuota)} />
          </View>
          <View flex={1}>
            <Dato icono={CalendarDays} etiqueta="Cuotas" valor={String(p.Plazo)} />
          </View>
          <View flex={1}>
            {/* La fecha del préstamo es la de su aprobación: se registra en la
                cooperativa recién cuando termina de firmarse. */}
            <Dato
              icono={CalendarCheck}
              etiqueta="Aprobado el"
              valor={formatFecha(p.FechaPrestamo)}
            />
          </View>
        </XStack>

        {/* El avance: cuántas cuotas van. Es lo que el socio busca de un
            vistazo, antes de leer el plan renglón por renglón. */}
        <YStack
          gap="$2"
          padding="$2.5"
          borderRadius={10}
          backgroundColor="$backgroundSurface"
          borderWidth={1}
          borderColor="$border"
        >
          <XStack alignItems="center" gap="$2">
            <Text fontSize={12} color="$textMuted" flex={1}>Cuotas pagadas</Text>
            <Text fontSize={15} fontWeight="700" color="$text">
              {pagadas} de {cuotas.length}
            </Text>
          </XStack>

          {/* La barra dice lo mismo que el número, pero se lee sin leerlo. */}
          <View height={6} borderRadius={3} backgroundColor="$border" overflow="hidden">
            <View
              height={6}
              borderRadius={3}
              backgroundColor={pagadas === cuotas.length ? '#22C55E' : '#FF551A'}
              width={`${Math.round((pagadas / cuotas.length) * 100)}%`}
            />
          </View>
        </YStack>
      </YStack>

      {/* ── El plan, cuota por cuota ───────────────────────────────────── */}
      <YStack
        gap="$2"
        padding="$4"
        borderRadius="$4"
        backgroundColor="$backgroundElevated"
        borderWidth={1}
        borderColor="$border"
        {...shadows.sm}
      >
        <XStack alignItems="center" gap="$1.5">
          <CalendarDays size={12} color="#94A3B8" />
          <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
            PLAN DE PAGOS
          </Text>
        </XStack>

        {/* Los encabezados de columna, para no repetir la etiqueta en cada
            renglón: con 120 cuotas eso sería una pared de texto. */}
        <XStack alignItems="center" gap="$2" paddingTop="$1">
          <Text fontSize={10} color="$textMuted" width={46}>N.º</Text>
          <Text fontSize={10} color="$textMuted" flex={1}>FECHA</Text>
          <Text fontSize={10} color="$textMuted" width={82} textAlign="right">CUOTA</Text>
          <Text fontSize={10} color="$textMuted" width={92} textAlign="right">SALDO</Text>
        </XStack>

        {/* Sin desglose de capital e interés: la cuota es lo que se le
            descuenta y el saldo lo que le queda debiendo. Tampoco va el
            capital solo — restándolo de la cuota queda a la vista el interés
            que justamente no se quiere mostrar. */}
        {cuotas.map(c => (
          <XStack
            key={c.NumeroCuota}
            alignItems="center"
            gap="$2"
            paddingVertical="$2"
            borderTopWidth={1}
            borderTopColor="$border"
          >
            <XStack width={46} alignItems="center" gap="$1.5">
              {/* El check dice de un vistazo cuáles ya se pagaron, sin tener
                  que comparar montos. */}
              {c.Pagada
                ? <CheckCircle2 size={12} color="#22C55E" />
                : <Clock size={12} color="#94A3B8" />}
              <Text fontSize={12} color="$textMuted">{c.NumeroCuota}</Text>
            </XStack>

            <Text
              fontSize={13}
              color={c.Pagada ? '$textMuted' : '$text'}
              flex={1}
            >
              {formatFecha(c.FechaCuota)}
            </Text>

            <Text
              fontSize={13}
              fontWeight="600"
              color={c.Pagada ? '$textMuted' : '$text'}
              width={82}
              textAlign="right"
            >
              {formatMonto(c.TotalCuota)}
            </Text>

            {/* El saldo que deja esa cuota: es lo que le permite ver cómo va
                bajando la deuda. */}
            <Text fontSize={13} color="$textMuted" width={92} textAlign="right">
              {formatMonto(c.SaldoActual)}
            </Text>
          </XStack>
        ))}
      </YStack>
    </ScrollView>
  )
}
