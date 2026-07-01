
import { ClipboardList, RotateCw, CheckCircle2, XCircle, CalendarClock, User, ChevronDown, ChevronUp } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native'
import { YStack, XStack, Text, Card, View, styled, ScrollView } from 'tamagui'
import { usePageHeader } from '../../hooks/usePageHeader';
import { IApprovalHistory } from '../../api/modules/CadenaSuministro/cadenaSuministro.types';
import { AppError, handleError } from '../../utils/errorHandler';
import { ExecutionResponse } from '../../api/modules/response.type';
import { cadenaSuministroService } from '../../api/modules/CadenaSuministro/cadenaSuministro.service';
import { useLoader } from '../../providers/LoaderProvider';
import ErrorState from '../AdmSys/ErrorState';
import SkeletonList from '../../components/Skeletons/SkeletonList';
import SearchInput from '../../components/commons/SearchInput';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../AdmSys/EmptyState';
import RecordCount from '../../components/commons/RecordCount';
import { NotificationBell } from '../../components/notifications/NotificationBell';

export default function SolicitudesHistorico() {

  //Icons
  const ClipboardListStyled = styled(ClipboardList, { color: '$primary' });
  const RotateCwStyled = styled(RotateCw, { color: '$text' });
  const ChevronUpStyled = styled(ChevronUp, { color: '$text' });
  const ChevronDownStyled = styled(ChevronDown, { color: '$text' });

  //Estados
  const [data, setData] = useState<IApprovalHistory[]>([])
  const [filtered, setFiltered] = useState<IApprovalHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const { user } = useAuth()
  const loader = useLoader();

  const route = useRoute()
  const navigation = useNavigation<any>()
  const scrollRef = useRef<any>(null)
  const cardY = useRef<Record<string, number>>({})
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const verHistorialCompleto = (user?.Access ?? '').split(',').map(s => s.trim()).includes('History')

  const getInfo = React.useCallback(async () => {
    try {
      loader.show()
      setLoading(true)
      setError(null)
      const usuarioParam = verHistorialCompleto ? '' : (user?.Code ?? '')
      const response: ExecutionResponse<IApprovalHistory[]> = await cadenaSuministroService.getHistorialAprobaciones(usuarioParam)
      if (response.Success) {
        setData(response.Data ?? [])
        setFiltered(response.Data ?? [])
      }
      setLoading(false)
    } catch (err) {
      setError(handleError(err))
      setLoading(false)
      loader.hide();
    } finally {
      setLoading(false)
      loader.hide();
    }
  }, [verHistorialCompleto, user?.Code])

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  const formatMoney = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)

  const formatDate = (value?: string) => {
    if (!value) return '-'
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return new Intl.DateTimeFormat('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  }

  const isAprobada = (estado?: string) => (estado ?? '').trim().toLowerCase() === 'approve'

  useEffect(() => {
    setFiltered(data)
  }, [data])

  const focusSolicitud = React.useCallback((codigo: string) => {
    setHighlighted(codigo)
    setTimeout(() => {
      const y = cardY.current[codigo]
      if (y != null) scrollRef.current?.scrollTo?.({ y: Math.max(y - 12, 0), animated: true })
    }, 350)
    setTimeout(() => setHighlighted(null), 2600)
  }, [])

  useEffect(() => {
    const target = (route.params as any)?.solicitud as string | undefined
    if (!target || data.length === 0) return
    if (data.some(d => d.Solicitud === target)) {
      focusSolicitud(target)
    }
    navigation.setParams({ solicitud: undefined })
  }, [data, route.params, focusSolicitud, navigation])

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Histórico de SC
      </Text>
    ),
    right: (
      <XStack gap="$3" alignItems="center">
        <View onPress={() => getInfo()}>
          <RotateCwStyled size={18} />
        </View>
        <NotificationBell size={18} />
      </XStack>
    )
  })

  return (
    <YStack
      flex={1}
      backgroundColor="$backgroundPage"
      padding="$3"
    >
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState
          type="server"
          title={error.title}
          message={error.message}
          errorCode={error.status}
          onRetry={getInfo}
        />
      ) : (
        <>
          <SearchInput
            data={data}
            searchKeys={['Solicitud', 'Categoria', 'Preparador', 'ImporteNeto']}
            onResults={setFiltered}
            placeholder="Buscar..."
          />

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            {(filtered?.length ?? 0) === 0 ? (
              <EmptyState onAction={getInfo} />
            ) : (
              (filtered ?? []).map((solicitud, index) => {
                const aprobada = isAprobada(solicitud.Estado)
                const resaltada = highlighted === solicitud.Solicitud
                return (
                  <Card
                    key={`${solicitud.Solicitud}-${index}`}
                    onLayout={(e: any) => { cardY.current[solicitud.Solicitud] = e.nativeEvent.layout.y }}
                    borderRadius="$4"
                    backgroundColor={resaltada ? '$primaryOpacity2' : '$backgroundElevated'}
                    overflow="hidden"
                    marginBottom="$4"
                  >
                    <XStack
                      padding="$3"
                      alignItems="center"
                      justifyContent="space-between"
                      backgroundColor={resaltada ? 'transparent' : '$backgroundSurface'}
                    >
                      <XStack gap="$3" alignItems="center" flex={1}>
                        <View
                          width={38}
                          height={38}
                          borderRadius="$4"
                          backgroundColor="$primaryOpacity"
                          alignItems="center"
                          justifyContent="center"
                        >
                          <ClipboardListStyled size={18} />
                        </View>

                        <YStack flex={1}>
                          <Text
                            fontWeight="800"
                            color="$text"
                            numberOfLines={1}
                          >
                            {solicitud.Solicitud}
                          </Text>

                          <Text
                            fontSize="$1"
                            color="$textMuted"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {solicitud.Preparador}
                          </Text>
                        </YStack>
                      </XStack>

                      <XStack
                        alignItems="center"
                        gap="$1"
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        borderRadius="$10"
                        backgroundColor={aprobada ? '$successOpacity' : '$errorOpacity'}
                      >
                        {aprobada ? (
                          <CheckCircle2 size={13} color="#22C55E" />
                        ) : (
                          <XCircle size={13} color="#EF4444" />
                        )}
                        <Text
                          fontSize={11}
                          fontWeight="800"
                          color={aprobada ? '$success' : '$error'}
                        >
                          {aprobada ? 'Aprobada' : 'Rechazada'}
                        </Text>
                      </XStack>
                    </XStack>

                    <YStack padding="$3" gap="$2">
                      <XStack
                        borderWidth={1}
                        borderColor="$backgroundSurface"
                        borderRadius="$3"
                        padding="$3"
                        justifyContent="space-between"
                      >
                        <YStack>
                          <Text fontSize={9} color="$textMuted" fontWeight="700">
                            CATEGORÍA
                          </Text>

                          <Text
                            fontSize="$3"
                            fontWeight="700"
                            color="$text"
                            maxWidth={180}
                          >
                            {solicitud.Categoria || 'Sin categoría'}
                          </Text>
                        </YStack>

                        <YStack alignItems="flex-end">
                          <Text fontSize={9} color="$textMuted" fontWeight="700">
                            TOTAL IMPORTE
                          </Text>

                          <Text fontSize="$5" fontWeight="800" color="$text">
                            {formatMoney(solicitud.ImporteNeto)}
                          </Text>
                        </YStack>
                      </XStack>

                      <XStack alignItems="center" justifyContent="space-between" marginTop="$1">
                        <XStack alignItems="center" gap="$1">
                          <CalendarClock size={13} color="#94A3B8" />
                          <Text fontSize="$2" color="$textMuted">
                            {formatDate(solicitud.Creation_Date)}
                          </Text>
                        </XStack>

                        {!!solicitud.Name && (
                          <XStack alignItems="center" gap="$1">
                            <User size={13} color="#94A3B8" />
                            <Text fontSize="$2" color="$textMuted" numberOfLines={1}>
                              {solicitud.Name}
                            </Text>
                          </XStack>
                        )}
                      </XStack>

                      {(solicitud.Articulos?.length ?? 0) > 0 && (
                        <XStack
                          alignItems="center"
                          justifyContent="space-between"
                          padding="$2"
                          marginTop="$2"
                        >
                          <Text fontSize="$2" fontWeight="800" color="$text">
                            CANTIDAD DE PRODUCTOS
                          </Text>
                          <Text fontSize="$2" fontWeight="800" color="$text">
                            {solicitud.Articulos!.length}
                          </Text>
                        </XStack>
                      )}
                    </YStack>
                  </Card>
                )
              })
            )}
          </ScrollView>

          <RecordCount count={filtered?.length ?? 0} />
        </>
      )}

    </YStack>
  )
}
