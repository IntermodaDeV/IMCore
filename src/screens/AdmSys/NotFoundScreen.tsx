import { FileText, AlertTriangle, Home } from 'lucide-react-native'
import React from 'react'
import { View, Text, Button } from 'tamagui'

export default function NotFoundScreen({ route }: any) {
  return (
    <View
      flex={1}
      backgroundColor="$card2"
      padding="$6"
      justifyContent="space-between"
    >
      {/* HEADER VISUAL */}
      <View alignItems="center" marginTop="$10">
        <View
          width={72}
          height={72}
          borderRadius={18}
          backgroundColor="$card"
          justifyContent="center"
          alignItems="center"
          borderWidth={1}
          borderColor="$border"
        >
          <AlertTriangle size={30} color="#FF551A" />
        </View>

        <Text
          marginTop="$4"
          fontSize={20}
          fontWeight="800"
          color="$text"
        >
          Pantalla no disponible
        </Text>

        <Text
          marginTop="$2"
          fontSize={13}
          color="$textMuted"
          textAlign="center"
        >
          Esta sección no está disponible o aún no ha sido activada
        </Text>
      </View>

      {/* INFO BOX */}
      <View
        backgroundColor="$card"
        borderRadius={16}
        padding="$4"
        borderWidth={1}
        borderColor="$border"
      >
        <Text fontSize={12} color="$textMuted">
          Información
        </Text>

        <View marginTop="$3" gap="$2">
          <Text fontSize={13} color="$text">
            • Sección solicitada:
          </Text>

          <Text fontSize={13} color="$primary" fontWeight="700">
            {route?.params?.name ?? route?.name ?? 'desconocida'}
          </Text>

          <Text fontSize={13} color="$text">
            • Estado:
          </Text>

          <Text fontSize={13} color="#ef4444" fontWeight="700">
            No disponible
          </Text>
        </View>
      </View>

      {/* ACTION */}
      <View gap="$3">
        <Button
          backgroundColor="$primary"
          height={40}
          borderRadius="$3"
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
          pressStyle={{ opacity: 0.8 }}
          onPress={() => navigation.navigate('Home' as never)}
        >
          <Home size={18} color="white" />
          <Text color="white" fontWeight="700">
            Volver al inicio
          </Text>
        </Button>
      </View>
    </View>
  )
}