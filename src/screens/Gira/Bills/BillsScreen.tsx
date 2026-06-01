import React, { useEffect, useState } from 'react'
import { YStack, Text, ScrollView, Card, XStack, View, useTheme } from 'tamagui'
import { Bill } from './types'
import { Pencil, Plus } from 'lucide-react-native'
import Page from '../../../components/commons/Page'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'

export type RootStackParamList = {
  home: undefined;
  gasto_form: { id?: number };
};
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function BillsScreen() {
    const [data, setData] = useState<Bill[]>([])
    const navigation = useNavigation<NavProps>();
    const theme = useTheme()


    const getInfo = async () => {
        const infoTempo: Bill[] = [
            {
                "id": 1,
                "travelExpense": "Vuelo de ida y vuelta",
                "expenseType": "Transporte aéreo",
                "provider": "Aerolíneas del Caribe",
                "providerRtn": "08011990123456",
                "invoiceNumber": "FAC-001-0234",
                "description": "Boleto áereo para viaje de negocios a San Pedro Sula.",
                "taxableAmount": 450.00,
                "exemptAmount": 0.00,
                "total": 450.00,
                "invoiceDate": "2026-05-10",
                "status": "Aprobado"
            },
            {
                "travelExpense": "Hospedaje de 3 noches",
                "expenseType": "Alojamiento",
                "provider": "Hotel Ejecutivo Plaza",
                "providerRtn": "05011985654321",
                "invoiceNumber": "FAC-005-9876",
                "description": "Estadía de tres noches por conferencia anual.",
                "taxableAmount": 300.00,
                "exemptAmount": 0.00,
                "total": 300.00,
                "invoiceDate": "2026-05-13",
                "status": "Aprobado"
            },
            {
                "travelExpense": "Cena con clientes",
                "expenseType": "Alimentación",
                "provider": "Restaurante El Portal",
                "providerRtn": "08012003789456",
                "invoiceNumber": "FAC-002-1122",
                "description": "Cena de negocios para cierre de contrato.",
                "taxableAmount": 85.50,
                "exemptAmount": 0.00,
                "total": 85.50,
                "invoiceDate": "2026-05-12",
                "status": "Pendiente"
            },
            {
                "travelExpense": "Taxi al aeropuerto",
                "expenseType": "Transporte terrestre",
                "provider": "Servicios de Taxi Express",
                "providerRtn": "05011995112233",
                "invoiceNumber": "FAC-010-4567",
                "description": "Traslado desde el hotel hacia el aeropuerto internacional.",
                "taxableAmount": 25.00,
                "exemptAmount": 0.00,
                "total": 25.00,
                "invoiceDate": "2026-05-14",
                "status": "Aprobado"
            },
            {
                "travelExpense": "Inscripción al evento",
                "expenseType": "Eventos y capacitación",
                "provider": "Cámara de Comercio",
                "providerRtn": "08011970998877",
                "invoiceNumber": "FAC-022-3344",
                "description": "Pase de entrada para el seminario de actualización tecnológica.",
                "taxableAmount": 0.00,
                "exemptAmount": 150.00,
                "total": 150.00,
                "invoiceDate": "2026-05-05",
                "status": "Aprobado"
            },
            {
                "travelExpense": "Almuerzo de trabajo",
                "expenseType": "Alimentación",
                "provider": "Café y Más",
                "providerRtn": "01012010556677",
                "invoiceNumber": "FAC-001-8899",
                "description": "Consumo de alimentos durante escala de viaje.",
                "taxableAmount": 18.20,
                "exemptAmount": 0.00,
                "total": 18.20,
                "invoiceDate": "2026-05-10",
                "status": "Aprobado"
            },
            {
                "travelExpense": "Renta de vehículo",
                "expenseType": "Transporte terrestre",
                "provider": "Arrendadora de Autos Continental",
                "providerRtn": "05011991443322",
                "invoiceNumber": "FAC-008-5566",
                "description": "Alquiler de automóvil por 2 días para visitas a plantas operativas.",
                "taxableAmount": 110.00,
                "exemptAmount": 0.00,
                "total": 110.00,
                "invoiceDate": "2026-05-11",
                "status": "Pendiente"
            },
            {
                "travelExpense": "Peajes de carretera",
                "expenseType": "Transporte terrestre",
                "provider": "Concesionaria Vial del Norte",
                "providerRtn": "16012015998811",
                "invoiceNumber": "FAC-045-7788",
                "description": "Pago de peajes en ruta hacia la zona norte.",
                "taxableAmount": 0.00,
                "exemptAmount": 12.00,
                "total": 12.00,
                "invoiceDate": "2026-05-11",
                "status": "Aprobado"
            },
            {
                "travelExpense": "Acceso a internet en hotel",
                "expenseType": "Telecomunicaciones",
                "provider": "Hotel Ejecutivo Plaza",
                "providerRtn": "05011985654321",
                "invoiceNumber": "FAC-005-9877",
                "description": "Servicio de internet de alta velocidad para videoconferencias.",
                "taxableAmount": 15.00,
                "exemptAmount": 0.00,
                "total": 15.00,
                "invoiceDate": "2026-05-12",
                "status": "Aprobado"
            },
            {
                "travelExpense": "Seguro de viaje médico",
                "expenseType": "Seguros",
                "provider": "Aseguradora Alfa",
                "providerRtn": "08011965443322",
                "invoiceNumber": "FAC-012-6543",
                "description": "Póliza de cobertura médica internacional para emergencias.",
                "taxableAmount": 0.00,
                "exemptAmount": 45.00,
                "total": 45.00,
                "invoiceDate": "2026-05-08",
                "status": "Pendiente"
            }
        ]
        setData(infoTempo)
    }

    const createBill = (id?: number) => {
        navigation.navigate('gasto_form', { id })
    }

    useEffect(() => {
        getInfo()
    }, [])


    const getStatusColor = (status: string) => {
        switch (status) {
        case 'Aprobado':
            return '#16a34a' // verde
        case 'Pendiente':
            return '#f59e0b' // amarillo
        default:
            return '#64748b' // gris
        }
    }
    

    return (
        <Page
            headerActions={[
                {
                    icon: Plus,
                    onPress: createBill,
                },
            ]}
        >
            <YStack flex={1} backgroundColor="$card2" padding="$3">
                <ScrollView showsVerticalScrollIndicator={false} marginBottom="$3">
                    <YStack gap="$1">
                        {data.map((item, index) => (
                            <Card
                                key={index}
                                backgroundColor="$backgroundPage"
                                borderRadius={10}
                                padding="$3"
                                marginBottom="$2"
                            >
                                <YStack gap="$2">

                                    {/* HEADER */}
                                    <XStack justifyContent="space-between" alignItems="center">

                                    <Text
                                        fontSize={14}
                                        fontWeight="800"
                                        color="$text"
                                    >
                                        {item.invoiceNumber}
                                    </Text>

                                    <XStack alignItems="center" gap="$2">

                                        <View
                                            paddingHorizontal={8}
                                            paddingVertical={2}
                                            borderRadius={999}
                                            backgroundColor={getStatusColor(item.status)}
                                        >
                                            <Text
                                                fontSize={10}
                                                color="white"
                                                fontWeight="700"
                                            >
                                                {item.status}
                                            </Text>
                                        </View>

                                        <View
                                            onPress={() => createBill(item?.id)}
                                            padding={4}
                                            borderRadius={999}
                                            pressStyle={{ opacity: 0.7 }}
                                        >
                                        <Pencil
                                            size={14}
                                            color={theme.button?.val}
                                        />
                                        </View>

                                    </XStack>

                                    </XStack>

                                    {/* BODY */}
                                    <XStack justifyContent="space-between" alignItems="center">

                                        <YStack flex={1} gap={2}>

                                            <Text
                                                fontSize={12}
                                                fontWeight="700"
                                                color="$text"
                                                numberOfLines={1}
                                            >
                                                {item.travelExpense}
                                            </Text>

                                            <Text
                                                fontSize={11}
                                                color="$textMuted"
                                                numberOfLines={1}
                                            >
                                                {item.provider}
                                            </Text>

                                        </YStack>

                                        <Text
                                            fontSize={16}
                                            fontWeight="800"
                                            color="$text"
                                        >
                                            L {item.total.toFixed(2)}
                                        </Text>

                                    </XStack>

                                    {/* FOOTER */}
                                    <Text
                                        fontSize={10}
                                        color="$textMuted"
                                    >
                                        {item.invoiceDate}
                                    </Text>

                                </YStack>
                            </Card>
                        ))}
                    </YStack>
                </ScrollView>
            </YStack>
        </Page>
    )
}