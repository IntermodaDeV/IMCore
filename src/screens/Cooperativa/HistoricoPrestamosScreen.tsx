import React, { useCallback, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { YStack, XStack, Text, ScrollView, View, styled } from 'tamagui'
import {
  ArrowLeft, Wallet, TriangleAlert, RefreshCcw, ChevronRight,
} from 'lucide-react-native'

import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { IPrestamoResumen } from '../../api/modules/cooperativa/cooperativa.types'
import { securityService } from '../../api/modules/security/security.service'
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

/**
 * El acceso que habilita el refinanciamiento.
 *
 * Es un INTERRUPTOR GLOBAL, no un permiso por usuario: lo único que se mira es
 * su Status_Id. Activo, el botón "Refinanciar" aparece a todos los socios;
 * inactivo, no aparece a nadie.
 *
 * Por eso se lee de Security.Access y no de los accesos asignados al usuario.
 */
const ACCESO_REFINANCIAR = 'RefinanciarPrestamo'

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

/**
 * El aspecto de un préstamo según cómo esté.
 *
 * >>> CANCELADO VA EN GRIS, NO EN ROJO <<<
 * Antes era rojo, con la idea de que "verde es lo que está en curso y rojo lo
 * que se cerró". Pero en el resto del módulo el rojo significa UNA cosa:
 * rechazado. Y un préstamo cancelado es lo contrario de un problema — lo
 * terminó de pagar. En rojo se leía como si algo hubiera salido mal.
 *
 * Gris neutro: ya no pide nada, solo está en el historial.
 */
const ASPECTO_PRESTAMO = {
  vigente:   { color: '#22C55E', token: '$success',    texto: 'Vigente' },
  cancelado: { color: '#94A3B8', token: '$textMuted',  texto: 'Cancelado' },
} as const

/** Un dato chico: etiqueta arriba, valor abajo. */
function Dato({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string
  valor: string
  /** El número que importa de la fila. */
  fuerte?: boolean
}) {
  return (
    <YStack flex={1} gap="$0.5">
      <Text fontSize={10} color="$textMuted">{etiqueta}</Text>
      <Text
        fontSize={fuerte ? 15 : 12}
        color="$text"
        fontWeight={fuerte ? '800' : '600'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
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
  refiHabilitado,
}: {
  p: IPrestamoResumen
  onVerDetalle: () => void
  onRefinanciar: () => void
  /** El interruptor global. Apagado, el botón de refinanciar no existe. */
  refiHabilitado: boolean
}) {
  const aspecto = p.Cancelado ? ASPECTO_PRESTAMO.cancelado : ASPECTO_PRESTAMO.vigente

  /** Sin plan no hay detalle que abrir ni avance que mostrar. */
  const hayPlan = p.CuotasTotal > 0
  const avance = hayPlan ? p.CuotasPagadas / p.CuotasTotal : 0

  return (
    /* La MISMA tarjeta de "Mis solicitudes": franja del color del estado a la
       izquierda, y se toca entera para entrar. Antes el detalle se abría con
       un botón adentro, y era el único lugar del módulo donde una tarjeta de
       lista no se podía tocar. */
    <XStack
      borderRadius="$5"
      backgroundColor="$backgroundElevated"
      borderWidth={1}
      borderColor="$border"
      overflow="hidden"
      pressStyle={hayPlan ? { opacity: 0.75 } : undefined}
      onPress={hayPlan ? onVerDetalle : undefined}
      {...shadows.sm}
    >
      <View width={4} backgroundColor={aspecto.color} />

      <YStack flex={1}>
        {/* Encabezado: cuánto fue y cuándo, con el estado al lado. */}
        <XStack
          alignItems="center"
          gap="$2.5"
          paddingHorizontal="$3"
          paddingVertical="$2.5"
          backgroundColor="$backgroundSurface"
        >
          <YStack flex={1} gap="$0.5">
            <Text fontSize={16} fontWeight="800" color="$text">
              {formatMonto(p.Monto)}
            </Text>
            <Text fontSize={10} color="$textMuted">
              {formatFecha(p.FechaPrestamo)}
              {hayPlan ? ` · ${p.CuotasTotal} cuotas` : ''}
            </Text>
          </YStack>

          {/* Solo la palabra, sin icono: igual que los badges de estado de
              "Mis solicitudes" y del listado del aprobador. */}
          <XStack alignItems="center" gap="$1.5">
            <XStack
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$10"
              backgroundColor={`${aspecto.color}1F`}
            >
              <Text fontSize={10} fontWeight="700" color={aspecto.token}>
                {aspecto.texto}
              </Text>
            </XStack>

            {hayPlan && <ChevronRight size={16} color="#94A3B8" />}
          </XStack>
        </XStack>

        <YStack paddingHorizontal="$3" paddingVertical="$2.5" gap="$2.5">
          {/* Lo que debe hoy. En el cancelado no va: un saldo en cero no dice
              nada que el badge no diga mejor. */}
          {!p.Cancelado && (
            <XStack gap="$3">
              <Dato
                etiqueta="Le queda debiendo"
                valor={formatMonto(p.SaldoPendiente)}
                fuerte
              />
              <Dato etiqueta="Cuota" valor={formatMonto(p.ProximaCuota)} />
              <Dato etiqueta="Próximo pago" valor={formatFecha(p.ProximoPago)} />
            </XStack>
          )}

          {/* El avance en cuotas. Solo si hay plan: los préstamos viejos no lo
              tienen y "0 de 0" no dice nada. */}
          {hayPlan ? (
            <YStack gap="$1">
              <XStack alignItems="center" gap="$2">
                <Text fontSize={10} color="$textMuted" flex={1}>
                  {p.CuotasPagadas} de {p.CuotasTotal} cuotas pagadas
                </Text>
                <Text fontSize={10} fontWeight="700" color={aspecto.token}>
                  {Math.round(avance * 100)}%
                </Text>
              </XStack>
              <View height={4} borderRadius={999} backgroundColor="$backgroundSurface" overflow="hidden">
                <View
                  height={4}
                  borderRadius={999}
                  // Sigue al badge: una barra de un color y un badge de otro se
                  // leerían como dos opiniones del mismo préstamo.
                  backgroundColor={aspecto.color}
                  width={`${Math.round(avance * 100)}%`}
                />
              </View>
            </YStack>
          ) : (
            <XStack gap="$1.5" alignItems="flex-start">
              <View marginTop={1}>
                <TriangleAlert size={12} color="#94A3B8" />
              </View>
              <Text fontSize={10} color="$textMuted" flex={1} lineHeight={14}>
                Este préstamo no tiene un plan de cuotas cargado.
              </Text>
            </XStack>
          )}
        </YStack>

        {/* Refinanciar: solo en los VIGENTES y con saldo. En uno cancelado no
            hay nada que arrastrar —para eso ya puede pedir uno normal— y en uno
            sin plan de cuotas no se sabe cuánto debe.

            Va al pie y separado por una línea: es una acción sobre el préstamo,
            no un dato suyo. Delineado y no relleno porque la tarjeta entera ya
            es tocable, y dos rellenos competirían por el mismo toque. */}
        {refiHabilitado && !p.Cancelado && (p.SaldoPendiente ?? 0) > 0 && (
          <XStack
            alignItems="center"
            justifyContent="center"
            gap="$2"
            height={38}
            borderTopWidth={1}
            borderTopColor="$border"
            pressStyle={{ opacity: 0.6, backgroundColor: '$backgroundSurface' }}
            onPress={onRefinanciar}
          >
            <RefreshCcw size={14} color="#FF551A" />
            <Text fontSize={12} fontWeight="700" color="$primary">
              Refinanciar
            </Text>
          </XStack>
        )}
      </YStack>
    </XStack>
  )
}

export default function HistoricoPrestamosScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<NavParams>>()

  const [prestamos, setPrestamos] = useState<IPrestamoResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si el refinanciamiento está habilitado. Arranca en false: mientras no se
  // confirme que el acceso está activo, el botón no se muestra. Al revés
  // — arrancar en true — lo dejaría aparecer por un instante en cada carga
  // aunque estuviera apagado.
  const [refiHabilitado, setRefiHabilitado] = useState(false)

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
    // El interruptor del refinanciamiento, por separado y sin cortar nada: si
    // esta consulta falla, la lista de préstamos se muestra igual y lo único
    // que pasa es que el botón no sale. Es preferible a dejar la pantalla en
    // blanco por una bandera.
    try {
      const accesos = await securityService.getAccess()

      setRefiHabilitado(
        (accesos?.Data ?? []).some(
          a => a.KeyVar === ACCESO_REFINANCIAR && a.Status_Id === 1,
        ),
      )
    } catch {
      setRefiHabilitado(false)
    }

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
              refiHabilitado={refiHabilitado}
            />
          ))}

          {/* Sin separador: cada tarjeta ya dice "Cancelado" en su chip, así
              que el título repetía lo que la lista mostraba sola. El orden
              — vigentes primero — se mantiene. */}
          {pagados.map(p => (
            <TarjetaPrestamo
              key={p.PrestamoId}
              p={p}
              onVerDetalle={() => verDetalle(p.PrestamoId)}
              onRefinanciar={() => refinanciar(p.PrestamoId)}
              refiHabilitado={refiHabilitado}
            />
          ))}
        </>
      )}
    </ScrollView>
  )
}
