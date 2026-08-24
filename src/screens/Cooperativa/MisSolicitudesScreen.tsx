import React, { useCallback, useState } from 'react'
import { RefreshControl, Pressable } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { YStack, XStack, Text, ScrollView, View } from 'tamagui'
import {
  FilePlus2, CalendarDays, Coins, TriangleAlert, User, Plus,
  Clock, CheckCircle2, XCircle, Tag,
} from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { ISolicitudCliente, ESTADO_SOLICITUD_COO } from '../../api/modules/cooperativa/cooperativa.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { shadows } from '../../theme/shadows'

/**
 * Mis solicitudes (ruta 'RequestCoo', menú 1046).
 *
 * El menú se le asigna al socio al aprobarse su afiliación
 * (CooInter_04_MenuAlAprobar.sql).
 *
 * Los datos salen de Cooperativa, vía proxy: la API resuelve el COD_PERSONAL
 * del token, el SP lo convierte en ClienteId y devuelve sus solicitudes.
 *
 * Crear va por el botón del header, que navega a NuevaSolicitudScreen — mismo
 * patrón que Gastos de Viaje.
 */

const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Monto en lempiras. Cooperativa maneja HNL. */
const formatMonto = (valor: number | null): string => {
  if (valor == null) return '-'
  return `L ${valor.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Linea({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: React.ComponentType<any>
  etiqueta: string
  valor: string
}) {
  return (
    <XStack gap="$2.5" alignItems="center">
      <Icono size={14} color="#94A3B8" />
      <Text fontSize={13} color="$textMuted" flex={1}>
        {etiqueta}
      </Text>
      <Text fontSize={13} color="$text" fontWeight="600">
        {valor}
      </Text>
    </XStack>
  )
}

export default function MisSolicitudesScreen() {
  const navigation = useNavigation()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [solicitudes, setSolicitudes] = useState<ISolicitudCliente[]>([])
  const [error, setError] = useState<string | null>(null)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Mis solicitudes
      </Text>
    ),
    right: (
      <Pressable
        onPress={() => navigation.navigate('nuevaSolicitudCoo' as never)}
        hitSlop={10}
      >
        <Plus size={22} color="#FF551A" />
      </Pressable>
    ),
  })

  const consultar = useCallback(async () => {
    try {
      const response: ExecutionResponse<ISolicitudCliente[]> =
        await cooperativaService.getSolicitudesCliente()

      if (response?.Success) {
        setSolicitudes(response.Data ?? [])
        setError(null)
      } else {
        setSolicitudes([])
        setError(response?.ErrorMessage || 'No se pudieron cargar tus solicitudes.')
      }
    } catch (err) {
      const e = handleError(err)
      setSolicitudes([])
      setError(e.message)
    }
  }, [])

  // useFocusEffect y no useEffect: el navegador mantiene las pantallas montadas.
  // Además así la lista se refresca al volver de crear una solicitud.
  useFocusEffect(
    useCallback(() => {
      ;(async () => {
        setLoading(true)
        await consultar()
        setLoading(false)
      })()
    }, [consultar]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await consultar()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  return (
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
      ) : solicitudes.length === 0 ? (
        <YStack gap="$3" padding="$6" alignItems="center">
          <View
            width={64}
            height={64}
            borderRadius={32}
            backgroundColor="$backgroundSurface"
            alignItems="center"
            justifyContent="center"
          >
            <FilePlus2 size={28} color="#94A3B8" />
          </View>
          <Text fontSize={16} fontWeight="700" color="$text" textAlign="center">
            Todavía no tenés solicitudes
          </Text>
          <Text fontSize={14} color="$textMuted" textAlign="center" lineHeight={20}>
            Tocá el + de arriba para hacer la primera.
          </Text>
        </YStack>
      ) : (
        solicitudes.map(s => {
          const aprobada = s.Estado === ESTADO_SOLICITUD_COO.APROBADO
          const rechazada = s.Estado === ESTADO_SOLICITUD_COO.RECHAZADO

          return (
            <YStack
              key={s.SolicitudId}
              gap="$3"
              padding="$4"
              borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="$border"
              {...shadows.sm}
            >
              {/* El monto es lo que el socio busca de un vistazo */}
              <XStack alignItems="flex-start" gap="$2">
                <YStack flex={1} gap="$1">
                  <Text fontSize={20} fontWeight="700" color="$text">
                    {formatMonto(s.Monto)}
                  </Text>
                  <Text fontSize={13} color="$textMuted">
                    #{s.SolicitudId} · {formatFecha(s.FechaSolicitud)}
                  </Text>
                </YStack>

                <XStack
                  alignItems="center"
                  gap="$1.5"
                  paddingHorizontal="$2.5"
                  paddingVertical="$1"
                  borderRadius="$10"
                  backgroundColor={
                    aprobada
                      ? 'rgba(34, 197, 94, 0.12)'
                      : rechazada
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)'
                  }
                >
                  {aprobada
                    ? <CheckCircle2 size={13} color="#22C55E" />
                    : rechazada
                      ? <XCircle size={13} color="#EF4444" />
                      : <Clock size={13} color="#f59e0b" />}
                  <Text
                    fontSize={12}
                    fontWeight="600"
                    color={aprobada ? '$success' : rechazada ? '$error' : '$warning'}
                  >
                    {s.EstadoNombre ?? String(s.Estado ?? '-')}
                  </Text>
                </XStack>
              </XStack>

              {!!s.Descripcion && (
                <Text fontSize={14} color="$text" lineHeight={20}>
                  {s.Descripcion}
                </Text>
              )}

              <YStack gap="$2" paddingTop="$1" borderTopWidth={1} borderTopColor="$border">
                {!!s.TipoSolicitudDescripcion && (
                  <Linea icono={Tag} etiqueta="Tipo" valor={s.TipoSolicitudDescripcion} />
                )}
                {!!s.PlazoDescripcion && (
                  <Linea icono={CalendarDays} etiqueta="Plazo" valor={s.PlazoDescripcion} />
                )}
                <Linea icono={Coins} etiqueta="Deducción 13.º" valor={formatMonto(s.Deduccion13vo)} />
                <Linea icono={Coins} etiqueta="Deducción 14.º" valor={formatMonto(s.Deduccion14vo)} />

                {!!s.FechaGestion && (
                  <Linea icono={CalendarDays} etiqueta="Gestionada" valor={formatFecha(s.FechaGestion)} />
                )}

                {/* Solo uno de los dos viene lleno, según cómo se resolvió */}
                {!!s.UsuarioAprobo && (
                  <Linea icono={User} etiqueta="Aprobó" valor={s.UsuarioAprobo} />
                )}
                {!!s.UsuarioRechazo && (
                  <Linea icono={User} etiqueta="Rechazó" valor={s.UsuarioRechazo} />
                )}
              </YStack>
            </YStack>
          )
        })
      )}
    </ScrollView>
  )
}
