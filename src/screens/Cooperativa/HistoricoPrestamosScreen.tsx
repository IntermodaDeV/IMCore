import React, { useCallback, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { YStack, XStack, Text, ScrollView, View, styled } from 'tamagui'
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock, Coins, Wallet, TriangleAlert,
} from 'lucide-react-native'

import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { IPrestamoResumen } from '../../api/modules/cooperativa/cooperativa.types'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import { shadows } from '../../theme/shadows'

/**
 * Histórico de préstamos del socio.
 *
 * POR QUÉ EXISTE ESTA PANTALLA
 * "Mis solicitudes" solo puede mostrar préstamos que nacieron de una solicitud
 * hecha desde el app. Pero la mayoría de los del socio NO pasaron por ahí: se
 * cargaron en el sistema de escritorio, o se migraron. Para él son igual de
 * suyos, y hasta ahora no tenía dónde verlos.
 *
 * Acá salen TODOS, con o sin solicitud, del más reciente al más viejo.
 */

const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

type NavParams = {
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

/** Un dato chico: etiqueta arriba, valor abajo. */
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
    <YStack flex={1}>
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

/**
 * Un préstamo del histórico.
 *
 * Definido acá afuera y no dentro de la pantalla: uno anidado se vuelve a
 * crear en cada render, y React lo trata como un componente distinto — con
 * ciento y pico de tarjetas eso es desmontar y volver a montar toda la lista
 * cada vez que cambia el refresco.
 */
function TarjetaPrestamo({
  p,
  onVerDetalle,
}: {
  p: IPrestamoResumen
  onVerDetalle: () => void
}) {
  return (
    <YStack
      gap="$3"
      padding="$4"
      borderRadius="$4"
      backgroundColor="$backgroundElevated"
      borderWidth={1}
      borderColor="$border"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" gap="$2">
        <YStack flex={1} gap="$1">
          <Text fontSize={20} fontWeight="700" color="$text">
            {formatMonto(p.Monto)}
          </Text>
          <Text fontSize={13} color="$textMuted">
            {formatFecha(p.FechaPrestamo)}
          </Text>
        </YStack>

        <XStack
          alignItems="center"
          gap="$1.5"
          paddingHorizontal="$2.5"
          paddingVertical="$1"
          borderRadius="$10"
          backgroundColor={
            p.Cancelado ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)'
          }
        >
          {p.Cancelado
            ? <CheckCircle2 size={13} color="#22C55E" />
            : <Clock size={13} color="#f59e0b" />}
          <Text
            fontSize={12}
            fontWeight="600"
            color={p.Cancelado ? '$success' : '$warning'}
          >
            {p.Cancelado ? 'Cancelado' : 'Vigente'}
          </Text>
        </XStack>
      </XStack>

      {/* Lo que debe hoy. En el cancelado no va: un saldo en cero no dice
          nada que el sello verde no diga mejor. */}
      {!p.Cancelado && (
        <YStack
          gap="$2.5"
          padding="$3"
          borderRadius="$3"
          backgroundColor="$backgroundSurface"
          borderWidth={1}
          borderColor="$border"
        >
          <YStack gap="$0.5">
            <Text fontSize={11} color="$textMuted">Le queda debiendo</Text>
            <Text fontSize={20} fontWeight="700" color="$text">
              {formatMonto(p.SaldoPendiente)}
            </Text>
          </YStack>

          <XStack gap="$2.5">
            <Dato
              icono={CalendarDays}
              etiqueta="Próximo pago"
              valor={formatFecha(p.ProximoPago)}
            />
            <Dato
              icono={Coins}
              etiqueta="Cuota"
              valor={formatMonto(p.ProximaCuota)}
            />
          </XStack>
        </YStack>
      )}

      {/* El avance en cuotas. Solo si hay plan: los préstamos viejos no lo
          tienen y "0 de 0" no dice nada. */}
      {p.CuotasTotal > 0 ? (
        <YStack gap="$1.5">
          <XStack alignItems="center" gap="$2">
            <Text fontSize={11} color="$textMuted" flex={1}>Cuotas pagadas</Text>
            <Text fontSize={12} fontWeight="700" color="$text">
              {p.CuotasPagadas} de {p.CuotasTotal}
            </Text>
          </XStack>
          <View height={5} borderRadius={3} backgroundColor="$border" overflow="hidden">
            <View
              height={5}
              borderRadius={3}
              backgroundColor={p.Cancelado ? '#22C55E' : '#FF551A'}
              width={`${Math.round((p.CuotasPagadas / p.CuotasTotal) * 100)}%`}
            />
          </View>
        </YStack>
      ) : (
        <XStack gap="$2" alignItems="flex-start">
          <View marginTop={1}>
            <TriangleAlert size={13} color="#94A3B8" />
          </View>
          <Text fontSize={12} color="$textMuted" flex={1} lineHeight={17}>
            Este préstamo no tiene un plan de cuotas cargado.
          </Text>
        </XStack>
      )}

      {/* Ver el detalle solo si hay algo que ver. Se navega por PrestamoId
          — no por solicitud — porque estos préstamos pueden no tener una. */}
      {p.CuotasTotal > 0 && (
        <XStack
          alignItems="center"
          justifyContent="center"
          gap="$2"
          height={42}
          borderRadius="$3"
          borderWidth={1}
          borderColor="$border"
          backgroundColor="$backgroundSurface"
          pressStyle={{ opacity: 0.7 }}
          onPress={onVerDetalle}
        >
          <CalendarDays size={15} color="#FF551A" />
          <Text fontSize={14} fontWeight="700" color="$primary">
            Ver detalle de cuotas
          </Text>
        </XStack>
      )}
    </YStack>
  )
}

export default function HistoricoPrestamosScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<NavParams>>()

  const [prestamos, setPrestamos] = useState<IPrestamoResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  usePageHeader({
    left: (
      <View onPress={() => navigation.goBack()} hitSlop={8} pressStyle={{ opacity: 0.6 }}>
        <ArrowLeftStyled size={22} />
      </View>
    ),
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Mis préstamos
      </Text>
    ),
  })

  const consultar = useCallback(async () => {
    try {
      const response = await cooperativaService.getPrestamosCliente()

      if (response?.Success) {
        setPrestamos(response.Data ?? [])
        setError(null)
      } else {
        setPrestamos([])
        setError(response?.ErrorMessage || 'No se pudieron cargar sus préstamos.')
      }
    } catch (err) {
      setPrestamos([])
      setError(handleError(err).message)
    }
  }, [])

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

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  // Los que todavía debe, arriba de todo: es lo que vino a mirar. Los pagados
  // son historia y pueden esperar al final del scroll.
  const vigentes = prestamos.filter(p => !p.Cancelado)
  const pagados = prestamos.filter(p => p.Cancelado)

  const verDetalle = (prestamoId: number) =>
    navigation.navigate('detallePrestamo', { prestamoId })

  return (
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
    >
      {error ? (
        <YStack
          gap="$3"
          padding="$4"
          borderRadius="$4"
          backgroundColor="$backgroundSurface"
          borderWidth={1}
          borderColor="$border"
          alignItems="center"
        >
          <TriangleAlert size={26} color="#94A3B8" />
          <Text fontSize={14} color="$text" textAlign="center" lineHeight={20}>
            {error}
          </Text>
        </YStack>
      ) : prestamos.length === 0 ? (
        <YStack gap="$3" padding="$6" alignItems="center">
          <View
            width={72}
            height={72}
            borderRadius={36}
            backgroundColor="$backgroundSurface"
            alignItems="center"
            justifyContent="center"
          >
            <Wallet size={32} color="#94A3B8" />
          </View>
          <Text fontSize={17} fontWeight="700" color="$text" textAlign="center">
            Todavía no tiene préstamos
          </Text>
          <Text fontSize={14} color="$textMuted" textAlign="center" lineHeight={20}>
            Aquí van a aparecer todos sus préstamos con la cooperativa, con el
            detalle de sus cuotas.
          </Text>
        </YStack>
      ) : (
        <>
          {vigentes.map(p => (
            <TarjetaPrestamo
              key={p.PrestamoId}
              p={p}
              onVerDetalle={() => verDetalle(p.PrestamoId)}
            />
          ))}

          {/* El separador solo cuando hay de los dos: con una sola lista es un
              título que no separa nada. */}
          {pagados.length > 0 && vigentes.length > 0 && (
            <XStack alignItems="center" gap="$2" paddingTop="$2">
              <CheckCircle2 size={12} color="#94A3B8" />
              <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                YA CANCELADOS
              </Text>
            </XStack>
          )}

          {pagados.map(p => (
            <TarjetaPrestamo
              key={p.PrestamoId}
              p={p}
              onVerDetalle={() => verDetalle(p.PrestamoId)}
            />
          ))}
        </>
      )}
    </ScrollView>
  )
}
