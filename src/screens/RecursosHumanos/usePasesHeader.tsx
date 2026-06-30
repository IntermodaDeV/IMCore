import React from 'react'
import { Text, useTheme } from 'tamagui'
import { ArrowLeft } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { usePageHeader } from '../../hooks/usePageHeader'
import { NotificationBell } from '../../components/notifications/NotificationBell'

// Header estándar de las pantallas de pases: flecha para regresar (izquierda),
// título (centro) y campana de notificaciones (derecha). Así se puede volver a
// entrar a otro pase desde las notificaciones sin salir del módulo.
export function usePasesHeader(title: string) {
  const navigation = useNavigation<any>()
  const theme = useTheme()
  usePageHeader({
    left: (
      <ArrowLeft
        size={22}
        color={theme.text?.val as string}
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('inicio'))}
      />
    ),
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        {title}
      </Text>
    ),
    right: <NotificationBell size={20} />,
  })
}
