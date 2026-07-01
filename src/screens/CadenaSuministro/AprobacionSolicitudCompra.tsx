
import { Check, X, ChevronUp, ClipboardList, ChevronDown, RotateCw } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native'
import {
  YStack,
  XStack,
  Text,
  Button,
  Card,
  View,
  styled,
  ScrollView,
} from 'tamagui'
import { usePageHeader } from '../../hooks/usePageHeader';
import { ISolicitud, ISolicitudCompraUsuario } from '../../api/modules/CadenaSuministro/cadenaSuministro.types';
import { AppError, handleError } from '../../utils/errorHandler';
import { ExecutionResponse } from '../../api/modules/response.type';
import { cadenaSuministroService } from '../../api/modules/CadenaSuministro/cadenaSuministro.service';
import { useLoader } from '../../providers/LoaderProvider';
import ErrorState from '../AdmSys/ErrorState';
import SkeletonList from '../../components/Skeletons/SkeletonList';
import SearchInput from '../../components/commons/SearchInput';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/commons/ConfirmDialog';
import { useShowToast } from '../../utils/useShowToast';
import EmptyState from '../AdmSys/EmptyState';
import { Pressable } from 'react-native';
import RecordCount from '../../components/commons/RecordCount';
import { NotificationBell } from '../../components/notifications/NotificationBell';

export default function AprobacionSolicitudCompra() {

  //Icons
  const ClipboardListStyled = styled(ClipboardList, { color: '$primary' });
  const CheckStyled = styled(Check, { color: '$white' });
  const XStyled = styled(X, { color: '$error' });
  const RotateCwStyled = styled(RotateCw, { color: '$text' });
  const ChevronUpStyled = styled(ChevronUp, { color: '$text' });
  const ChevronDownStyled = styled(ChevronDown, { color: '$text' });

  //Estados
  const [data, setData] = useState<ISolicitudCompraUsuario[]>([])
  const [filtered, setFiltered] = useState<ISolicitudCompraUsuario[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [aprobarDialog, setAprobarDialog] = useState(false);
  const [solicitudSelected, setSolicitudSelected] = useState<ISolicitudCompraUsuario | null>(null);
  const [loadingDialog, setLoadingDialog] = useState(false)
  const [estado, setEstado] = useState('');
  const { showToast } = useShowToast()
  const { user } = useAuth()
  const loader = useLoader();

  // Navegación por notificación: resalta/expande una solicitud específica.
  const route = useRoute()
  const navigation = useNavigation<any>()
  const scrollRef = useRef<any>(null)
  const cardY = useRef<Record<string, number>>({})
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<string | null>(null)

  const getInfo = React.useCallback(async () => {
    try {
      loader.show()
      setLoading(true)
      setError(null)
      const response: ExecutionResponse<ISolicitudCompraUsuario[]> = await cadenaSuministroService.getSolicitudesCompras(user?.Code ?? '')
      if (response.Success) {
        const solicitudes = response.Data.map(item => ({
          ...item,
          expandido: false,
          justificacion: '',
        }))
        setData(solicitudes)
        setFiltered(solicitudes)
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
  }, [])
  

  const aprobarSolicitudFun = async () => {
    try {
      setLoadingDialog(true)

      const info: ISolicitud = {
        Solicitud: solicitudSelected?.Solicitud ?? '',
        Usuario: user?.Code ?? '',
        Estado: estado,
        PreparadorCode: solicitudSelected?.PreparadorCode ?? '',
        Preparador: solicitudSelected?.Preparador ?? '',
        ImporteNeto: solicitudSelected?.ImporteNeto ?? 0,
        Categoria: solicitudSelected?.Categoria ?? '',
      }
      const response = await cadenaSuministroService.aprobarSolicitud(info)
      if (response?.Success) {
        showToast('success', 'Éxito', response.SuccessMessage, 5000, 'top')
      } else {
        showToast('error', 'Error', response.ErrorMessage, 5000, 'top')
      }
    } finally {
      getInfo()
      cerrarDialog()
      setLoadingDialog(false)
    }
  }

  const cerrarDialog = () => {
    setAprobarDialog(false)
    setSolicitudSelected(null)
    setEstado('')
  }

  const toggleDetalle = (solicitud: string) => {
    setFiltered(prev =>
      prev.map(item =>
        item.Solicitud === solicitud
          ? { ...item, expandido: !item.expandido }
          : item
      )
    )
  }

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  const formatMoney = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2}).format(value)

  useEffect(() => {
    setFiltered(data)
  }, [data])

  // Expande (horneado en `data` para que ningún reset lo borre), resalta y
  // desplaza hacia una solicitud concreta.
  const focusSolicitud = React.useCallback((codigo: string) => {
    const expandir = (item: ISolicitudCompraUsuario) =>
      item.Solicitud === codigo ? { ...item, expandido: true } : item
    setData(prev => prev.map(expandir))
    setFiltered(prev => prev.map(expandir))
    setHighlighted(codigo)
    // Espera al re-render (la tarjeta expandida cambia de alto) para el scroll.
    setTimeout(() => {
      const y = cardY.current[codigo]
      if (y != null) scrollRef.current?.scrollTo?.({ y: Math.max(y - 12, 0), animated: true })
    }, 400)
    // Quita el resaltado después de un momento (la expansión se mantiene).
    setTimeout(() => setHighlighted(null), 3000)
  }, [])

  // 1) Captura el código entrante de la notificación y limpia el parámetro para
  //    no repetir el enfoque al volver a la pantalla.
  useEffect(() => {
    const target = (route.params as any)?.solicitud as string | undefined
    if (target) {
      setFocusTarget(String(target))
      navigation.setParams({ solicitud: undefined })
    }
  }, [route.params, navigation])

  // 2) Aplica el enfoque cuando ya hay datos cargados (evita la carrera con
  //    getInfo) y la solicitud existe en la lista.
  useEffect(() => {
    if (!focusTarget || loading || data.length === 0) return
    if (data.some(d => d.Solicitud === focusTarget)) {
      focusSolicitud(focusTarget)
    }
    setFocusTarget(null)
  }, [focusTarget, data, loading, focusSolicitud])

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Aprobación de SC
      </Text>
    ),
    right: (
      <XStack gap="$3" alignItems="center">
        <View onPress={() => getInfo()}>
          <RotateCwStyled size={18}  />
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
        <SkeletonList/>
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
              (filtered ?? []).map((solicitud, index) => (
                <Card
                  key={`${solicitud.Solicitud}-${index}`}
                  onLayout={(e: any) => { cardY.current[solicitud.Solicitud] = e.nativeEvent.layout.y }}
                  borderRadius="$4"
                  backgroundColor="$backgroundElevated"
                  overflow="hidden"
                  marginBottom="$4"
                  borderWidth={highlighted === solicitud.Solicitud ? 2 : 0}
                  borderColor={highlighted === solicitud.Solicitud ? '$primary' : 'transparent'}
                >
                  <XStack
                    padding="$3"
                    alignItems="center"
                    justifyContent="space-between"
                    backgroundColor="$backgroundSurface"
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

                    <XStack gap="$2" flexShrink={0}>
                      <Button
                        height={34}
                        width={34}
                        borderRadius="$3"
                        backgroundColor="transparent"
                        borderWidth={1.5}
                        borderColor="$error"
                        onPress={() => {
                          setAprobarDialog(true)
                          setSolicitudSelected(solicitud)
                          setEstado('Reject')
                        }}
                      >
                        <XStyled size={15} />
                      </Button>

                      <Button
                        height={34}
                        width={34}
                        borderRadius="$3"
                        backgroundColor="$success"
                        onPress={() => {
                          setAprobarDialog(true)
                          setSolicitudSelected(solicitud)
                          setEstado('Approve')
                        }}
                      >
                        <CheckStyled size={15} />
                      </Button>
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
                          {solicitud.Categoria}
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

                    <Pressable
                      onPress={() => toggleDetalle(solicitud.Solicitud)}
                    >
                      <XStack
                        alignItems="center"
                        padding="$2"
                        borderRadius="$2"
                        justifyContent="space-between"
                        gap="$1"
                        marginTop="$3"
                      >
                        <Text
                          fontSize="$2"
                          fontWeight="800"
                          color="$text"
                        >
                          DETALLE DE PRODUCTOS ({solicitud.Articulos.length})
                        </Text>

                        {solicitud.expandido ? (
                          <ChevronUpStyled size={14} />
                        ) : (
                          <ChevronDownStyled size={14} />
                        )}
                      </XStack>
                    </Pressable>

                    {solicitud.expandido && (
                      <ScrollView
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={false}
                        style={{ maxHeight: 200 }}
                        contentContainerStyle={{ paddingVertical: 8 }}
                      >
                        <YStack gap="$2">
                          {solicitud.Articulos.map((producto, articuloIndex) => (
                            <YStack
                              key={`${solicitud.Solicitud}-${articuloIndex}`}
                              padding="$2"
                              borderRadius="$4"
                              borderWidth={1}
                              borderColor="$border"
                              gap="$2"
                            >
                              <XStack
                                justifyContent="space-between"
                                alignItems="center"
                              >
                                <Text
                                  flex={1}
                                  fontSize="$3"
                                  fontWeight="700"
                                  color="$text"
                                >
                                  {producto.NombreProducto}
                                </Text>

                                <Text
                                  fontSize="$2"
                                  color="$text"
                                >
                                  Cant. {producto.Cantidad}
                                </Text>
                              </XStack>

                              <XStack
                                justifyContent="space-between"
                                alignItems="center"
                              >
                                <Text
                                  fontSize="$2"
                                  color="$text"
                                >
                                  Precio unitario:{' '}
                                  {formatMoney(producto.Precio)}{' '}
                                  {producto.Moneda}
                                </Text>

                                <Text
                                  fontSize="$2"
                                  fontWeight="800"
                                  color="$text"
                                >
                                  {formatMoney(producto.ImporteNeto)}{' '}
                                  {producto.Moneda}
                                </Text>
                              </XStack>
                            </YStack>
                          ))}
                        </YStack>
                      </ScrollView>
                    )}
                  </YStack>
                </Card>
              ))
            )}
          </ScrollView>

          <RecordCount count={filtered?.length ?? 0} />
        </>
      )}

    <ConfirmDialog
      open={aprobarDialog}
      onOpenChange={() => setAprobarDialog(false)}
      title={estado === 'Approve' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
      message={`¿Desea "${estado === 'Approve' ? 'Aprobar' : 'Rechazar'}" la solicitud "${solicitudSelected?.Solicitud}"?`}
      confirmColor = '#FF551A'
      onConfirm={aprobarSolicitudFun}
      onCancel={cerrarDialog}
      confirmLabel={estado === 'Approve' ? 'Aprobar' : 'Rechazar'}
      loading={loadingDialog}
    />
    </YStack>
  )
}