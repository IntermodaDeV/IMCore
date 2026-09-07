import React, { useCallback, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { YStack, XStack, Text, ScrollView, View, styled } from 'tamagui'
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock, Coins, Wallet, TriangleAlert,
  RefreshCcw,
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
  nuevaSolicitudCoo: { id?: number; refinanciaPrestamoId?: number } | undefined
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
      <XStack gap="$1" alignItems="center">
        <Icono size={10} color="#94A3B8" />
        <Text fontSize={9} color="$textMuted">{etiqueta}</Text>
      </XStack>
      <Text fontSize={12} color="$text" fontWeight="600" lineHeight={16}>
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
  onRefinanciar,
}: {
  p: IPrestamoResumen
  onVerDetalle: () => void
  onRefinanciar: () => void
}) {
  return (
    <YStack
      gap="$2.5"
      padding="$3"
      borderRadius="$4"
      backgroundColor="$backgroundElevated"
      borderWidth={1}
      borderColor="$border"
      {...shadows.sm}
    >
      <XStack alignItems="flex-start" gap="$2">
        <YStack flex={1} gap="$0.5">
          <Text fontSize={17} fontWeight="700" color="$text">
            {formatMonto(p.Monto)}
          </Text>
          <Text fontSize={11} color="$textMuted">
            {formatFecha(p.FechaPrestamo)}
          </Text>
        </YStack>

        <XStack
          alignItems="center"
          gap="$1"
          paddingHorizontal="$2"
          paddingVertical={2}
          borderRadius="$10"
          backgroundColor={
            p.Cancelado ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)'
          }
        >
          {p.Cancelado
            ? <CheckCircle2 size={11} color="#22C55E" />
            : <Clock size={11} color="#f59e0b" />}
          <Text
            fontSize={10}
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
          gap="$2"
          padding="$2.5"
          borderRadius="$3"
          backgroundColor="$backgroundSurface"
          borderWidth={1}
          borderColor="$border"
        >
          <YStack gap="$0.5">
            <Text fontSize={10} color="$textMuted">Le queda debiendo</Text>
            <Text fontSize={17} fontWeight="700" color="$text">
              {formatMonto(p.SaldoPendiente)}
            </Text>
          </YStack>

          <XStack gap="$2">
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
        <YStack gap="$1">
          <XStack alignItems="center" gap="$2">
            <Text fontSize={10} color="$textMuted" flex={1}>Cuotas pagadas</Text>
            <Text fontSize={11} fontWeight="700" color="$text">
              {p.CuotasPagadas} de {p.CuotasTotal}
            </Text>
          </XStack>
          <View height={4} borderRadius={2} backgroundColor="$border" overflow="hidden">
            <View
              height={4}
              borderRadius={2}
              backgroundColor={p.Cancelado ? '#22C55E' : '#FF551A'}
              width={`${Math.round((p.CuotasPagadas / p.CuotasTotal) * 100)}%`}
            />
          </View>
        </YStack>
      ) : (
        <XStack gap="$1.5" alignItems="flex-start">
          <View marginTop={1}>
            <TriangleAlert size={12} color="#94A3B8" />
          </View>
          <Text fontSize={11} color="$textMuted" flex={1} lineHeight={15}>
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
          height={36}
          borderRadius="$3"
          borderWidth={1}
          borderColor="$border"
          backgroundColor="$backgroundSurface"
          pressStyle={{ opacity: 0.7 }}
          onPress={onVerDetalle}
        >
          <CalendarDays size={14} color="#FF551A" />
          <Text fontSize={12} fontWeight="700" color="$primary">
            Ver detalle de cuotas
          </Text>
        </XStack>
      )}

      {/* Refinanciar: solo en los VIGENTES y con saldo. En uno cancelado no hay
          nada que arrastrar — para eso ya puede pedir un préstamo normal — y en
          uno sin plan de cuotas no se sabe cuánto debe.

          Va relleno y no en contorno como el de arriba: es la acción que
          resuelve lo que el socio vino a hacer cuando no lo dejan pedir otro. */}
      {!p.Cancelado && (p.SaldoPendiente ?? 0) > 0 && (
        <XStack
          alignItems="center"
          justifyContent="center"
          gap="$2"
          height={36}
          borderRadius="$3"
          backgroundColor="$primary"
          pressStyle={{ opacity: 0.85 }}
          onPress={onRefinanciar}
        >
          <RefreshCcw size={14} color="#FFFFFF" />
          <Text fontSize={12} fontWeight="700" color="white">
            Refinanciar
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

  // Al formulario de siempre, con el préstamo a arrastrar. No es una pantalla
  // aparte: los campos y las validaciones son los mismos, y dos copias se
  // desalinean solas.
  const refinanciar = (prestamoId: number) =>
    navigation.navigate('nuevaSolicitudCoo', { refinanciaPrestamoId: prestamoId })

  return (
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 8 }}
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
          <TriangleAlert size={22} color="#94A3B8" />
          <Text fontSize={13} color="$text" textAlign="center" lineHeight={18}>
            {error}
          </Text>
        </YStack>
      ) : prestamos.length === 0 ? (
        <YStack gap="$2.5" padding="$5" alignItems="center">
          <View
            width={58}
            height={58}
            borderRadius={29}
            backgroundColor="$backgroundSurface"
            alignItems="center"
            justifyContent="center"
          >
            <Wallet size={26} color="#94A3B8" />
          </View>
          <Text fontSize={15} fontWeight="700" color="$text" textAlign="center">
            Todavía no tiene préstamos
          </Text>
          <Text fontSize={12} color="$textMuted" textAlign="center" lineHeight={17}>
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
              onRefinanciar={() => refinanciar(p.PrestamoId)}
            />
          ))}

          {/* El separador solo cuando hay de los dos: con una sola lista es un
              título que no separa nada. */}
          {pagados.length > 0 && vigentes.length > 0 && (
            <XStack alignItems="center" gap="$1.5" paddingTop="$1.5">
              <CheckCircle2 size={11} color="#94A3B8" />
              <Text fontSize={9} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                YA CANCELADOS
              </Text>
            </XStack>
          )}

          {pagados.map(p => (
            <TarjetaPrestamo
              key={p.PrestamoId}
              p={p}
              onVerDetalle={() => verDetalle(p.PrestamoId)}
              onRefinanciar={() => refinanciar(p.PrestamoId)}
            />
          ))}
        </>
      )}
    </ScrollView>
  )
}
