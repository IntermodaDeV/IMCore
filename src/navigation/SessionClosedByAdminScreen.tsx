import React from 'react'
import { YStack, Text, View } from 'tamagui'
import { UserX } from 'lucide-react-native'
import { TouchableOpacity } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function SessionClosedByAdminScreen() {
  const { logout, setSessionClosedByAdmin } = useAuth()

  const irALogin = async () => {
    setSessionClosedByAdmin(false)
    await logout()
  }

  return (
    <YStack
      flex={1}
      justifyContent="center"
      alignItems="center"
      padding="$6"
      backgroundColor="$background"
    >
      <View
        width={80}
        height={80}
        borderRadius={40}
        backgroundColor="rgba(255,85,26,0.10)"
        justifyContent="center"
        alignItems="center"
      >
        <UserX size={36} color="#FF551A" />
      </View>

      <Text marginTop="$5" fontSize={22} fontWeight="800" color="$text">
        Sesión cerrada
      </Text>

      <Text marginTop="$3" textAlign="center" color="$textMuted">
        Tu sesión fue cerrada por un administrador del sistema.
        Debes iniciar sesión nuevamente para continuar.
      </Text>

      <TouchableOpacity
        onPress={irALogin}
        style={{
          marginTop: 30,
          backgroundColor: '#FF551A',
          paddingHorizontal: 30,
          paddingVertical: 12,
          borderRadius: 12,
        }}
      >
        <Text color="white" fontWeight="700">
          Iniciar sesión
        </Text>
      </TouchableOpacity>
    </YStack>
  )
}
