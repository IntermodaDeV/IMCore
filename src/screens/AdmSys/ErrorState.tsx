import React from 'react'
import { YStack, XStack, Text, View, useTheme } from 'tamagui'
import { WifiOff, AlertTriangle, RotateCw, ServerCrash } from 'lucide-react-native'
import { TouchableOpacity, StyleSheet } from 'react-native'

interface ErrorStateProps {
  type?: string
  title?: string
  message?: string
  errorCode?: string | number
  onRetry?: () => void
  retryLabel?: string
}

const ERROR_DEFAULTS: Record<string, { title: string; message: string; Icon: any }> = {
  network: {
    title: 'Sin conexión',
    message: 'No pudimos cargar la información. Revisa tu conexión e intenta de nuevo.',
    Icon: WifiOff,
  },
  server: {
    title: 'Error del servidor',
    message: 'El servidor no está disponible en este momento. Intenta más tarde.',
    Icon: ServerCrash,
  },
  general: {
    title: 'Algo salió mal',
    message: 'Ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo.',
    Icon: AlertTriangle,
  },
}

export default function ErrorState({
  type = 'general',
  title,
  message,
  errorCode,
  onRetry,
  retryLabel = 'Reintentar',
}: ErrorStateProps) {
  const theme = useTheme()
  const defaults = ERROR_DEFAULTS[type]
  const Icon = defaults.Icon

  const displayTitle = title ?? defaults.title
  const displayMessage = message ?? defaults.message

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal="$6"
      paddingVertical="$8"
      gap="$0"
    >
      <XStack marginBottom="$5" opacity={0.15}>
        <View
          width={36}
          height={36}
          borderRadius={18}
          backgroundColor="#FF551A"
          zIndex={3}
        />
        <View
          width={36}
          height={36}
          borderRadius={18}
          backgroundColor="#94A3B8"
          marginLeft={-14}
          zIndex={2}
          opacity={0.7}
        />
        <View
          width={36}
          height={36}
          borderRadius={18}
          backgroundColor="#001F3F"
          marginLeft={-14}
          zIndex={1}
        />
      </XStack>

      {/* Ícono de error */}
      <View
        width={64}
        height={64}
        borderRadius={32}
        backgroundColor="rgba(255, 85, 26, 0.10)"
        alignItems="center"
        justifyContent="center"
        marginBottom="$4"
      >
        <Icon size={28} color="#FF551A" />
      </View>

      {/* Título */}
      <Text
        fontSize={16}
        fontWeight="800"
        color="$text"
        textAlign="center"
        marginBottom="$2"
      >
        {displayTitle}
      </Text>

      {/* Mensaje */}
      <Text
        fontSize={13}
        color="$textMuted"
        textAlign="center"
        lineHeight={20}
        marginBottom="$5"
      >
        {displayMessage}
      </Text>

      {/* Botón reintentar */}
      {onRetry && (
        <TouchableOpacity onPress={onRetry} activeOpacity={0.75} style={styles.button}>
          <RotateCw size={15} color="#fff" style={{ marginRight: 6 }} />
          <Text fontSize={13} fontWeight="700" color="white">
            {retryLabel}
          </Text>
        </TouchableOpacity>
      )}

      {/* Código de error opcional */}
      {errorCode && (
        <>
          <View
            height={1}
            width="60%"
            backgroundColor="$border"
            marginTop="$4"
            marginBottom="$3"
          />
          <View
            backgroundColor="$backgroundSurface"
            paddingHorizontal="$3"
            paddingVertical={4}
            borderRadius={6}
          >
            <Text fontSize={11} color="$textMuted">
              Error {errorCode}
            </Text>
          </View>
        </>
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF551A',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
  },
})