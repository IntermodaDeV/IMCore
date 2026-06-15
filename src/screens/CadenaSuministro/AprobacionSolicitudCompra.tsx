
import { Check, X, ChevronUp, ClipboardList, ChevronDown } from 'lucide-react-native'
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
import { ISolicitudCompraUsuario } from '../../api/modules/CadenaSuministro/cadenaSuministro.types';
import { AppError, handleError } from '../../utils/errorHandler';
import { ExecutionResponse } from '../../api/modules/response.type';
import { cadenaSuministroService } from '../../api/modules/CadenaSuministro/cadenaSuministro.service';
import { useLoader } from '../../providers/LoaderProvider';
import ErrorState from '../AdmSys/ErrorState';
import SkeletonList from '../../components/Skeletons/SkeletonList';
import SearchInput from '../../components/commons/SearchInput';

export default function AprobacionSolicitudCompra() {

  //Icons
  const ClipboardListStyled = styled(ClipboardList, { color: '$primary' });
  const CheckStyled = styled(Check, { color: '$white' });
  const XStyled = styled(X, { color: '$error' });
  const loader = useLoader();

  usePageHeader({
      center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
          Aprobación de SC
      </Text>
      ),

  })

  //Estados
  const [data, setData] = useState<ISolicitudCompraUsuario[]>([])
  const [filtered, setFiltered] = useState<ISolicitudCompraUsuario[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  const getInfo = React.useCallback(async () => {
    try {
      loader.show()
      setLoading(true)
      setError(null)
      const response: ExecutionResponse<ISolicitudCompraUsuario[]> = await cadenaSuministroService.getSolicitudesCompras('dguerra')

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
  

  const toggleDetalle = (solicitud: string) => {
    setFiltered(prev =>
      prev.map(item =>
        item.Solicitud === solicitud
          ? { ...item, expandido: !item.expandido }
          : item
      )
    )
  }

  // useFocusEffect(
  //   React.useCallback(() => {
  //     getInfo()
  //   }, [getInfo])
  // )
  const formatMoney = (value: number) =>
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)

  useEffect(() => {
    getInfo()
  }, [])

  useEffect(() => {
    setFiltered(data)
  }, [data])


  return (
    <YStack
      flex={1}
      backgroundColor="$card2"
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
        <ScrollView
          flex={1}
          backgroundColor="$background"
          showsVerticalScrollIndicator={false}
        >
        <>
          <SearchInput
            data={data}
            searchKeys={['Solicitud', 'Categoria', 'Preparador', 'ImporteNeto']}
            onResults={setFiltered}
            placeholder="Buscar..."
          />
          {filtered.map((solicitud, index) => (
            <Card
              key={`${solicitud.Solicitud}-${index}`}
              borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="#E2E8F0"
              overflow="hidden"
              marginBottom="$2"
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
                      color="#0F172A"
                      numberOfLines={1}
                    >
                      {solicitud.Solicitud}
                    </Text>

                    <Text
                      fontSize="$1"
                      color="$foregroundMuted"
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
                  >
                    <XStyled size={15} />
                  </Button>

                  <Button
                    height={34}
                    width={34}
                    borderRadius="$3"
                    backgroundColor="$success"
                  >
                    <CheckStyled size={15} />
                  </Button>
                </XStack>
              </XStack>

              <YStack padding="$3" gap="$2">
                <XStack
                  borderWidth={1}
                  borderColor="$backgroundHover"
                  borderRadius="$3"
                  padding="$3"
                  justifyContent="space-between"
                >
                  <YStack>
                    <Text fontSize={9} color="#94A3B8" fontWeight="700">
                      CATEGORÍA
                    </Text>

                    <Text
                      fontSize="$3"
                      fontWeight="700"
                      color="#1E293B"
                      maxWidth={180}
                    >
                      {solicitud.Categoria}
                    </Text>
                  </YStack>

                  <YStack alignItems="flex-end">
                    <Text fontSize={9} color="#94A3B8" fontWeight="700">
                      TOTAL IMPORTE
                    </Text>

                    <Text fontSize="$5" fontWeight="800" color="#0F172A">
                      {formatMoney(solicitud.ImporteNeto)}
                    </Text>
                  </YStack>
                </XStack>

                <XStack
                  alignItems="center"
                  padding="$2"
                  borderRadius="$2"
                  justifyContent="space-between"
                  gap="$1"
                  marginTop="$3"
                  pressStyle={{
                    backgroundColor: '$backgroundPress',
                  }}
                  onPress={() => toggleDetalle(solicitud.Solicitud)}
                >
                  <Text fontSize="$2" fontWeight="800" color="#1E293B">
                    DETALLE DE PRODUCTOS ({solicitud.Articulos.length})
                  </Text>

                  {solicitud.expandido ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </XStack>

                {solicitud.expandido &&
                  solicitud.Articulos.map((producto, index) => (
                    <YStack
                      key={`${solicitud.Solicitud}-${index}`}
                      padding="$2"
                      borderRadius="$4"
                      borderWidth={1}
                      borderColor="$backgroundHover"
                      gap="$2"
                    >
                      <XStack justifyContent="space-between" alignItems="center">
                        <Text
                          flex={1}
                          fontSize="$3"
                          fontWeight="700"
                          color="$black"
                        >
                          {producto.NombreProducto}
                        </Text>

                        <Text fontSize="$2" color="$gray10">
                          Cant. {producto.Cantidad}
                        </Text>
                      </XStack>

                      <XStack justifyContent="space-between" alignItems="center">
                        <Text fontSize="$2" color="$gray10">
                          Precio unitario: {formatMoney(producto.Precio)}{' '}
                          {producto.Moneda}
                        </Text>

                        <Text fontSize="$2" fontWeight="800" color="$black">
                          {formatMoney(producto.ImporteNeto)} {producto.Moneda}
                        </Text>
                      </XStack>
                    </YStack>
                ))}
              </YStack>
            </Card>
          ))}
        </>
        </ScrollView>
      )}
    </YStack>
  )
}