import React from 'react'
import { YStack, XStack, Text, View } from 'tamagui'
import { Inbox, RefreshCw } from 'lucide-react-native'
import { TouchableOpacity, StyleSheet } from 'react-native'

interface EmptyStateProps {
  title?: string
  message?: string
  onAction?: () => void
  actionLabel?: string
}

export default function EmptyState({
  title = 'Sin datos',
  message = 'No encontramos información para mostrar en este momento.',
  onAction,
  actionLabel = 'Recargar',
}: EmptyStateProps) {
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal="$6"
      paddingVertical="$8"
    >
      {/* MISMO HEADER VISUAL QUE ERROR */}
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

      {/* Ícono estilo error pero “vacío” */}
      <View
        width={64}
        height={64}
        borderRadius={32}
        backgroundColor="rgba(148, 163, 184, 0.15)"
        alignItems="center"
        justifyContent="center"
        marginBottom="$4"
      >
        <Inbox size={28} color="#94A3B8" />
      </View>

      {/* Título */}
      <Text
        fontSize={16}
        fontWeight="800"
        color="$text"
        textAlign="center"
        marginBottom="$2"
      >
        {title}
      </Text>

      {/* Mensaje */}
      <Text
        fontSize={13}
        color="$textMuted"
        textAlign="center"
        lineHeight={20}
        marginBottom="$5"
      >
        {message}
      </Text>

      {/* Botón reutilizando estilo del error */}
      {onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.75} style={styles.button}>
          <RefreshCw size={15} color="$white" style={{ marginRight: 6 }} />
          <Text fontSize={13} fontWeight="700" color="white">
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF551A', // mismo color primario del error
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
  },
})