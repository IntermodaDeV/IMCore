
import { Check, X, ChevronUp, ClipboardList, ChevronDown } from 'lucide-react-native'
import { useState } from 'react';
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

export default function AprobacionSolicitudCompra() {

  //Icons
  const ClipboardListStyled = styled(ClipboardList, { color: '$primary' });
  const CheckStyled = styled(Check, { color: '$white' });
  const XStyled = styled(X, { color: '$error' });

  usePageHeader({
      center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
          Aprobación de SC
      </Text>
      ),

  })

  //Estados
  const [solicitudes, setSolicitudes] = useState([
    {
      id: 1,
      codigo: 'SC-000001',
      preparadoPor: 'Gustavo Meza',
      totalImporte: 100.0,
      moneda: 'HNL',
      tipo: 'Mantenimiento',
      expandido: true,
      justificacion: '',
      productos: [
        {
          id: 1,
          nombre: 'Toma 220 volt',
          cantidad: 2,
          precioUnitario: 50.0,
          total: 100.0,
          moneda: 'HNL',
        },
      ],
    },
    {
      id: 2,
      codigo: 'SC-000002',
      preparadoPor: 'Gustavo Meza',
      totalImporte: 1485.0,
      moneda: 'HNL',
      tipo: 'Instalación',
      expandido: false,
      justificacion: '',
      productos: [
        {
          id: 1,
          nombre: 'Cable eléctrico',
          cantidad: 5,
          precioUnitario: 50.0,
          total: 250.0,
          moneda: 'HNL',
        },
        {
          id: 2,
          nombre: 'Tomacorriente doble',
          cantidad: 8,
          precioUnitario: 35.0,
          total: 280.0,
          moneda: 'HNL',
        },
        {
          id: 3,
          nombre: 'Interruptor sencillo',
          cantidad: 6,
          precioUnitario: 45.0,
          total: 270.0,
          moneda: 'HNL',
        },
        {
          id: 4,
          nombre: 'Tubería PVC 1/2"',
          cantidad: 10,
          precioUnitario: 22.5,
          total: 225.0,
          moneda: 'HNL',
        },
        {
          id: 5,
          nombre: 'Caja octagonal',
          cantidad: 4,
          precioUnitario: 40.0,
          total: 160.0,
          moneda: 'HNL',
        },
        {
          id: 6,
          nombre: 'Breaker 20A',
          cantidad: 2,
          precioUnitario: 150.0,
          total: 300.0,
          moneda: 'HNL',
        },
      ],
    },
  ]);

  const toggleDetalle = (id: number) => {
    setSolicitudes((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, expandido: !item.expandido }
          : item
      )
    );
  };

  const handleJustificacionChange = (id: number, value: string) => {
    setSolicitudes((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, justificacion: value }
          : item
      )
    );
  };

  return (
    <ScrollView
      flex={1}
      backgroundColor="$background"
      showsVerticalScrollIndicator={false}
    > 
      <YStack flex={1}  padding="$4" gap="$4">

        {solicitudes.map((solicitud) => (
          <Card
            key={solicitud.id}
            borderRadius="$4"
            backgroundColor="$backgroundElevated"
            borderWidth={1}
            borderColor="#E2E8F0"
            overflow="hidden"
          >

            <XStack padding="$3" justifyContent="space-between" backgroundColor="$backgroundSurface">
              <XStack  gap="$3" alignItems="center" >
                <View
                  width={34}
                  height={34}
                  borderRadius="$3"
                  backgroundColor="$primaryOpacity"
                  alignItems="center"
                  justifyContent="center"
                >

                  <ClipboardListStyled size={18} />
                </View>

                <YStack>
                  <Text fontWeight="700" color="#1E293B">
                    {solicitud.codigo}
                  </Text>
                  <Text fontSize="$1" color="$foregroundMuted">
                    Preparado por: {solicitud.preparadoPor}
                  </Text>
                </YStack>
              </XStack>

              <XStack gap="$4" marginTop="$1">

                <Button
                  height={32}
                  width={32}
                  borderRadius="$3"
                  backgroundColor="transparent"
                  borderWidth={1.5}
                  borderColor="$error"
                  >
                  <XStyled size={15} />
                </Button>
                <Button
                  height={32}
                  width={32}
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
                    TOTAL IMPORTE
                  </Text>
                  <Text fontSize="$5" fontWeight="800" color="#0F172A">
                    {solicitud.totalImporte.toFixed(2)} {solicitud.moneda}
                  </Text>
                </YStack>

                <YStack alignItems="flex-end">
                  <Text fontSize={9} color="#94A3B8" fontWeight="700">
                    TIPO
                  </Text>
                  <Text fontSize="$3" fontWeight="700" color="#1E293B">
                    {solicitud.tipo}
                  </Text>
                </YStack>
              </XStack>

              <XStack   
                  alignItems="center" padding="$2" borderRadius="$2" justifyContent="space-between" gap="$1" marginTop="$3" 
                  pressStyle={{
                    backgroundColor: '$backgroundPress',
                  }}
                  onPress={() => toggleDetalle(solicitud.id)} >
                <Text fontSize="$2" fontWeight="800" color="#1E293B">
                  DETALLE DE PRODUCTOS ({solicitud.productos.length})
                </Text>
                {solicitud.expandido ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </XStack>

              {solicitud.expandido === true && (
                solicitud.productos.map((producto) => (
                  <YStack
                    key={producto.id}
                    padding="$2"
                    borderRadius="$4"
                    borderWidth={1}
                    borderColor="$backgroundHover"
                    gap="$2"
                  >
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text fontSize="$3" fontWeight="700" color="$black">
                        {producto.nombre}
                      </Text>

                      <Text fontSize="$2" color="$gray10">
                        Cant. {producto.cantidad} 
                      </Text>
                    </XStack>

                    <XStack justifyContent="space-between" alignItems="center">
                      <Text fontSize="$2" color="$gray10">
                        Precio unitario: {producto.precioUnitario} {producto.moneda}
                      </Text>

                      <Text fontSize="$2" fontWeight="800" color="$black">
                        {producto.total} {producto.moneda}
                      </Text>
                    </XStack>
                  </YStack>
                )
              ))}

              
            </YStack>
          </Card>
        ))}
        
      </YStack>
    </ScrollView>
  )
}