
import { Check, X, ChevronUp, ClipboardList, ChevronDown, RotateCw } from 'lucide-react-native'
import React, { useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native'
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

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Aprobación de SC
      </Text>
    ),
    right: (
      <XStack gap="$2">
        <View onPress={() => getInfo()}>
          <RotateCwStyled size={18}  />
        </View>
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
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            {(filtered?.length ?? 0) === 0 ? (
              <EmptyState onAction={getInfo} />
            ) : (
              (filtered ?? []).map((solicitud, index) => (
                <Card
                  key={`${solicitud.Solicitud}-${index}`}
                  borderRadius="$4"
                  backgroundColor="$backgroundElevated"
                  overflow="hidden"
                  marginBottom="$4"
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